# 对话记忆与 token 预算

## 目标

这套记忆系统同时解决三个不同问题：

- 页面再次打开时快速显示最近对话。
- MongoDB 保留完整、可审计的原始消息。
- 给模型构建上下文时，在输入预算内优先放入最有价值的信息。

摘要和向量索引都是派生数据。它们可以重建，不能替代 `messages` 事实源。

## 数据分层

| 层 | 内容 | 生命周期 |
| --- | --- | --- |
| LocalStorage | 每个会话最近 10 轮（20 条）完整消息 | 秒开缓存，可淘汰 |
| `messages` | 所有原始 user/assistant 消息 | 主链路同步持久化 |
| `memory_items` | 1200 字符切片、120 字符重叠、Embedding、重要性 | 后台派生，可重建 |
| `memory_summaries` | 摘要、目标、偏好、约束、Embedding、重要性、`sourceMessageIds` | 后台派生，可重建 |
| `conversation_token_states` | 输入压力、累计账单、未摘要增量、任务状态 | 每轮更新 |
| `multi_agent_sessions` | 多 Agent 执行检查点 | TTL 短期状态 |

LocalStorage 常见配额约为数 MiB，但不同浏览器和 origin 的策略不完全相同，因此不能把“5MB”当业务协议。本项目直接按轮数控制；离线产生但还没有同步的旧消息会暂时超出 20 条上限，以避免刷新后丢失。

## 写入链路

```text
用户/助手消息
→ 同步写入 MongoDB messages
→ 返回/继续 SSE 主链路
→ 后台切片
→ Embedding（不可用时保留全文索引）
→ memory_items
```

每轮模型完成后，供应商 usage 和新增原文 token 会写入 `conversation_token_states`。达到阈值时再启动另一个后台任务：

```text
原子抢占 compressionStatus
→ 读取 watermark 之后的旧原文
→ 保留最近 2 轮，不参与长期压缩
→ 本地摘要 Agent 提取 summary/goals/preferences/constraints
→ 为完整结构化摘要生成 Embedding（失败则保留 BM25 降级）
→ 写 memory_summaries（包含 sourceMessageIds）
→ 推进 summarizedThroughMessageId
```

切片/Embedding 已由消息索引任务完成，摘要任务复用原始消息范围和派生检索层。任何后台失败都不能回滚或删除 `messages`。

## token 双账本

```ts
{
  conversationId: "conv-123",
  lastInputTokens: 7200,
  lifetimeBillableTokens: 32500,
  unsummarizedTokens: 4600,
  summarizedThroughMessageId: "msg-88",
  compressionStatus: "idle"
}
```

- `lastInputTokens`：最近一次模型调用的真实输入，判断上下文压力。
- `lifetimeBillableTokens`：所有模型调用 `total_tokens` 的累计，统计成本。
- `unsummarizedTokens`：上次摘要后新增 user + assistant 原文的估算 token。
- `summarizedThroughMessageId`：摘要水位。
- `compressionStatus`：`idle | running | failed`。

`lifetimeBillableTokens` 不能用来判断上下文是否超限，因为历史内容会在多轮调用中重复计费。

OpenAI 兼容接口启用：

```json
{
  "stream": true,
  "stream_options": {
    "include_usage": true
  }
}
```

流解析器会等待最后一个 `choices=[]` 的 usage chunk，再结束请求。Ollama 的 `prompt_eval_count` 和 `eval_count` 会映射到相同结构。供应商没有返回 usage 时才使用本地估算。

## 摘要触发

当前默认满足任一条件时尝试启动：

- `unsummarizedTokens >= 4000`。
- `lastInputTokens >= inputBudget × 65%`。

`inputBudget`：

```text
inputBudget = contextWindow
              - outputReserve
              - ceil(contextWindow × safetyMarginRatio)
```

同一会话通过 MongoDB 原子更新抢占，避免并发生成重复摘要。失败记录错误和 5 分钟后的重试时间；`running` 超过 10 分钟视为可能失联，允许其他 worker 重新抢占。

这些默认值是工程起点，需要结合摘要质量、P95 延迟和费用调整。

## 构建上下文

先扣除固定开销：

```text
historyBudget = inputBudget
                - system prompt
                - 当前 user 消息
                - tools JSON Schema
```

装入顺序：

1. system prompt 和当前问题。
2. 最近 2 轮完整原文，作为强制历史。
3. 原文切片和持久摘要进入同一个 BM25 + Embedding + RRF 候选池。
4. 使用统一 utility 公式计算价值；按 `utility / tokenCost^0.7` 选择。
5. 用 `sourceMessageIds` 惩罚与最近原文、已选候选重复的内容，达到预算后停止。

最近消息按时间顺序发送；摘要作为 system memory 发送。工具 Schema 也占输入 token，不能只计算文本消息。

## 摘要未完成时的降级

