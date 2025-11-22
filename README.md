# AI Agent - 兴趣教练

基于 Modern.js 构建的 AI Agent 应用，支持本地 Ollama 模型和火山引擎豆包大模型。

## 特性

- ✅ Modern.js 全栈框架
- ✅ SSE 流式响应
- ✅ Markdown 渲染支持（代码高亮）
- ✅ 本地 Ollama 模型集成
- ✅ **火山引擎豆包大模型** - 在线大模型支持
- ✅ **Tavily 联网搜索** - AI 自主判断并调用搜索工具
- ✅ MongoDB 持久化存储
- ✅ 多对话管理
- ✅ Docker 容器化部署
- ✅ Jenkins CI/CD 自动化流水线

## CI/CD 状态

🚀 **自动化部署已配置**
- Jenkins Pipeline: ✅ 运行中
- GitHub Webhook: ✅ 已激活
- 自动构建触发: ✅ 启用

### 📚 相关文档
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

