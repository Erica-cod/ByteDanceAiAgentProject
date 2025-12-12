# AI Agent - 兴趣教练

基于 Modern.js 构建的 AI Agent 应用，支持本地 Ollama 模型和火山引擎豆包大模型。
项目飞书文档链接：https://hcnc2lw3s2mc.feishu.cn/wiki/CGiwwfb1oijb0Mk2y2McTG0ynVf?from=from_copylink

## 特性

-  Modern.js 全栈框架
-  SSE 流式响应
-  Markdown 渲染支持（代码高亮）
-  本地 Ollama 模型集成
-  **火山引擎豆包大模型** - 在线大模型支持
-  **Tavily 联网搜索** - AI 自主判断并调用搜索工具
-  MongoDB 持久化存储
-  多对话管理
-  Docker 容器化部署
-  Jenkins CI/CD 自动化流水线

## CI/CD 状态

 **自动化部署已配置**
- Jenkins Pipeline:  运行中
- GitHub Webhook:  已激活
- 自动构建触发:  启用

###  相关文档
- [完整部署指南](./DEPLOYMENT_GUIDE.md) - Jenkins 和 Docker CI/CD 配置
- [ngrok Webhook 配置指南](./docs/NGROK_GITHUB_WEBHOOK_GUIDE.md) - 本地开发环境接收 GitHub webhook
- [Tavily 搜索工具指南](./docs/TAVILY_SEARCH_GUIDE.md) - AI 联网搜索功能配置和使用
- [火山引擎豆包大模型指南](./docs/VOLCENGINE_DOUBAO_GUIDE.md) - 火山引擎在线大模型集成和使用
- [数据库设计文档](./docs/DATABASE_DESIGN.md) - MongoDB 数据模型和API设计

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建
npm run build

# 启动生产服务
npm run serve
```

## Docker 部署

```bash
# 构建镜像
npm run docker:build

# 运行容器
npm run docker:run

# 查看日志
npm run docker:logs

