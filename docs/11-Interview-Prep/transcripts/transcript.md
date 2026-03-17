## 演讲稿总览（按 PPT 顺序）

> 本稿是“可直接照着讲”的版本：每一段按 **背景 → 问题 → 方案 → 关键细节 → 取舍/效果 → 追问准备** 展开。

- **P1 多工具、工具流编排**：从 Prompt/AgentExecutor 的不稳定，演进到 Function Calling + 插件化工具系统（限流/缓存/熔断一体化）。
- **P2 SSO 单点登录设计（OIDC + BFF）**：授权码 + PKCE + state/nonce + CSRF/浏览器绑定 + 一次性消费锁 + 完整 logout。
- **P3 多 Agent 思考与协作**：Planner/Critic/Host/Reporter 的分工与收敛；统一 JSON 协议；支持断线恢复。
- **P4 用户友好体验**：SSE 流式输出 + 可中断 + i18n/主题 + 断线重连排队提示。
- **P5 工程亮点：服务端行为预测与防范**：指数退避重试 + 双层队列回压 + 防惊群/防刷 + 熔断与限流。
- **P6 工程亮点：用户侧行为预测与防范**：虚拟列表 + 多级缓存 + 加密 + 大文本容错与渐进式传输/渲染。
- **P7 项目结构 & LLM 侧防范**：分层/可替换；embedding 命中节省 token；JSON 修复兜底。

---

## P1 业务亮点：多工具、工具流编排

### 背景：为什么“一个请求”会变成“多步工具流”

我的项目实现了工具调用，并提供联网搜索、时间、计划等工具，支持“工具流”的线性多步调用。  
典型业务场景是：用户一句话里包含多个隐含步骤，例如：

- “你搜索网络，帮我制定一个新手小白学习乒乓球的 3 个月计划，下个星期开始”

这里至少隐含了 3 类能力：

1. **联网搜索**：需要实时信息/资料来源
2. **真实时间**：用户说“下周开始”，但模型往往把训练集日期当“现在”
3. **计划可编辑/可持久化**：计划天然有 CRUD，用户会反复修改周期/开始日期

### V1：Prompt + LangChain.js（遇到的瓶颈）

最初采用 LangChain 的 `AgentExecutor`，主要基于 Prompt 解析：

- Prompt 中描述工具与使用格式
- LangChain OutputParser 解析模型返回
- ReAct（Reasoning → Action → Observation）驱动多步执行

但真实落地遇到 4 个核心问题：

1. **模型幻觉 / 格式不稳定**：经常因为格式错误调用失败  
   - 例如返回 `"<tool_call>search_web AI技术</tool_call>"`  
   - 或直接编造工具名（“调用 search_ai 工具”）
2. **多步执行不可靠**：用户说“列计划 → 查详情 → 更新”，模型只做第一步就停
3. **Token 消耗高**：每次都要把工具说明、示例格式塞进上下文（平均 ~1200 tokens/次）
4. **依赖偏重**：LangChain 打包后体积增加（约 2.3MB），对前端/边缘场景不友好

### V2：自定义编排 + Function Calling（稳定落地）

重构的转折点是：Function Calling 让模型返回结构化 JSON，工具名与参数更可控。  
我们重写工具系统，核心改进：

1. **迁移到 Function Calling + JSON Schema**  
   - 工具定义变成 schema  
   - 参数自动验证  
   - 格式错误显著减少，避免“调用不存在工具”
2. **自定义工具编排器（约 300 行）**  
   - 解析依赖关系（拓扑排序）  
   - 支持变量引用：`${step1.data.field}`  
   - 失败策略：`abort / continue / retry`
3. **插件式架构**  
   - 每个工具独立插件，注册即用  
   - 统一接入执行器的“保护能力”
4. **三层保护机制（工程化落地）**  
   - **限流**：并发 + 频率（滑动窗口）  
   - **缓存**：搜索结果 5 分钟 TTL（减少重复外部调用）  
   - **熔断**：连续失败阈值触发熔断，避免雪崩

### 取舍与追问准备

- **为什么不用 LangChain**：V1 的 4 个问题（不稳定、多步不可靠、token 成本高、依赖重）是决定性原因
- **为什么 schema 像“数据驱动 UI”**：schema 是合同，调用方/前端不需要硬编码字段；用 map/registry 把 schema 映射到执行逻辑

### 代码落点（讲完能落到代码）

- 工具插件：`api/tools/v2/plugins/*`
- 执行器（限流/缓存/熔断/降级链）：`api/tools/v2/core/execution/tool-executor.ts`
- 缓存与 key 策略：`api/tools/v2/core/cache/*`

---

## P2 业务亮点：SSO 单点登录设计（OIDC + BFF）

### 开发故事：这是多轮迭代的产物（从“单机防刷”到“标准 OIDC + 安全加固”）

我一开始做的不是“完整 SSO”，而是**先把业务跑起来 + 先做单机防刷**：  
因为早期目标是让聊天/工具接口别被随便打爆，所以先在 BFF 层做了**单机限流/熔断/重试**这类保护（当时默认单机部署，先解决 80% 的风险）。

