# 远程模型负载调度优化 — 智能路由 + 分级缓存 + 上下文压缩

## 一、问题背景

项目使用火山引擎豆包作为远程模型（`doubao-1-5-thinking-pro`），token 按量计费。在实际使用中暴露了三个问题：

1. **所有远程请求都走同一个 premium 模型**：简单问候和复杂分析消耗相同的 token 单价，造成大量浪费。
2. **现有语义缓存不够灵活**：阈值 0.95 过于严格导致命中率低；用户有时想对同一问题得到不同角度的回答，纯缓存直接返回不满足需求。
3. **上下文发送未做优化**：完整的历史对话 + 全量工具 schema 每次都发给远程模型，input token 消耗大。

### 目标

在尽量不影响用户体验的前提下，降低远程模型 token 消耗 50-80%。

---

## 二、调研与方案选型

### 调研过程

围绕"LLM token 成本优化"搜索了 Web 和 GitHub 高 star 项目，核心搜索关键词：

- `LLM token cost optimization strategies semantic caching routing small large model`
- `GitHub high star LLM router model cascade semantic cache token optimization`
- `LLM request routing small model large model cascade reduce API cost open source`
- `LLM prompt compression token reduction technique LLMLingua`

### 业界核心方案总结

调研结果显示，业界将 LLM 成本优化归纳为三个主轴：**路由 (Routing)**、**缓存 (Caching)**、**压缩 (Compression)**，三者组合可实现 47-80% 的成本降低。

#### 参考项目深度分析

