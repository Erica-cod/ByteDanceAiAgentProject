# 测试脚本说明

## 📋 **测试文件列表**

### **Redis 相关测试**

#### 1. `test-redis-connection.js` - Redis 连接测试
快速测试 Redis 是否可用，验证基本操作。

```bash
npm run test:redis
```

**测试内容**：
- ✅ Redis 连接
- ✅ SET/GET/DEL 基本操作
- ✅ 查询现有的 multi_agent 缓存

**预期输出**：
```
✅ Redis 连接成功!
📝 测试基本操作...
  ✅ SET test_key = test_value
  ✅ GET test_key = test_value
  ✅ DEL test_key
✅ 所有测试通过!
```

---

#### 2. `test-redis-resume.js` - Redis 断点续传测试
完整测试多 Agent 模式的 Redis 断点续传功能。

```bash
npm run test:redis:resume
```

**测试场景**：
1. 启动多 Agent 会话（"什么是量子计算？"）
2. 等待 2 轮后模拟中断
3. 验证 Redis 中保存了状态
4. 重新连接并验证从断点继续

**测试步骤**：
```
📍 步骤 1: 启动会话并在第 2 轮后中断
  📤 Agent输出: planner (第 1 轮)
  📤 Agent输出: critic (第 1 轮)
  ✅ 第 1 轮已完成
  📤 Agent输出: planner (第 2 轮)
  📤 Agent输出: critic (第 2 轮)
  ✅ 第 2 轮已完成
  ⚠️  已完成 2 轮，现在中断连接...

📍 步骤 2: 验证 Redis 中的状态
  ✅ Redis 连接成功
  ✅ 找到 Redis 状态: 已完成 2 轮
  - 当前轮次: 2
  - 最大轮次: 5
  - 状态: in_progress
  - 共识趋势: [0.65, 0.75]

📍 步骤 3: 恢复会话并从断点继续
  ✨ 从第 2 轮恢复，继续第 3 轮
  📤 Agent输出: planner (第 3 轮)
  📤 Agent输出: critic (第 3 轮)
  ...
  ✅ 会话完成，总轮次: 5

🎉 所有测试通过！
```

**测试摘要**：
- ✅ 会话中断: 在第 2 轮后成功中断
- ✅ Redis 状态: 状态已保存且数据完整
- ✅ 断点续传: 成功从第 3 轮继续
- ✅ Token 节省: 约 40%

---

#### 3. `test-redis-optimization.js` - Redis 性能优化测试
全面测试 Redis 优化效果（压缩、性能、TTL）。

```bash
npm run test:redis:optimization
```

**测试内容**：
- ✅ **压缩率测试**：验证 gzip 压缩效果（预期节省 60-80%）
- ✅ **读写性能测试**：对比有无压缩的性能差异
- ✅ **动态 TTL 验证**：不同轮次的 TTL 计算
- ✅ **滑动过期验证**：访问时自动续期
- ✅ **内存占用估算**：不同并发量下的内存占用

**预期输出**：
```
🧪 ===== Redis 优化效果测试 =====

📦 测试 1: 压缩率测试
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
原始数据大小: 19234 bytes (18.78 KB)
压缩后大小: 4821 bytes (4.71 KB)
压缩率: 74.9%
节省内存: 14413 bytes

⚡ 测试 2: 读写性能测试
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
无压缩写入 (10 次): 平均 3.20ms
有压缩写入 (10 次): 平均 12.50ms
无压缩读取 (10 次): 平均 2.10ms
有压缩读取 (10 次): 平均 8.40ms

⏱️  测试 3: 动态 TTL 验证
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
第 1 轮: TTL = 420s (7.0 分钟)
第 2 轮: TTL = 360s (6.0 分钟)
第 3 轮: TTL = 300s (5.0 分钟)
第 4 轮: TTL = 240s (4.0 分钟)
第 5 轮: TTL = 180s (3.0 分钟)

💾 测试 5: 内存占用估算
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1,000 并发会话:
  - 无压缩: 18.36 MB
  - 有压缩: 4.61 MB (节省 13.75 MB)
5,000 并发会话:
  - 无压缩: 91.78 MB
  - 有压缩: 23.04 MB (节省 68.74 MB)
10,000 并发会话:
  - 无压缩: 183.56 MB
  - 有压缩: 46.08 MB (节省 137.48 MB)
```

