# AI Agent - 兴趣教练

基于 Modern.js 构建的 AI Agent 应用，集成本地 Ollama 模型。

## 特性

- ✅ Modern.js 全栈框架
- ✅ SSE 流式响应
- ✅ Markdown 渲染支持（代码高亮）
- ✅ 本地 Ollama 模型集成
- ✅ Docker 容器化部署
- ✅ Jenkins CI/CD 自动化流水线

## CI/CD 状态

🚀 **自动化部署已配置**
- Jenkins Pipeline: ✅ 运行中
- GitHub Webhook: ✅ 已激活
- 自动构建触发: ✅ 启用

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
- **AI模型**: Ollama (DeepSeek-R1)
- **部署**: Docker + Jenkins
- **样式**: CSS Modules
- **Markdown**: react-markdown + highlight.js