**1. [RouteLLM](https://github.com/lm-sys/RouteLLM) — lm-sys / UC Berkeley（4.7k stars）**

核心思路是训练一个轻量分类器，判断请求该路由到 expensive model 还是 cheap model。论文实验显示：在 MT Bench 上保持 95% GPT-4 质量的前提下，只需 26-54% 的 GPT-4 调用量，成本降低 70-85%。

对本项目的启发：
- 分类器思路直接适用，但 RouteLLM 需要大量偏好数据训练，我们用规则分类器替代（零训练成本）
- "strong model + weak model" 二元路由的架构直接借鉴

**2. [vLLM Semantic Router](https://github.com/vllm-project/semantic-router)（3.4k stars）**

系统级 Mixture-of-Models 路由器，支持语义路由 + 语义缓存。2025 年 10 月发表论文 "Category-Aware Semantic Caching for Heterogeneous LLM Workloads"。

对本项目的启发：
- 语义缓存不只是"命中就返回"，可以分等级处理
- 缓存决策本身也可以缓存（decision caching），减少重复分类开销

**3. [LLMLingua](https://github.com/microsoft/LLMLingua) — Microsoft Research（4k+ stars）**

用小模型的 perplexity 度量来识别和删除 prompt 中的冗余 token，实现最高 20x 压缩率。核心组件包括 Budget Controller（各 prompt 段分配不同压缩率）和 Token-level Iterative Compression。

对本项目的启发：
- "用小模型压缩大模型的输入"的思路直接借鉴
- 我们的场景不需要 token 级压缩（太重），用本地模型做对话摘要即可

**4. [LiteLLM](https://github.com/BerriAI/litellm)（18k+ stars）**

统一 LLM Gateway，100+ 模型 provider 的统一接口，内置路由、缓存、监控、限流。

对本项目的启发：
- 验证了"Gateway 层做路由+缓存"是成熟架构模式
- 但我们项目体量不需要引入完整 Gateway，在应用层实现即可

**5. 其他参考**

- [Anyscale LLM Router](https://github.com/anyscale/llm-router)：用 causal-LLM 分类器做路由，MT Bench 上 70% 成本降低
- [OmniRouter](https://arxiv.org/html/2502.20576v6)：将路由建模为约束优化问题，精度提升 6.3% 同时成本降低 10%+
- Mavik Labs 2026 年报告：路由+缓存+批处理三板斧，生产系统 47-80% 成本降低

### 方案决策

| 维度 | 业界方案 | 本项目选择 | 取舍理由 |
|------|---------|-----------|---------|
| 路由分类 | 训练分类器（RouteLLM） | 规则分类器 | 零训练成本，可逐步迭代到模型辅助 |
| 路由粒度 | 二元路由 (strong/weak) | 三层路由 (local/lite/premium) | 本地模型零成本，多一层省更多 |
| 缓存策略 | 语义缓存命中直接返回 | 三级缓存 (L1直返/L2变体/L3未命中) | 解决"用户想要不同回答"的矛盾 |
| Prompt 压缩 | token 级压缩（LLMLingua） | 对话摘要（本地模型） | 实现简单，对话场景够用 |
| 工具定义 | 无现成方案 | 三层分类瘦身 | 自研，针对项目工具系统定制 |

---

## 三、方案设计

### 整体架构

```
用户请求 (modelType=volcano)
    │
    ├─ 1. 语义缓存检查（三级策略）
    │     ├─ L1 (>=0.98): 直接返回
    │     ├─ L2 (>=0.88): 本地模型改写变体后返回
    │     └─ L3 (<0.88): 未命中，继续
    │
    ├─ 2. 请求复杂度分类（规则驱动）
    │     ├─ simple + 高置信度 → 本地模型处理（零远程消耗）
    │     ├─ simple → remote-lite (doubao-seed-1-6-lite)
    │     ├─ moderate → remote (doubao-thinking-pro)
    │     └─ complex → remote (doubao-thinking-pro)
    │
    ├─ 3. 上下文压缩
    │     ├─ 最近 2 轮：保持原文
    │     └─ 更早历史：本地模型摘要化
    │
    ├─ 4. 工具定义瘦身（三层分类）
    │     ├─ 闲聊 → 零工具
    │     ├─ 意图匹配 → 相关工具 + 基础工具集
    │     └─ 兜底 → search_web + get_current_time
    │
    └─ 5. 动态 max_tokens
          └─ 根据请求复杂度调整 500~4000
```

### 远程模型配置

项目仅保留两个远程模型，分工明确：

| 模型 | 用途 | costTier | capabilityTier | 特性 |
|------|------|----------|---------------|------|
| `doubao-1-5-thinking-pro-250415` | 复杂推理/分析 | 3 (premium) | 3 | 支持工具调用 |
| `doubao-seed-1-6-lite-251015` | 简单对话/低成本路由 | 1 (lite) | 1 | 支持多模态（vision）、reasoning_effort 可调 |

### 策略一：智能模型路由（Local-first Cascade）

**核心思路**：参考 RouteLLM，用规则分类器判断请求复杂度，简单请求直接本地处理或用低价模型。

分类器使用纯规则方式（零额外开销）：

| 模式 | 判定条件 | 路由目标 |
|------|---------|---------|
| 问候/闲聊 | 正则匹配 `你好/hi/hello...` | 本地模型 |
| 简单问答 | 长度 < 80 + 简单问题模式 | remote-lite (doubao-seed-1-6-lite) |
| 多轮短追问 | 上下文 > 4 条 + 当前消息 < 100 字 | remote-lite (doubao-seed-1-6-lite) |
| 中等复杂度 | 80~800 字 或匹配中等指标 | 标准远程模型 (doubao-thinking-pro) |
| 复杂分析 | 命中 >=2 个复杂指标 或 > 800 字 | premium 远程模型 (doubao-thinking-pro) |

**安全机制**：
- 置信度 < 0.7 时默认走标准远程模型（保守策略）
- 可通过 `ENABLE_LOCAL_FIRST=false` 关闭 local-first 功能
- 本地模型不可用时自动 fallback 到远程 lite

### 策略二：三级语义缓存

解决"用户想要不同回答"的核心矛盾：

| 等级 | 相似度 | 行为 | 远程 token 消耗 |
|------|--------|------|----------------|
| L1 | >= 0.98 | 直接返回缓存（打字机效果） | 0 |
| L2 | >= 0.88 | 缓存作为参考，本地模型改写变体 | 0 |
| L3 | < 0.88 | 走正常模型调用 | 正常 |

**智能降级**：同一缓存被命中 >= 3 次后，自动从 L1 降级到 L2（提供变体），避免用户反复看到一模一样的回答。

阈值可通过环境变量调整：`CACHE_L1_THRESHOLD`、`CACHE_L2_THRESHOLD`。

### 策略三：上下文压缩

用本地模型将早期对话历史摘要化，减少发给远程模型的 input token：

| 消息位置 | 处理方式 |
|---------|---------|
| 最近 2 轮（4 条消息） | 保持原文 |
| 第 3 轮及更早 | 本地模型压缩为摘要 |

摘要结果有进程内缓存（10 分钟 TTL），同一对话的后续请求不需要重复生成。

对话消息 <= 8 条时不触发压缩（没有必要）。

### 策略四：工具定义瘦身（三层分类）+ 动态 max_tokens

#### 工具瘦身 V1 → V2 的迭代过程

**V1（初版，纯关键词白名单）**：根据用户消息中的关键词匹配工具类别，无命中则返回全量工具。

上线后发现两个问题：

| 输入 | 期望 | V1 实际 | 问题根因 |
|------|------|---------|---------|
| "你好" | 不需要任何工具 | 全部 9 个（fallback 全量） | 闲聊没有关键词 → 走 fallback |
| "今天天气怎么样" | search_web | 4 个时间工具 | "今天"误触发时间类关键词，漏掉搜索 |
| "帮我查一下北京房价" | search_web | 全部 9 个 | "查一下"不在搜索关键词中 |

根本原因：关键词白名单是**双向脆弱**的——对无意图的消息误触发全量 fallback，对有隐含意图的消息只命中字面关键词而漏掉真正需要的工具。

**V2（当前版，三层分类）**：

```
Layer 1: 闲聊检测 → 短消息 + 闲聊模式 → 返回 []（零工具）
Layer 2: 意图模式匹配 → 命中特定工具组（始终附带基础工具集）
Layer 3: 兜底 → search_web + get_current_time
```

关键改进点：
- **时间关键词收窄**：去掉"今天/明天/昨天"等泛词，只保留"现在几点/什么时间/日期计算/时区"等明确时间意图
- **搜索关键词大幅扩展**：加入"查一下/看看/天气/怎么样/价格/推荐/排名/教程/攻略"等隐含搜索意图
- **基础工具集始终附带**：`search_web` + `get_current_time` 作为安全网。`get_current_time` 必须保留是因为**模型的时间认知停留在训练截止日期**，不给它就无法正确回答任何涉及"现在/今天"的问题
- **闲聊检测作为最高优先级**：问候、感谢、确认类消息不需要任何工具

V2 效果对比：

| 输入 | V1 | V2 |
|------|-----|-----|
| "你好" | 全部 9 个 | 0 个（闲聊检测） |
| "今天天气怎么样" | 4 个时间工具 | search_web + get_current_time |
| "帮我查一下北京房价" | 全部 9 个 | search_web + get_current_time |
| "3天后是什么日期" | 4 个时间工具 | 4 时间 + search_web + get_current_time |
| "帮我制定学习计划" | 4 个计划工具 | 4 计划 + search_web + get_current_time |

#### 动态 max_tokens

取代之前固定的 4000：

| 请求类型 | max_tokens |
|---------|-----------|
| 短问候 | 500 |
| 简单问答 (< 60 字) | 1000 |
| 中等请求 (60-300 字) | 2000 |
| 较长请求 (300-1000 字) | 3000 |
| 长文本分析 (> 1000 字) | 4000 |

---

## 四、实现细节

### 修改的文件

| 文件 | 改动 |
|------|------|
| `models.config.ts` | 远程模型增加 `costTier` / `capabilityTier` 字段；新增 `getRemoteModelByTier()`；仅保留 thinking-pro + seed-lite 两个远程模型 |
| `api/_clean/infrastructure/llm/providers/registry.ts` | 自动注册 `remote-lite` Provider (doubao-seed-1-6-lite-251015) |
| `api/_clean/infrastructure/llm/model-service.ts` | 新增 `estimateMaxTokens()`、`callRemoteLiteModel()`；`callVolcengineModel` 使用动态 maxTokens |
| `api/_clean/infrastructure/llm/request-classifier.ts` | **新文件** — 规则驱动的请求复杂度分类器 |
| `api/_clean/infrastructure/llm/context-compressor.ts` | **新文件** — 本地模型摘要压缩器（带进程内缓存） |
| `api/_clean/infrastructure/cache/request-cache.service.ts` | `findCachedResponse` 返回 `hitLevel` (L1/L2/L3)；三级阈值可配置 |
| `api/handlers/cacheHandler.ts` | 重构为三级缓存策略；L2 调用本地模型生成变体 |
| `api/handlers/singleAgentHandler.ts` | 远程模型解析 `usage` 字段上报 metrics；本地模型估算 token 并上报 |
| `api/lambda/chat.ts` | volcano 分支加入分类器路由、local-first cascade、工具瘦身 |
| `api/tools/core/registry/tool-registry.ts` | `getRelevantSchemas()` 三层分类：闲聊检测 → 意图匹配 → 基础工具兜底 |

### 关键代码片段

**请求复杂度分类器** (`request-classifier.ts`)：

```typescript
export function classifyRequest(
  messages: ChatMessage[],
  options?: { forceLevel?: ComplexityLevel }
): ClassificationResult {
  // 1. 规则层：正则匹配问候、简单问答、复杂指标
  // 2. 多轮短追问检测
  // 3. 无法确定 → 默认 moderate（保守策略）
  // 返回: { level, confidence, reason, suggestedTier }
}
```

**chat.ts 路由逻辑**：

```typescript
const classification = classifyRequest(messages);

if (enableLocalFirst && classification.level === 'simple' && classification.confidence >= 0.8) {
  // 简单请求 → 本地模型
  const stream = await callLocalModel(messages, { tools });
  return handleLocalStream(stream, ...);
}

if (classification.suggestedTier === 1) {
  // Tier 1 → remote-lite
  stream = await callRemoteLiteModel(messages, { tools });
} else {
  // Tier 2/3 → 标准远程模型
  stream = await callVolcengineModel(messages, { tools });
}
```

**三级缓存判定** (`request-cache.service.ts`)：

```typescript
if (sim >= thresholds.L1 && hitCount < 3) {
  hitLevel = 'L1';  // 直接返回
} else if (sim >= thresholds.L2) {
  hitLevel = 'L2';  // 本地模型改写变体
}
// 否则 L3 未命中
```

**工具瘦身三层分类** (`tool-registry.ts`)：

```typescript
// Layer 1: 闲聊 → 零工具
if (text.length < 20 && NO_TOOLS_PATTERN.test(text)) return [];

// Layer 2: 意图匹配（收窄时间关键词、扩展搜索关键词）
if (/现在几点|什么时间|日期计算|时间差|时区/.test(text)) { /* 时间工具 */ }
if (/搜索|查一下|看看|天气|推荐|怎么做|价格/.test(text)) { /* 搜索工具 */ }
if (/计划|任务|安排|todo|待办/.test(text)) { /* 计划工具 */ }

// Layer 3: 基础工具集始终附带（模型需要感知真实时间）
matched.add('search_web');
matched.add('get_current_time');
```

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `ARK_LITE_MODEL` | `doubao-seed-1-6-lite-251015` | lite 远程模型名称 |
| `ENABLE_LOCAL_FIRST` | `true` | 是否启用 local-first cascade |
| `CACHE_L1_THRESHOLD` | `0.98` | L1 精确缓存阈值 |
| `CACHE_L2_THRESHOLD` | `0.88` | L2 变体缓存阈值 |

---

## 五、效果验证

### 预估节省

| 策略 | 预估 token 节省 | 用户体验影响 |
|------|----------------|-------------|
| Local-first Cascade | 40-60% 的简单请求零远程消耗 | 简单问题响应更快 |
| Lite 模型分级 | 剩余请求中 30% 用 lite 模型 | 基本无感知 |
| 三级语义缓存 | 额外 15-25% 请求避免远程调用 | L2 变体保持回答多样性 |
| 上下文压缩 | 每次请求 input token 减少 30-50% | 极少数情况可能丢失早期细节 |
| 动态 max_tokens | output token 平均减少 30% | 简单问题回复更精炼 |
| 工具定义瘦身 | input token 减少约 200-500/次 | 无感知 |

**综合预估**：远程模型 token 消耗降低 **50-80%**。

### 验证方法

1. **Token 追踪基线**：`handleVolcanoStream` 已接入 `recordLLMRequest`，可从 `/api/metrics` 端点查看：
   - `llmRequestCount`：总请求数
   - `llmTokensUsed`：总 token 消耗
   - `llmRequestDuration`：延迟分布

2. **分类器命中统计**：控制台日志 `📊 分类结果: simple/moderate/complex`，可 grep 统计分布。

3. **缓存命中率**：响应头 `X-Cache-Hit-Level: L1/L2`，前端 init 事件中的 `cacheHitLevel` 字段。

4. **A/B 对比**：通过 `ENABLE_LOCAL_FIRST=false` 可关闭智能路由，对比前后 token 用量。

### 后续迭代方向

- 分类器升级为本地模型辅助分类（当规则置信度 < 0.6 时调用 qwen3:8b 做二次判断）
- Token 用量持久化到 MongoDB，支持按天/周维度的成本看板
- 上下文压缩结果从进程内缓存迁移到 Redis，支持多实例部署
- L2 变体缓存写回 Redis，避免相同问题反复调用本地模型改写