**关键指标**：
- 压缩率：74-80%（实测）
- 写入增加耗时：8-12ms（压缩开销）
- 读取增加耗时：6-8ms（解压开销）
- 内存节省：75% 左右

---

#### 3. `test-refactored-code.js` - 重构代码测试
全面测试重构后的代码是否正常工作。

```bash
npm run test:refactored
```

**测试内容**：
- ✅ **模块导入测试**：验证所有新模块可以正常导入
- ✅ **SSE流写入工具测试**：测试基础设施层功能
- ✅ **内容提取工具测试**：测试 thinking 标签提取
- ✅ **System Prompt 测试**：验证 prompt 构建
- ✅ **API 调用测试**：实际测试 API 端点（如果服务器在运行）

**预期输出**：
```
🧪 ===== 重构代码测试 =====

📦 测试 1: 模块导入测试
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✅ 类型定义: 导入成功
  ✅ System Prompt: 导入成功
  ✅ 内容提取工具: 导入成功
  ✅ 模型调用封装: 导入成功
  ✅ 工具执行器: 导入成功
  ✅ SSE流写入工具: 导入成功
  ✅ 工作流处理器: 导入成功
  ✅ 火山引擎SSE处理器: 导入成功
  ✅ 本地模型SSE处理器: 导入成功
  ✅ 多Agent处理器: 导入成功

📊 导入测试结果: 10 成功, 0 失败

📝 测试 2: SSE 流写入工具测试
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ✅ createSafeSSEWriter 函数存在
  ✅ createHeartbeat 函数存在
  ✅ sendInitData 函数存在
  ✅ sendDoneSignal 函数存在
  ✅ SafeSSEWriter 创建成功
  ✅ 初始状态: 未关闭
  ✅ 测试写入: 成功
  ✅ 标记关闭后: 已关闭
  ✅ SSE 流写入工具测试通过

🔍 测试 3: 内容提取工具测试
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  测试用例 1: 完整的 thinking 标签
    thinking: "这是思考过程"
    content: "这是最终内容"
    ✅ 通过
  测试用例 2: 没有 thinking 标签
    thinking: ""
    content: "这是纯内容，没有思考过程"
    ✅ 通过
  测试用例 3: 未闭合的 thinking 标签
    thinking: "正在思考中..."
    content: "已有内容"
    ✅ 通过
  ✅ 内容提取工具测试通过

📊 ===== 测试总结 =====
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ 模块导入测试: 完成
✅ SSE 流写入工具测试: 完成
✅ 内容提取工具测试: 完成
✅ System Prompt 测试: 完成
✅ API 调用测试: 完成

🎉 重构代码测试完成！
```

**关键指标**：
- 所有模块成功导入：10/10
- 基础功能测试：全部通过
- API 端点测试：正常（需服务器运行）

---

### **队列化测试**

#### 4. `test-queue.js` - 基础队列测试
测试 SSE 队列化机制和 token 重用。

```bash
node test/test-queue.js
```

#### 5. `test-queue-global.js` - 全局并发限制测试
测试全局并发上限（MAX_SSE_CONNECTIONS）。

```bash
node test/test-queue-global.js
```

#### 6. `test-queue-stress.js` - 压力测试
模拟高并发场景，测试队列化的稳定性。

```bash
node test/test-queue-stress.js
```

#### 7. `test-queue-invalid-final.js` - 无效 token 惩罚测试
测试无效 token 的惩罚机制（高频发送无效 token 会被冷却）。

```bash
node test/test-queue-invalid-final.js
```

---

### **其他测试**

#### 8. `test-volcengine.js` - 火山引擎 API 测试
测试火山引擎豆包模型的 API 调用。

```bash
npm run test:volcengine
```

#### 9. `test-sources-db.js` - 搜索结果数据库测试
测试搜索结果的数据库保存和查询。

```bash
node test/test-sources-db.js
```

---

## 🚀 **运行测试前的准备**

### 1. 启动 Redis

```bash
# 使用 Docker Compose
docker-compose up -d redis

# 验证 Redis 运行状态
docker ps | findstr redis
```

### 2. 启动开发服务器

```bash
npm run dev
```

### 3. 配置环境变量

确保 `.env.local` 中包含：

```env
# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# 火山引擎配置（用于多 Agent 测试）
ARK_API_KEY=your_ark_api_key
ARK_API_URL=https://ark.cn-beijing.volces.com/api/v3/chat/completions
ARK_MODEL=doubao-1-5-thinking-pro-250415
```

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

