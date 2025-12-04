# 多Agent协作系统 - 快速开始

## 🚀 快速开始

### 1. 环境配置

确保你的 `.env` 文件包含火山引擎API配置：

```env
# 火山引擎API配置（必需）
ARK_API_KEY=your_api_key_here
ARK_API_URL=https://ark.cn-beijing.volces.com/api/v3/chat/completions
ARK_MODEL=doubao-1-5-thinking-pro-250415

# Embedding模型配置（用于相似度计算，可选）
ARK_EMBEDDING_API_URL=https://ark.cn-beijing.volces.com/api/v3/embeddings
ARK_EMBEDDING_MODEL=doubao-embedding
```

### 2. 安装依赖

```bash
npm install
```

### 3. 启动应用

```bash
# 开发模式
npm run dev

# 或者生产模式
npm run build
npm run serve
```

### 4. 使用多Agent模式

1. 打开浏览器访问 `http://localhost:8080`
2. 在聊天界面顶部找到模式切换按钮
3. 点击 **"🧠 Smart AI"** 按钮切换到多Agent模式
4. 输入你的规划需求，例如：
   ```
   帮我制定一个3个月的IELTS备考计划，目标是达到7分
   ```
5. 观察多Agent协作过程：
   - 📋 **Planner** 生成初步计划
   - 🔍 **Critic** 提出批评和建议
   - 🎯 **Host** 分析共识并决策下一步
   - 📝 **Reporter** 生成最终报告

## 🎯 系统特性

### 4个Agent角色

- **📋 Planner（规划师）**: 拆解目标，生成结构化计划
- **🔍 Critic（批评家）**: 挑刺、风险评估、提出改进建议
- **🎯 Host（主持人）**: 流程控制、共识检测、决策管理
- **📝 Reporter（报告员）**: 生成最终报告和总结

### 智能决策机制

- **共识检测**: 使用embedding向量计算立场相似度
- **顽固检测**: 识别不愿改变立场的Agent
- **动态调整**: 根据讨论进展自动调整策略
- **轮次控制**: 最多5轮讨论，防止无限循环

### 实时可视化

- 分轮展示各Agent的输出
- 共识趋势图
- Host决策过程
- 最终报告高亮

## 📋 示例场景

### 场景1：学习规划

**输入**：
```
我想学习React，帮我制定一个2个月的学习计划
```

**预期输出**：
- Planner: 分阶段学习路线（基础 → 进阶 → 实战）
- Critic: 指出时间分配问题、建议增加实战项目
- Host: 检测到中等共识，继续讨论
- Planner: 调整计划，增加项目实战
- Reporter: 生成最终学习计划

### 场景2：健身计划

**输入**：
```
制定一个3个月的减肥健身计划，目标减重10kg
```

**预期输出**：
- Planner: 包含饮食、运动、休息的综合计划
- Critic: 评估可行性，指出潜在风险（过度训练、营养不足）
- Host: 检测到分歧，要求Planner调整
- Planner: 优化计划，增加营养指导和恢复期
- Reporter: 生成详细的健身减肥计划

### 场景3：考试备考

**输入**：
```
帮我制定IELTS备考计划，3个月内达到7分
```

**预期输出**：
- Planner: 分模块训练（听说读写）+ 模考安排
- Critic: 指出写作训练不足、模考频率低
- Host: 检测到高共识，进入收敛阶段
- Reporter: 生成优化后的备考计划

## 🔧 故障排查

### 问题1: 多Agent模式无响应

**解决方法**:
1. 检查 `.env` 文件中的 `ARK_API_KEY` 是否正确
2. 查看浏览器控制台是否有错误
3. 检查后端日志（终端输出）

### 问题2: 相似度计算失败

**解决方法**:
- 系统会自动fallback到简单文本相似度
- 检查 `ARK_EMBEDDING_API_URL` 配置
- 查看后端日志中的警告信息

### 问题3: 讨论轮次过多

**解决方法**:
- 系统会自动限制在5轮以内
- 如果需要调整，修改 `multiAgentOrchestrator.ts` 中的 `maxRounds` 参数

## 📚 更多文档

- [完整实现总结](./docs/MULTI_AGENT_IMPLEMENTATION_SUMMARY.md)
- [JSON协议规范](./docs/MULTI_AGENT_PROTOCOL.md)
- [工具调用文档](./docs/TOOL_CALLING_IMPLEMENTATION.md)

## 🎉 开始使用

现在你可以开始使用多Agent协作系统了！切换到 Smart AI 模式，体验智能规划的强大功能。

---

**提示**: 多Agent模式会调用多次模型API，建议监控使用量和成本。

