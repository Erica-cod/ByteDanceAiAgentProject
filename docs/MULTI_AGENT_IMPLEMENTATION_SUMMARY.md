# 多Agent协作系统实现总结

## 概述

本文档总结了多Agent协作系统的完整实现，包括架构设计、核心组件、使用方法和测试指南。

## 系统架构

### 1. 核心组件

#### 1.1 Agent角色（4个）

**位置**: `api/agents/`

- **BaseAgent** (`baseAgent.ts`): 所有Agent的抽象基类
  - 定义了Agent的基本接口和通用功能
  - 提供火山引擎模型调用、消息构建、历史管理等功能
  
- **PlannerAgent** (`plannerAgent.ts`): 规划师
  - 职责：将用户目标拆解成结构化计划
  - 输出：包含阶段、任务、时间估算的完整计划
  
- **CriticAgent** (`criticAgent.ts`): 批评家
  - 职责：挑刺、可行性检查、提出修正建议
  - 输出：风险评估、改进建议、可行性检查
  
- **HostAgent** (`hostAgent.ts`): 主持人
  - 职责：流程控制、共识检测、决策下一步动作
  - 功能：相似度分析、顽固Agent检测、轮次管理
  
- **ReporterAgent** (`reporterAgent.ts`): 报告员
  - 职责：生成最终报告、总结讨论过程
  - 输出：用户友好的Markdown格式报告

#### 1.2 工具系统

**位置**: `api/tools/`

- **similarityTools.ts**: 相似度比较工具
  - 使用火山引擎embedding模型进行文本向量化
  - 计算余弦相似度和相似度矩阵
  - 检测最不相似的配对
  - 提供简单文本相似度作为fallback
  
- **timeTools.ts**: 时间工具
  - 获取当前时间信息
  - 日期计算（加减天数、周数、月数）
  - 自然语言日期解析（如"下周一"、"3天后"）
  - 工作日计算

#### 1.3 编排系统

**位置**: `api/workflows/multiAgentOrchestrator.ts`

- **MultiAgentOrchestrator**: 多Agent协作编排器
  - 管理多个Agent的协作流程
  - 控制讨论轮次和顺序
  - 处理Agent之间的信息传递
  - 支持回调机制（onAgentOutput, onHostDecision等）
  - 最大轮次限制（默认5轮）

#### 1.4 API集成

**位置**: `api/lambda/chat.ts`

- 添加了`mode`参数支持（'single' | 'multi_agent'）
- 实现了`handleMultiAgentMode`函数处理多Agent流程
- 支持SSE流式响应，实时推送Agent输出和决策

### 2. 前端组件

#### 2.1 ChatInterface更新

**位置**: `src/components/ChatInterface.tsx`

- 添加`chatMode`状态管理
- 新增Smart AI模式切换按钮
- 扩展Message接口支持`multiAgentData`
- 实现多Agent事件的SSE处理逻辑
- 支持实时更新多Agent协作进度

#### 2.2 MultiAgentDisplay组件

**位置**: `src/components/MultiAgentDisplay.tsx`

- 分轮显示各Agent的输出
- 展示Host的决策和理由
- 可视化共识趋势图
- 支持展开/收起轮次
- 高亮最终报告

**样式**: `src/components/MultiAgentDisplay.css`
- 响应式设计
- Agent角色颜色区分
- 共识水平颜色编码
- 流畅的动画效果

### 3. 协议规范

**位置**: `docs/MULTI_AGENT_PROTOCOL.md`

详细定义了：
- Agent输出格式
- Host决策规则
- 工具调用协议
- 会话状态结构
- 前端交互协议

## 工作流程

### 1. 用户触发

1. 用户在前端点击"Smart AI"按钮切换到多Agent模式
2. 输入问题并发送
3. 前端发送请求到`/api/chat`，携带`mode: 'multi_agent'`

### 2. 后端处理

1. **chat.ts**检测到多Agent模式，调用`handleMultiAgentMode`
2. 创建**MultiAgentOrchestrator**实例
3. 开始多轮协作循环（最多5轮）：

   **每一轮**：
   - **Planner**生成计划
   - **Critic**批评计划
   - **Host**分析共识并决策
   
   **Host决策逻辑**：
   - 共识 > 0.90 → 进入收敛阶段
   - 0.70 < 共识 ≤ 0.90 → 继续讨论
   - 共识 ≤ 0.70 → 强制反方角色
   - 检测顽固Agent（自相似度 > 0.98）
   - 达到最大轮次 → 终止讨论

4. **Reporter**生成最终报告
5. 通过SSE流式推送所有事件到前端

### 3. 前端展示

1. 接收SSE事件流
2. 实时更新`multiAgentData`
3. 使用**MultiAgentDisplay**组件展示：
   - 每轮的Agent输出
   - Host决策
   - 共识趋势图
4. 最终展示Reporter的完整报告

## 关键特性

### 1. 共识检测

- 使用embedding向量计算立场相似度
- 支持相似度矩阵和平均相似度
- 检测最不相似的Agent配对
- 追踪共识趋势变化