```text
摘要可用
→ 最近原文 + 摘要 + 相关记忆

摘要正在生成
→ 最近原文 + 已有摘要/记忆
→ 丢弃低相关、高 token 成本片段
→ 压力仍高且没有摘要时，临时同步压缩或截断

摘要失败
→ 从 messages / memory_items 继续做原文全文或混合检索
```

用户请求从不等待后台摘要。摘要是压缩加速层，不是唯一事实源。

## 检索降级

- Atlas Text/Vector Search 可用：数据库侧缩小候选集。
- Atlas 不可用：在有界候选集内做应用层 BM25 和余弦计算。
- Embedding 不可用：降级到 BM25/关键词。
- `memory_items` 尚未生成：直接查询 MongoDB `messages`。

混合结果使用 RRF 融合，再叠加相关性、时间衰减和重要性。默认权重和候选数只是当前配置，不应描述成通用最优参数。

## 原文与摘要统一计分实现及离线对照

当前默认启用 B，同时保留 A 作为回滚和线上 A/B 对照。设置
`MEMORY_UNIFIED_SCORING=false` 可切回 A：

- A（旧链路）：原文使用 BM25 + Embedding + RRF；摘要使用关键词重合；最后按 `score / tokens` 装箱。
- B（当前默认）：原文和摘要共同进行 BM25 + Embedding + RRF，使用同一个 utility 公式，再按 `utility / tokens^0.7` 装箱。

B 在仓储层只生成一次 query embedding；新摘要写入时同时保存摘要 embedding。旧摘要没有 embedding 也能继续走 BM25，因此升级不要求停机回填。仓储层返回统一候选后，上下文层先扣除最近两轮的 token，再进行带来源重叠惩罚的预算装箱。

B 的共同公式包含：

```text
utility = retrieval relevance
          + source fidelity
          + information density
          + source coverage
          - redundancy penalty
```

它仍允许原文和摘要拥有不同的特征值：原文的事实保真度更高，摘要的信息密度和覆盖率更高。统一的是公式和量纲，不是强行假设两类数据完全相同。

固定样本覆盖精确日期、语义偏好、来源重复和精确错误码。实验结果：

| 指标 | A：分开计分 | B：统一计分 |
| --- | ---: | ---: |
| 证据召回 | 62.5% | 100% |
| 精确原文召回 | 0% | 100% |
| 重复 token 比例 | 17.9% | 0% |
| 平均预算利用率 | 57.1% | 77.1% |

第一轮统一计分只达到 87.5% 证据召回和 50% 精确原文召回，原因是“原文可靠性”错误奖励了一个零相关的短原文。增加相关性门槛后才得到上表结果。这说明统一计分必须满足：

1. BM25、向量和其他信号先在共同候选集内归一化。
2. 零相关候选不能靠类型、重要性或低 token 成本进入上下文。
3. 日期、数字、错误码、路径、版本和“原话”查询要提高原文保真权重。
4. 使用 `sourceMessageIds` 做覆盖去重，避免摘要和其来源原文无意义地重复占预算。
5. token 成本使用次线性惩罚，避免极短碎片天然碾压完整证据。

结论：两类候选可以共用一个计分公式，但不能只用简单的“相关性 / token”。代码已经默认接入统一链路，但上表仍只来自 4 组人工构造的回归样本，只证明实现方向可行，不能当作生产收益结论。正式扩大流量前仍需要真实脱敏会话、人工证据标签、更多预算档位和不同 Embedding 模型的评测；出现回归时可通过环境变量立即切回旧链路。

## 关键代码

- `src/utils/conversation/secureConversationCache.ts`
- `api/_clean/domain/services/token-budget.ts`
- `api/_clean/domain/services/memory-candidate-scoring.ts`
- `api/_clean/application/services/conversation-memory-indexer.ts`
- `api/_clean/application/services/conversation-memory-maintenance.ts`
- `api/_clean/application/use-cases/memory/get-conversation-context.use-case.ts`
- `api/_clean/infrastructure/repositories/memory.repository.ts`
- `api/handlers/stream-adapter.ts`

## 验证

```bash
npx tsc --noEmit
npm run test:jest -- --runInBand \
  test/jest/conversation-memory-budget.test.ts \
  test/jest/memory-hybrid.test.ts \
  test/jest/memory-scoring-experiment.test.ts
```

测试覆盖 token 预留、统一候选链路、候选装箱、来源重叠惩罚、带来源 ID 的摘要持久化、OpenAI usage-only chunk、Ollama usage 映射、混合检索和当前用户消息去重。

## 生产化边界

当前后台摘要通过 BFF 进程内异步任务启动，适合单体和个人项目。多实例或高可靠场景应升级为持久队列/Outbox，并增加：

- 至少一次投递与幂等消费。
- 死信、重试、任务积压和耗时监控。
- Embedding/摘要模型版本迁移。
- 摘要事实一致性和关键证据召回评测。
- 用户主动删除时，原文与派生层的级联 tombstone。
