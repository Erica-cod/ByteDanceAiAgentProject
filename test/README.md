# 测试说明（Jest / k6 / 手工脚本）

## ✅ 推荐：Jest（你说的 Jtest）自动化测试

### 运行方式

```bash
# 单元测试（默认）
npm run test:unit

# 集成测试（可选：需要 Redis / 服务端 / Mongo 等外部依赖时会自动跳过或按开关执行）
npm run test:integration

# 跑全部 Jest
npm run test:jest
```

### 已迁移到 Jest 的测试

- **Markdown 容错**：`src/utils/__tests__/markdownFixer.test.ts`（unit）
- **SSE 限流器**：`api/_clean/infrastructure/streaming/__tests__/sse-limiter.test.ts`（unit）
- **队列管理器（token复用/无效token惩罚）**：`api/_clean/infrastructure/queue/__tests__/queue-manager.test.ts`（unit）
- **SSE 全局队列化**：`api/_clean/infrastructure/streaming/__tests__/sse-limiter-global-queue.test.ts`（unit）
- **工具降级链**：`api/tools/v2/core/__tests__/tool-executor-fallback.test.ts`（unit）
- **Redis 连接**：`test/jest/redis-connection.int.test.ts`（integration）
- **Redis 多Agent缓存**：`test/jest/redis-multi-agent-cache.int.test.ts`（integration）
- **Redis 压缩/续期**：`test/jest/redis-optimization.int.test.ts`（integration）
- **队列化 429/Retry-After**：`test/jest/queueing.int.test.ts`（integration，可自动跳过）
- **Multi-Agent 断点续流 E2E（可选）**：`test/jest/multi-agent-resume.e2e.int.test.ts`（需 `RUN_MULTI_AGENT_RESUME_TEST=1`）
- **Tool Cache 写入 Redis（可选）**：`test/jest/tool-cache-redis.int.test.ts`（需 `RUN_TOOL_CACHE_REDIS_TEST=1`）
- **工具降级链 + Redis 缓存联动（可选）**：`test/jest/tool-fallback-redis.int.test.ts`（需 `RUN_TOOL_FALLBACK_REDIS_TEST=1`）
- **火山引擎 API 连通性（可选）**：`test/jest/volcengine-api.int.test.ts`（需 `RUN_VOLCENGINE_API_TEST=1`）
- **sources 字段入库检查（可选）**：`test/jest/sources-db.int.test.ts`（需 `RUN_SOURCES_DB_TEST=1`）
- **LRU（可选，较慢）**：`test/jest/lru.int.test.ts`（integration，需 `RUN_LRU_TEST=1`）
- **Request Cache（可选）**：`test/jest/request-cache.int.test.ts`（integration，依赖可用时执行）
- **Chunking（可选，较慢）**：`test/jest/chunking.int.test.ts`（integration，需 `RUN_CHUNKING_TEST=1`）

> 说明：集成测试默认尽量“**不阻塞团队**”，缺外部依赖会 **自动跳过**；需要强制跑的（LRU/Chunking）用开关控制。

---

## 📈 k6 压测（性能 / 限流 / 队列）

见：`test/k6/README.md`

---

## 🧰 保留：手工脚本（用于调试/复现）

`test/` 下原有大部分 `test-*.js` 已迁移到 Jest 并删除（避免重复维护）。目前保留的“手工类”主要是 HTML/Markdown 复现材料（如 SSE/RAF 性能分析页面），日常测试建议以 Jest / k6 为主。

---

## 🚀 **运行测试前的准备**

### 1. 启动 Redis

```bash
# 使用 Docker Compose
docker-compose up -d redis

# 验证 Redis 运行状态
docker ps | findstr redis
```

### 2. 启动开发服务器（给集成测试/压测用）

```bash
npm run dev
```

### 3. 配置环境变量

确保 `.env.local` 中包含：

```env
# Redis 配置（不要把真实密码提交到 git）
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# 火山引擎配置（用于多 Agent 测试）
ARK_API_KEY=your_ark_api_key
ARK_API_URL=https://ark.cn-beijing.volces.com/api/v3/chat/completions
ARK_MODEL=doubao-1-5-thinking-pro-250415

# （可选）打开更重的 E2E / Redis 工具缓存测试
# RUN_MULTI_AGENT_RESUME_TEST=1
# RUN_TOOL_CACHE_REDIS_TEST=1
# ALLOW_REDIS_IN_TEST=true
# RUN_TOOL_FALLBACK_REDIS_TEST=1
# RUN_VOLCENGINE_API_TEST=1
# RUN_SOURCES_DB_TEST=1
# RUN_REQUEST_CACHE_TEST=1
```

---

## 🧯 Deprecated（建议迁移到 Jest）