# 停止容器
npm run docker:stop
```

## 技术栈

- **前端**: React + Modern.js + TypeScript
- **后端**: Modern.js BFF (Hono)
- **AI模型**: 
  - 本地模型：Ollama (DeepSeek-R1)
  - 在线模型：火山引擎豆包大模型
- **搜索**: Tavily API
- **数据库**: MongoDB
- **部署**: Docker + Jenkins
- **样式**: CSS Modules
- **Markdown**: react-markdown + highlight.js

- 项目的结构开发大体分为四个功能实现阶段：
0. CI/CD集成阶段：项目开发使用jenkins开源工具构建开发pipeline，自动监听并从github main分支下拉取代码打包为docker镜像发布，实现开发与生产环境隔离。GitHub分支合并到main分支时需要确保当前版本测试稳定后合并，确保生产环境镜像运行稳定。
1. 初步建立阶段：实现ai chatbot功能，实现接入本地模型和远程火山云模型，并实现历史消息的数据库持久化存储以及流式响应输出。
2. 完善阶段：
- 实现将数据库持久化记录通过一定策略输入回ai agent，实现ai的记忆持久化。
- 使用tavily封装联网搜索工具，当前日期返回工具，计划工具（实现ai所作计划和数据库的交互）。
- 实现所作计划在前端以TO-DO列表渲染形式展现。
3. 进阶阶段：
- 进一步考虑对于多工具，需要编排工作流来实现工具的链式调用。
- 工具较多时，需要采取一定措施防止工具调用幻觉或者调用工具失败。
- 设计多agent模式，通过多agent讨论来提升用户希望制定计划方便的使用体验。
二、分阶段详细讲解
1. 初步建立阶段：核心对话与基建
这个阶段解决了"能对话、能记住、能响应"的基础问题。

- API 与流式响应：基于 Modern.js BFF 架构实现了 /api/chat 接口。核心在于 api/lambda/chat.ts 中利用 TransformStream 实现了 SSE (Server-Sent Events)，将 AI 的思考过程和回答实时推送给前端，实现了打字机效果。
- 模型接入：VolcengineService 封装了火山引擎的 API，统一处理了 HTTP 调用和流式数据解析。通过环境变量配置，实现了本地模型和云端模型的无缝切换。
- 持久化存储：利用 DynamoDB 建立了 conversations（会话元数据）和 messages（消息列表）两张表。每次对话结束，系统会自动将 User Query 和 AI Response 存入数据库，保证刷新页面后历史不丢失。
  
2. 完善阶段：记忆增强与工具赋能（个性化拓展）
这个阶段让 AI 变得"更聪明、更实用"。
- 记忆持久化与回溯：ConversationMemoryService 实现了滑动窗口 + 关键词匹配策略。在构建 Prompt 时，不仅读取最近 N 轮对话，还会根据当前提问的关键词，去数据库中"捞"更早之前的相关对话，让 AI 拥有长短期记忆。
- 工具生态建设：
  - 联网搜索：封装 TavilySearch，让 AI 能获取实时资讯。
  - 计划与日期：实现了 planService 和 timeTools，允许 AI 读取系统时间，并生成结构化的 JSON 计划数据。
- 前端交互升级：前端不再只是单纯渲染文本。当 AI 返回包含 <tool_call> 的 JSON 计划数据时，前端会识别并将其渲染为交互式的 To-Do 列表卡片，实现了"对话即应用"的形态。
  
3. 进阶阶段：工作流编排与多 Agent 协作（个性化拓展）
这个阶段解决了"复杂任务处理与质量控制"的问题。
- 链式工具调用 (Chain of Tools)：在 chatWorkflowIntegration.ts 中实现了 MultiToolCallManager。它允许 AI 在一次用户请求中连续多次调用工具（例如：先搜日历 -> 再搜餐厅 -> 最后定计划），系统会自动维护中间状态，直到 AI 认为任务完成。
- 防幻觉与容错：
  - 强类型校验：引入 toolValidator，在工具执行前强制检查参数格式。
  - 鲁棒的 JSON 解析：针对 LLM 输出不稳定的问题，实现了多策略 JSON 提取器（自动修复括号、去除 Markdown 标记），大幅降低了工具调用失败率。
- 多 Agent 协作架构：设计了 MultiAgentOrchestrator，引入了 Planner (规划)、Critic (评审)、Host (控场)、Reporter (总结) 四个角色。
  - Host 控场：利用 向量相似度 (Embedding) 技术实时检测 Agent 间的共识度，自动决定是继续讨论还是输出结论。
  - 结构化协议：定义了严格的 JSON 通信协议，让不同角色的 AI 能高效协作，产出远超单体 Agent 的高质量方案。

项目难点：
**1. AI 幻觉容错：AI 有时返回 JSON 格式并不是完全正确，如果前端没有一定容错机制，可能导致前端元素渲染不正确**
*   **解决方案**：我们在 `BaseAgent` 中实现了**多策略 JSON 提取与修复机制**。
    *   **多策略提取**：系统会依次尝试解析 Markdown 代码块（\`\`\`json）、普通代码块（\`\`\`）、以及使用正则直接提取 `{...}` 内容。
    *   **自动修复**：针对常见的 JSON 错误（如末尾多余逗号、中文引号、未闭合的括号），我们在解析前进行正则替换修复。
    *   **兜底机制（Fallback）**：如果所有解析手段都失败，Agent 会自动降级生成纯文本回复，保证前端始终有内容可展示，绝不白屏。

**2. 工具流的构建？随着可用工具的增加，怎么避免工具幻觉？**
*   **解决方案**：通过**严格的类型定义注入**和**验证器**。
    *   在 System Prompt 中，我们使用 `generateToolPrompt` 动态注入基于 TypeScript 接口生成的工具定义，明确告诉 AI 参数的类型和必填项。
    *   在执行前，`toolValidator` 会对 AI 生成的参数进行校验，如果参数缺失或类型错误，会被拦截并拒绝执行，防止“胡乱调用”。

**3. 工具执行失败了怎么办，直接退出吗**
*   **解决方案**：不直接退出，而是采用**闭环反馈 + 重试限制（使用fallback机制，基于prompt多次提示设置5轮重试硬上限）**。
    *   当工具执行报错（如搜索无结果、API 失败），系统会将错误信息封装成 "Observation" 消息回传给 AI。
    *   AI 接收到错误后，有机会根据提示修正参数重新调用。
    *   我们在 `MultiToolCallManager` 中设置了 **5 轮硬上限**，防止 AI 陷入死循环。如果达到上限仍未成功，则强制结束并告知用户失败原因。

**4. 长中短期记忆对应结合化数据存储，向量数据存储的选择**
*   **解决方案**：采用**混合检索策略(10条100%+90条关键词匹配)**。
    *   **短期记忆（100%权重）**：直接从数据库读取最近的 10 条完整对话，保证当前上下文的绝对连贯。
    *   **中长期记忆（关键词匹配）**：对于更早的历史（90条范围），通过提取当前 Query 的关键词，在数据库中进行模糊匹配（Simple Relevance），只提取相关的片段。
    *   **架构设计**：目前使用 DynamoDB 存储结构化数据，代码结构上已预留了向量数据库（Vector Store）的接口，未来可平滑升级为 Embedding 语义检索。

**5. 多agent的具体分工构建，role为什么分四个（参考GitHub项目：微舆）**
*   **解决方案**：为了**解耦职责，避免思维盲区**。
    *   **Planner（规划师）**：专注“建设”，负责拆解目标生成方案，思维偏向乐观和执行。
    *   **Critic（批评家）**：专注“破坏”，负责找漏洞和评估风险，思维偏向悲观和审视。
    *   **Host（主持人）**：专注“控场”，负责流程控制和冲突仲裁，不参与具体内容生成。
    *   **Reporter（报告员）**：专注“呈现”，负责将复杂的讨论结果转化为用户友好的文档。
    *   这种分工模拟了真实的人类团队协作，避免了单 Agent 既当裁判又当运动员的局限性。

**6. 多agent讨论时的冲突协调怎么做**
*   **解决方案**：Host 基于**量化指标**进行决策。（自身上下轮比较+host判断两个角色的相似度）
    *   **顽固检测（自相似度）**：计算 Agent 当前轮次与上一轮次的向量相似度。如果 >0.98，说明它在“复读机”，Host 会发出警告要求其修改。
    *   **共识检测（互相似度）**：计算 Planner 和 Critic 观点的相似度。
        *   **< 0.7（分歧大）**：Host 判定需要继续讨论或强制引入反方视角。
        *   **> 0.9（共识高）**：Host 判定讨论收敛，进入总结阶段。

**7. 多agent讨论时，如果融合最后的结果？有没有什么策略？**
*   **解决方案**：Reporter 采用**结构化提取 + 优先级排序**策略。
    *   不是简单的文本拼接，而是从上下文中分别提取：
        *   **Key Agreements**：来自 Planner 的核心论点。
        *   **Resolved Concerns**：来自 Critic 标记为 `priority='high'` 的已解决建议。
        *   **Remaining Risks**：来自 Critic 标记为高风险的遗留问题。
    *   Reporter 将这些结构化数据喂给 LLM，结合 Host 的共识信任度评分，最终生成一份包含“决策背景 + 最终方案 + 风险提示”的 Markdown 报告。
**具体sample：**
```typescript
// 构建上下文消息
const contextMessages = [
  `用户的原始需求：\n${userQuery}`,
  `讨论历史（共 ${context.discussion_history.length} 轮）：\n${JSON.stringify(history)}`,
  `Planner的最终计划：\n${JSON.stringify(planner_plan)}`,
  `Critic的最终反馈：\n${JSON.stringify(critic_feedback)}`,
  `共识分析：\n- 平均相似度: ${mean_similarity}\n- 共识水平: ${level}`
];