### 2. 顽固Agent检测

- 计算Agent前后轮的自相似度
- 连续2轮自相似度 > 0.98 → 标记为顽固
- Host发出更新命令要求修改立场

### 3. 流式响应

- 使用SSE (Server-Sent Events)
- 实时推送Agent输出
- 支持多种事件类型：
  - `agent_output`: Agent输出
  - `host_decision`: Host决策
  - `round_complete`: 轮次完成
  - `session_complete`: 会话完成
  - `error`: 错误信息

### 4. 灵活的决策规则

Host根据以下因素做决策：
- 共识水平（相似度）
- 轮次数
- 顽固Agent
- 关键问题是否解决

## 使用方法

### 1. 环境配置

确保`.env`文件包含：

```env
# 火山引擎API配置
ARK_API_KEY=your_api_key_here
ARK_API_URL=https://ark.cn-beijing.volces.com/api/v3/chat/completions
ARK_MODEL=doubao-1-5-thinking-pro-250415

# Embedding模型配置（用于相似度计算）
ARK_EMBEDDING_API_URL=https://ark.cn-beijing.volces.com/api/v3/embeddings
ARK_EMBEDDING_MODEL=doubao-embedding
```

### 2. 启动服务

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 生产构建
npm run build
npm run serve
```

### 3. 使用多Agent模式

1. 打开浏览器访问应用
2. 点击顶部的"🧠 Smart AI"按钮
3. 输入需要规划的问题，例如：
   - "帮我制定一个3个月的IELTS备考计划"
   - "我想学习React，帮我规划学习路线"
   - "制定一个健身减肥计划"
4. 观察多Agent协作过程
5. 查看最终报告

## 测试建议

### 1. 功能测试

**测试用例1：正常流程**
- 输入：简单的规划需求
- 期望：2-3轮达成共识，生成完整计划

**测试用例2：复杂需求**
- 输入：复杂的、有争议的规划需求
- 期望：4-5轮讨论，Critic提出多个建议

**测试用例3：强制反方**
- 输入：容易达成共识的简单需求
- 期望：Host触发强制反方，Critic提出反对意见

### 2. 边界测试

- 最大轮次限制（5轮）
- 网络中断恢复
- 模型API错误处理
- Embedding服务不可用时的fallback

### 3. 性能测试

- 单次协作耗时（预期：30-60秒）
- 并发用户支持
- 内存占用
- SSE连接稳定性

## 已知限制

1. **Embedding依赖**：
   - 相似度计算依赖火山引擎embedding API
   - 如果API不可用，会fallback到简单文本相似度
   - 简单文本相似度精度较低

2. **轮次限制**：
   - 最大5轮讨论
   - 复杂问题可能无法充分讨论

3. **成本考虑**：
   - 每次多Agent协作会调用多次模型API
   - 建议监控API使用量和成本

4. **语言限制**：
   - 当前主要支持中文
   - 英文支持需要调整prompt

## 优化建议

### 1. 性能优化

- **缓存embedding结果**：相同文本不重复计算
- **并行执行**：Planner和Critic可以并行（第一轮）
- **增量相似度**：只计算新输出与历史的相似度

### 2. 功能增强

- **用户中断**：允许用户随时终止协作
- **保存会话**：支持保存和恢复多Agent会话
- **自定义Agent**：允许用户配置Agent角色和参数
- **多语言支持**：支持英文等其他语言

### 3. 可视化增强

- **实时动画**：Agent发言时的动画效果
- **关系图**：展示Agent之间的交互关系
- **时间轴**：更直观的时间轴展示

## 故障排查

### 1. 多Agent模式无响应

**可能原因**：
- 火山引擎API配置错误
- 网络连接问题
- 模型配额不足

**解决方法**：
- 检查`.env`文件配置
- 查看后端日志
- 验证API Key是否有效

### 2. 相似度计算失败

**可能原因**：
- Embedding API不可用
- 文本格式错误

**解决方法**：
- 系统会自动fallback到简单文本相似度
- 检查后端日志中的警告信息

### 3. SSE连接中断

**可能原因**：
- 网络不稳定
- 服务器超时

**解决方法**：
- 刷新页面重试
- 检查网络连接
- 增加服务器超时时间

## 贡献指南

欢迎贡献代码和建议！请遵循以下规范：

1. **代码风格**：遵循项目的ESLint和Prettier配置
2. **提交信息**：使用英文，遵循Conventional Commits规范
3. **文档更新**：重要功能需要更新文档
4. **测试覆盖**：新功能需要添加测试用例

## 参考资料

- [多Agent协作JSON协议](./MULTI_AGENT_PROTOCOL.md)
- [火山引擎豆包模型文档](https://www.volcengine.com/docs/82379/1263512)
- [LangGraph工作流指南](./LANGGRAPH_WORKFLOW_GUIDE.md)
- [工具调用实现](./TOOL_CALLING_IMPLEMENTATION.md)

---

**版本**: v1.0  
**更新日期**: 2025-12-04  
**维护者**: AI Agent Team

