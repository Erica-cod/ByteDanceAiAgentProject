# scripts/ 目录说明

项目开发过程中使用的辅助脚本，按用途分类到子目录中。

## 目录结构

```
scripts/
├── dev/          开发辅助
├── build/        构建优化
├── bench/        性能测试 & 基准测量
├── security/     安全检查
└── migration/    数据迁移 / 一次性脚本
```

## dev/ — 开发辅助

| 脚本 | 说明 |
|------|------|
| `clean-port.js` | 启动前自动清理被占用的端口（8080/9000），由 `predev`/`prestart` 等 npm 钩子调用 |
| `dev-with-idp.js` | 一键并行启动 IdP 认证服务和 Modern.js 开发服务器（`npm run dev`） |
| `fix-mongodb-connection.ps1` | 诊断并修复 Docker 环境下 MongoDB 连接问题 |

## build/ — 构建优化

| 脚本 | 说明 |
|------|------|
| `postbuild-optimize-assets.js` | 生产构建后自动执行：内联关键 CSS、注入资源预加载提示、生成 Brotli/Gzip 预压缩文件、注入 App Shell |

## bench/ — 性能测试 & 基准测量

| 脚本 | 说明 |
|------|------|
| `analyze-bundle-top20.js` | 分析 webpack 产物，列出体积最大的 20 个模块 |
| `bench-auth-rate-limit.js` | 对认证接口的限流策略进行压力测试 |
| `bench-input-paste-playwright.js` | 使用 Playwright 测量大段文本粘贴到输入框的渲染耗时 |
| `generate-multi-agent-fixture.js` | 生成多 Agent 对话的测试 fixture 数据 |
| `run-lighthouse-prod-fixed.js` | 在生产模式下运行 Lighthouse 性能审计（固定配置） |
| `run-lighthouse-user-flow-multi-agent.js` | Lighthouse User Flow 模式下测量多 Agent 场景的性能指标 |

## security/ — 安全检查

| 脚本 | 说明 |
|------|------|
| `check-secrets.ps1` | PowerShell 版密钥泄露检查，扫描 `.env`、`docker-compose`、`Dockerfile` 等文件 |
| `check-secrets.sh` | Bash 版密钥泄露检查（Linux/macOS），功能同上 |

> 通过 `npm run check:secrets` 调用，会自动根据操作系统选择对应脚本。已配置为 `precommit` 钩子。

## migration/ — 数据迁移

| 脚本 | 说明 |
|------|------|
| `migrate-chat.sh` | 将旧版聊天数据结构迁移到新版 schema |