后来面试官/同事会追问：**“那登录怎么做？token 放哪？安全怎么保证？”**  
这时我才把“认证”从临时方案升级为**标准化的 OIDC 登录 + BFF 架构**，并且是按问题驱动一步步补齐的：

#### 第 1 轮：先定架构目标 —— “前端不持有 token”

很多 demo 会把 access_token/JWT 存 localStorage，但一旦出现 XSS，token 很容易被窃取并长期冒用。  
所以我选择 **BFF（Backend for Frontend）代管 token**：浏览器只拿 **HttpOnly session cookie**，token 全在后端（Redis session）里托管。

#### 第 2 轮：按标准落地 OIDC —— 授权码模式 + PKCE + state/nonce

- **Authorization Code Flow**：IdP 回传 `code`，BFF 再用 `code` 去换 token
- **PKCE（S256）**：`code_verifier` 只存后端，浏览器只看到 `code_challenge`
- **state / nonce**
  - `state`：防伪造回调（CSRF 防护的一部分）
  - `nonce`：防止 `id_token` 重放

#### 第 3 轮：发现“BFF 用 cookie 表达登录态”后，必须补 CSRF

我做了一套 **CSRF 组合拳**：SameSite + Origin/Referer + Session-bound CSRF（写接口必须带 `X-CSRF-Token`）。  
这点是面试时很加分的：**“token 不落前端 ≠ 不用管 CSRF”**。

#### 第 4 轮：线上真实边界问题 —— 防“抢登（callback race）”+ 并发/重放细节

只做 PKCE/state 还不够：如果 `code/state` 回调链接泄露，攻击者可能抢先打你的 callback。  
我的做法是把 login state **绑定到发起登录的浏览器**：

- 发起登录时给浏览器一个 `HttpOnly csrfSid`
- login state 存 Redis 时把 `csrfSid` 一起存
- callback 必须带同一个 cookie 才放行
- 即便 code/state URL 泄露，外部拿不到 cookie 也抢不到登录态

同时我加了**一次性消费锁**处理并发/重放细节：

- callback **先校验 `csrfSid`**，再抢 `state lock`（NX + TTL）
- 抢到锁后立刻删除 login state，保证 `state/nonce/code_verifier` 用完即删

#### 第 5 轮：补齐“完整登出语义”（很多人会漏）

只清 BFF session 还不够，IdP 可能仍保留登录态。  
所以我支持 **RP-Initiated Logout**：清 BFF + 跳 IdP `end_session_endpoint` + 回跳站内兜底清 cookie。

### 面试官高频追问（我一般这样回答）

- **为什么要 BFF**：token 不落前端，降低 XSS 风险；但写接口仍要 CSRF 防护
- **state vs nonce 区别**：state 主要防回调伪造/CSRF，nonce 主要防 id_token 重放
- **PKCE 解决什么**：防 code 被偷后“拿去换 token”；但还要做浏览器绑定防抢登
  - 补一句更像“工程实践”：**标准协议解决“协议内风险”，真实系统还要补“上下文绑定/并发细节”**

### 代码落点（讲完能落到代码）

- BFF OIDC 工具（PKCE/state/nonce/session/JWKS 验签）：`api/lambda/_utils/bffOidcAuth.ts`
- 登录入口与回调：`api/lambda/auth/login.ts`、`api/lambda/auth/callback.ts`
- 登出：`api/lambda/auth/logout.ts`、`api/lambda/auth/logout/callback.ts`
- IdP（oidc-provider）：`idp/server.ts`
- 面试流程稿（含 PPT 流程图）：`docs/interview_possible_questions/interview_transcript/OauthProcess.md`

---

## P3 业务亮点：多 Agent 思考与协作

### 背景：为什么要多 Agent

单模型经常“一个脑袋想到底”，容易过度乐观或漏掉关键风险。  
我把“方案制定”拆成多角色协作：**提案 → 质询 → 决策 → 总结**，让输出更稳、更可解释。

### 角色与职责（如何避免互相重复）

- **Planner（规划师）**：输出结构化计划（阶段/任务/时间估算）
- **Critic（批评家）**：专门找漏洞、边界条件、反例
- **Host（主持人）**：综合取舍，做最终决策
- **Reporter（报告员）**：把共识与风险点提炼成最终答复（不是拼接）

### 成本与稳定性控制

- **轮次硬上限**：到上限强制总结，避免 token 失控与用户等待过久
- **统一 JSON 协议**：Agent 间通过结构化 `AgentOutput` 传递上下文，避免“靠字符串拼 prompt”
- **断线恢复**：中间轮次状态可恢复（用户断线重连仍能继续）

### 代码落点

- orchestrator：`api/workflows/multiAgentOrchestrator.ts`
- agent 定义：`api/agents/*`、`api/agents/baseAgent.ts`
- SSE 事件协议与 UI 更新：`api/handlers/multiAgentHandler.ts` + `src/hooks/data/useSSEStream/*`

---

## P4 业务亮点：用户友好体验

### 体验目标

对话类产品“用户友好”其实是三件事：

