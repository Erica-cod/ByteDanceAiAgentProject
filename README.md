# AI Agent - 兴趣教练

基于 Modern.js 全栈框架构建的 AI Agent 应用，集成多模型接入、多 Agent 协作、工具链式调用、OIDC 认证、实时监控等企业级能力。

> 项目详细设计文档：[飞书文档](https://hcnc2lw3s2mc.feishu.cn/wiki/CGiwwfb1oijb0Mk2y2McTG0ynVf?from=from_copylink) | 项目完整文档见 [`docs/`](./docs/)

## 特性

- Modern.js BFF 全栈架构，前后端同仓
- SSE 流式响应 + Markdown 实时渲染（代码高亮）
- 多模型支持：火山引擎豆包 / 本地 Ollama (DeepSeek-R1)
- 多 Agent 协作：Planner-Critic-Host-Reporter 四角色讨论架构
- 工具链式调用：联网搜索 (Tavily)、时间、计划等工具的自动编排
- OIDC 认证体系：自研轻量 IdP + BFF Session + CSRF 防护 + 限流
- MongoDB 持久化 + Redis 缓存 / 会话 / 队列
- Prometheus + Grafana 可观测性
- Docker Compose 一键部署 + Jenkins CI/CD
- Clean Architecture 渐进式重构（DI 容器 + 用例分层）

## 相关文档

- [环境变量配置指南](./docs/10-Deployment/ENV_SETUP_GUIDE.md)
- [安全指南](./docs/02-Security-System/SECURITY.md)
- [部署指南](./docs/10-Deployment/DEPLOYMENT_GUIDE.md)
- [Docker MongoDB 连接修复](./docs/10-Deployment/docker/DOCKER_FIX_MONGODB.md)

## 环境配置

### 1. 配置环境变量

项目需要配置环境变量才能正常运行。请按照以下步骤操作：

```bash
# 1. 复制环境变量模板文件
cp .env.example .env.local

# 2. 编辑 .env.local 文件，填入你的真实配置
# 必须配置的项目：
#   - TAVILY_API_KEY: 在 https://tavily.com/ 注册获取
#   - ARK_API_KEY: 在 https://console.volcengine.com/ark 注册获取
#   - ARK_MODEL: 你的火山引擎模型 Endpoint ID
#   - MONGODB_URI: MongoDB 连接地址
```

### 2. 获取 API 密钥

#### Tavily API（联网搜索）
1. 访问 [Tavily 官网](https://tavily.com/)
2. 注册账号并登录
3. 在控制台获取 API Key
4. 将 API Key 填入 `.env.local` 的 `TAVILY_API_KEY`

#### 火山引擎豆包大模型
1. 访问 [火山引擎控制台](https://console.volcengine.com/ark)
2. 注册账号并开通豆包大模型服务
3. 创建推理接入点，获取 Endpoint ID
4. 在 API 管理中获取 API Key
5. 将配置填入 `.env.local` 的 `ARK_API_KEY` 和 `ARK_MODEL`

#### MongoDB
- 本地开发：确保本地安装了 MongoDB，使用默认配置即可
- 生产环境：使用 Docker Compose 会自动启动 MongoDB 容器

## 开发

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env.local

# 开发模式（自动启动 IdP + BFF）
npm run dev

# 构建
npm run build

# 启动生产服务
npm run serve

# 提交代码前运行安全检查
npm run check:secrets
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

| 层级 | 技术 |
|------|------|
| **前端** | React 18 + Modern.js + TypeScript + CSS Modules |
| **后端** | Modern.js BFF (Hono) + Lambda 函数式路由 |
| **AI 模型** | 火山引擎豆包 (doubao-1.5-thinking-pro) / Ollama (DeepSeek-R1) |
| **认证** | 自研轻量 OIDC IdP + BFF Session + CSRF + 限流 |
| **数据库** | MongoDB 7 (持久化) + Redis 7 (缓存/会话/队列) |
| **监控** | Prometheus + Grafana + 自定义埋点 SDK |
| **部署** | Docker Compose + Nginx 反向代理 + Jenkins CI/CD |
| **架构** | Clean Architecture (DI 容器 + Use-Case 分层) |

## 项目亮点

### 多 Agent 协作架构

设计了 Planner-Critic-Host-Reporter 四角色讨论框架。Host 基于向量相似度实时检测共识度（>0.9 收敛 / <0.7 继续辩论），自动控制讨论节奏；Reporter 通过结构化提取 + 优先级排序融合最终结论，而非简单拼接文本。

### 工具链式调用与防幻觉

实现了 MultiToolCallManager，支持单次请求中连续多轮工具调用（搜索 → 分析 → 计划）。通过 TypeScript 接口生成的强类型工具定义注入 System Prompt，配合参数校验器拦截非法调用，5 轮硬上限防死循环。

### SSE 流式响应 + LLM 输出容错

基于 TransformStream 实现 SSE 流式推送，前端实时渲染思考过程和回答。针对 LLM 输出格式不稳定的问题，实现多策略 JSON 提取与自动修复（括号补全、中文引号替换），解析失败时自动降级为纯文本，保证前端永不白屏。

### OIDC 认证 + 安全纵深防御

自研轻量 IdP 支持完整 OIDC Authorization Code + PKCE 流程。BFF 层实现 Session 管理、CSRF 双重校验（Origin/Referer + Token）、Redis 分布式限流（全局/IP/设备三维度 + 熔断降级）。管理接口统一接入 adminGuard 鉴权。

### 混合记忆检索策略

短期记忆（最近 10 轮完整上下文）+ 中长期记忆（90 条范围内关键词模糊匹配），兼顾上下文连贯性与历史信息召回率。架构已预留向量数据库接口，可平滑升级为 Embedding 语义检索。

### 性能优化闭环

构建后自动执行关键 CSS 内联、资源预加载提示注入、Brotli/Gzip 预压缩。配套 Lighthouse User Flow 自动化测试和 Bundle 体积 Top-20 分析脚本，形成"优化 → 测量 → 验证"闭环。

## 项目结构

```
├── api/            后端 API（Lambda 函数 + Clean Architecture）
├── src/            前端 React 应用
├── shared/         前后端共享类型
├── idp/            OIDC 认证服务（轻量 IdP）
├── deploy/         部署配置（Docker Compose / Nginx / 启动脚本）
├── dockerfiles/    容器构建配方
├── monitoring/     Prometheus & Grafana 配置
├── scripts/        辅助脚本（dev / build / bench / security）
├── test/           测试（Jest / K6 / Lighthouse）
└── docs/           项目文档（按模块编号 00-12）
```