// LLM生成最终报告（Markdown格式）
const report = await this.callModel(messages);
```

#### 融合策略的优势

**1. 多源信息整合**

-  综合考虑所有轮次的讨论历史，融合Planner的计划、Critic的反馈、Host的共识分析

**2. 智能优先级排序**
```
高优先级：Critic标记为'high'的建议 → resolved_concerns
中高风险：Critic标记为'high'/'medium'的风险 → remaining_uncertainties
核心理由：Planner的key_reasons → key_agreements
```

**3. 客观性保证**
- 共识水平基于量化指标（相似度），不由LLM主观判断
- 保留了Critic提出的所有重要风险和建议
- 完整记录讨论轮次和参与Agent

**4. 可追溯性**
```typescript
{
  participating_agents: ["planner", "critic", "host"],
  rounds: 2,
  summary: {
    key_agreements: [...],      // 来源：Planner position
    resolved_concerns: [...],   // 来源：Critic suggestions
    remaining_uncertainties: [...], // 来源：Critic risks
  }
}
```
 融合策略设计
阶段1：数据收集
Orchestrator为Reporter准备5类核心数据：
```typescript
{
  discussion_history: [        // 完整讨论历史
    { round: 1, outputs: [planner1, critic1, host1] },
    { round: 2, outputs: [planner2, critic2, host2] }
  ],
  final_planner_output: {...}, // Planner最终版本
  final_critic_output: {...},  // Critic最终反馈
  consensus_info: {            // 共识分析
    mean_similarity: 0.907,
    level: 'high',
    trend: [0.884, 0.907]
  }
}
```
阶段2：智能提取
Reporter采用4种提取策略：
策略1：提取关键共识 
// 来源：Planner的position.key_reasonskey_agreements = [  "基础阶段解决词汇/语法短板，为专项突破提供支撑",  "专项阶段针对性训练各模块核心技巧",  "冲刺阶段通过全真模考适应考试节奏"]
策略2：提取已解决问题 
// 来源：Critic的高优先级建议（priority === 'high'）resolved_concerns = [  "时间估算过于乐观 -> 增加20%缓冲时间",  "缺少应急预案 -> 添加Plan B方案",  "写作训练不足 -> 增加5篇限时写作"]
策略3：提取剩余风险 
// 来源：Critic的高/中风险（severity === 'high' | 'medium'）remaining_uncertainties = [  "宏观经济不确定性可能影响考试计划",  "用户时间投入可能存在波动",  "雅思政策调整风险"]
策略4：确定共识水平 
// 来源：Host的相似度分析consensus_level =   mean_similarity > 0.85 ? 'high' :      // 88.4% → high  mean_similarity > 0.70 ? 'medium' :  'low';
阶段3：LLM生成报告
Reporter将结构化数据传给LLM，生成Markdown报告：
```typescript
const contextMessages = [  "用户原始需求：帮我制定3个月雅思7分计划",  "讨论历史（共2轮）：{完整JSON}",  "Planner最终计划：{完整计划}",  "Critic最终反馈：{风险+建议}",  "共识分析：平均相似度90.7%，高共识"];// LLM综合所有信息，生成最终报告const report = await this.callModel(messages)
```
输出：高共识计划+仍可改进空间