1. **反馈快**：尽快看到输出（TTFT 低）
2. **可控**：用户随时能停、能重连、能看见排队/进度
3. **专业**：国际化、主题一致，演示不掉价

### 我们怎么做

- **SSE 流式输出**：用户不必等完整答案，边生成边展示
- **AbortController 可中断**：用户点击停止时立刻 cancel，节约 token 与服务器资源
- **排队提示**：当 SSE 并发满返回 429，前端解析 `Retry-After` 与 queue 信息展示排队位次
- **国际化与主题**：
  - i18next：按模块组织翻译文件 + 语言检测与持久化
  - Zustand：浅色/深色/跟随系统，并做“防闪烁”

```ts
const mediaQuery = matchMedia('(prefers-color-scheme: dark)');
mediaQuery.matches; // true=深色, false=浅色
mediaQuery.addEventListener('change', (e) => console.log(e.matches));
```

### 代码落点

- SSE 流与重连：`src/hooks/data/useSSEStream/index.ts`
- 多 agent SSE 事件处理：`src/hooks/data/useSSEStream/multi-agent-handlers.ts`
- 主题与 i18n：`src/i18n/*`、`src/stores/*`（Zustand）

---

## P5 工程亮点：服务端行为预测与防范（高并发/断线重连）

### edge case：为什么会出问题

高并发场景（例如 200–500 人同时使用、多数用户断线重连）下，最容易被打爆的有两层：

- **入口 SSE 长连接**（本地连接数、内存、写流压力）
- **下游 LLM 调用**（并发与 RPM、外部依赖、成本）

### 我们的核心方案

1. **指数退避重试 + jitter**：避免所有客户端同一秒重试造成惊群
2. **双层队列回压**（重点）
   - **第 1 层：SSE 并发队列（入口层）**  
     - 并发满返回 `429 + Retry-After + X-Queue-Token`  
     - token 保持队列位置，jitter 防惊群
   - **第 2 层：LLM 请求队列（下游层）**  
     - 优先级调度（Host > Planner > Critic > Reporter）  
     - 并发 + RPM 双限制
3. **熔断与限流**：对外部工具/依赖失败快速降级，避免级联故障

### 面试追问准备

- “队列缺点？”：尾延迟上升、公平性、多实例扩展性 → 用“有界队列 + 超时/取消 + jitter + 指标”回答
- “为什么不用无限队列？”：无限队列会拖垮内存与延迟，最终还是雪崩

### 代码落点

- SSE limiter：`api/_clean/infrastructure/streaming/sse-limiter.ts`
- SSE queue：`api/_clean/infrastructure/queue/queue-manager.ts`
- LLM queue：`api/_clean/infrastructure/llm/llm-request-queue.ts`
- 工具限流/熔断：`api/tools/v2/core/limits/*`、`api/tools/v2/core/resilience/*`

---

## P6 工程亮点：用户侧行为预测与防范（不卡、不丢、不爆内存）

### 典型问题

- 长对话导致 DOM 爆炸、渲染卡顿
- 大文本/Markdown 截断导致渲染白屏
- 大文件上传容易失败、重试成本高
- 本地缓存泄露（localStorage 被读）带来隐私风险

### 我们怎么做

1. **虚拟列表**：`react-virtuoso`，长列表仍能流畅滚动
2. **多级缓存协同**：LocalStorage 秒开 → MongoDB 拉最新 → 合并无闪更新；配合 LRU 控制容量
3. **数据加密**：AES-GCM + 设备绑定密钥（设备指纹派生）（MD5加密），localStorage 被窃也难直接复用
4. **Markdown 容错**：修复截断代码块/表格 → 备用渲染兜底 → 保证不白屏
5. **渐进式传输**：<10KB 直传；10KB–5MB gzip；>5MB 分片断点续传
6. **渐进式渲染**：超大内容分批渲染 + 进度提示

---

## P7 项目结构 & LLM 侧防范（可维护、可扩展、可控成本）

### 结构：为什么这样拆

- 后端按 use case / repository / infrastructure 分层：便于替换 Redis/Mongo/外部依赖，也便于测试
- 前端按基础组件/业务组件拆分，自定义 hooks 复用
- 抽象原则：同类逻辑出现 ≥2 次且预期继续复用才抽象，避免过度设计

### LLM 侧防范：稳定性与成本

1. **Embedding 命中节省 token**  
   - 用户重复问相似问题：向量化 + 余弦相似度阈值命中  
   - 命中后直接返回 Redis 缓存响应，减少模型调用与等待
2. **统一协议（AgentOutput）**  
   - agent_id / round / output_type / content / metadata / timestamp  
   - 上层 orchestrator 可以稳定聚合/恢复/回放
3. **JSON 修复兜底**  
   - `jsonrepair` → 自定义修复 → 语义兜底  
   - 保证讨论/工具流不中断

### 代码落点

- embedding 缓存：`api/_clean/infrastructure/cache/request-cache.service.ts`、`api/_clean/infrastructure/cache/redis-embedding-cache.ts`
- JSON 修复：`jsonrepair`（依赖）+ 你们工具/协议层的兜底逻辑