- `test/test-redis-resume.js`：已迁移到 `test/jest/multi-agent-resume.e2e.int.test.ts`（旧脚本已删除）
- `test/test-tool-fallback-redis.js`：已迁移到 `test/jest/tool-fallback-redis.int.test.ts`（旧脚本已删除）
- `test/test-volcengine.js`：已迁移到 `test/jest/volcengine-api.int.test.ts`（旧脚本已删除）
- `test/test-sources-db.js`：已迁移到 `test/jest/sources-db.int.test.ts`（旧脚本已删除）
- `test/test-refactored-code.js`：已迁移到 `test/jest/refactored-code.test.ts`（旧脚本已删除）
- `test/test-refactored-files.js`：已迁移到 `test/jest/refactored-files.test.ts`（旧脚本已删除）
- `test/test-lru.js`：已迁移到 `test/jest/lru.int.test.ts`（旧脚本已删除）
- `test/test-request-cache.js`：已迁移到 `test/jest/request-cache.int.test.ts`（旧脚本已删除）
- `test/test-chunking.js`：已迁移到 `test/jest/chunking.int.test.ts`（旧脚本已删除）
- `test/test-queue.js` / `test/test-queue-global.js` / `test/test-queue-stress.js`：已由 `test/jest/queueing.int.test.ts` + `test/k6/*` 覆盖（旧脚本已删除）
- `test/test-queue-invalid-token*.js` / `test/test-queue-invalid-final.js`：已由 `api/_clean/infrastructure/queue/__tests__/queue-manager.test.ts` 覆盖（旧脚本已删除）

---

## 🐛 **故障排查**

### 问题 1：Redis 连接失败

```
❌ Redis 错误: connect ECONNREFUSED
```

**解决方案**：
```bash
# 检查 Redis 是否运行
docker ps | findstr redis

# 如果未运行，启动 Redis
docker-compose up -d redis

# 查看 Redis 日志
docker logs redis-ai-agent
```

### 问题 2：服务器连接失败

```
❌ 测试失败: connect ECONNREFUSED localhost:8080
```

**解决方案**：
```bash
# 启动开发服务器
npm run dev
```

### 问题 3：火山引擎 API 错误

```
❌ 火山引擎 API 调用失败
```

**解决方案**：
- 检查 `.env.local` 中的 `ARK_API_KEY` 是否正确
- 确认 API 配额是否充足
- 检查网络连接

---

## 📊 **测试报告示例**

### Redis 断点续传测试

```
🧪 Redis 断点续传测试
============================================================

📍 步骤 1: 启动会话并在第 2 轮后中断
------------------------------------------------------------
  ℹ️  会话已创建: conv_1703923200000
  📤 Agent输出: planner (第 1 轮)
  📤 Agent输出: critic (第 1 轮)
  ✅ 第 1 轮已完成
  📤 Agent输出: planner (第 2 轮)
  📤 Agent输出: critic (第 2 轮)
  ✅ 第 2 轮已完成
  ⚠️  已完成 2 轮，现在中断连接...
  ✅ 会话已中断，已完成 2 轮

📍 步骤 2: 验证 Redis 中的状态
------------------------------------------------------------
  ✅ Redis 连接成功
  ℹ️  查询 Redis 键: multi_agent:conv_1703923200000:msg_1703923200000
  ✅ 找到 Redis 状态: 已完成 2 轮
  ℹ️  会话状态预览:
    - 当前轮次: 2
    - 最大轮次: 5
    - 状态: in_progress
    - 共识趋势: [0.65,0.75]

📍 步骤 3: 恢复会话并从断点继续
------------------------------------------------------------
  ℹ️  恢复会话，从第 3 轮继续...
  ✅ ✨ 从第 2 轮恢复，继续第 3 轮
  📤 Agent输出: planner (第 3 轮)
  📤 Agent输出: critic (第 3 轮)
  📤 Agent输出: reporter (第 5 轮)
  ✅ 会话完成，总轮次: 5
  ✅ 会话完成！

============================================================
✅ 🎉 所有测试通过！
============================================================

测试摘要:
  ✅ 会话中断: 在第 2 轮后成功中断
  ✅ Redis 状态: 状态已保存且数据完整
  ✅ 断点续传: 成功从第 3 轮继续
  ✅ Token 节省: 约 40%
```

---

## 💡 **开发建议**

1. **每次修改 Redis 相关代码后**，运行 `npm run test:redis:resume` 验证功能
2. **修改队列化逻辑后**，运行相关队列测试
3. **提交代码前**，运行 `npm run test:all` 确保没有破坏现有功能
4. **CI/CD 集成**：可以将这些测试添加到 GitHub Actions 或其他 CI 工具

---

## 📚 **相关文档**

- [Redis 配置指南](../docs/REDIS_SETUP.md)
- [前端面试准备](../docs/FRONTEND_INTERVIEW_PREP.md)
- [Docker 配置](../docker-compose.yml)

