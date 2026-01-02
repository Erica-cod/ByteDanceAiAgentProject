# Redis 配置指南 - 多 Agent 断点续传

## 🎯 **功能说明**

本项目使用 Redis 实现**多 Agent 状态缓存和断点续传**功能，解决以下问题：

### **问题场景**
```
多 agent 模式消耗大量 token：
第 1 轮：Planner (200 tokens) + Critic (150 tokens) + Host (100 tokens) = 450 tokens
第 2 轮：Planner (180 tokens) + Critic (120 tokens) + Host (80 tokens) = 380 tokens
第 3 轮：Planner (160 tokens) + Critic (100 tokens) + Host (70 tokens) = 330 tokens
第 4 轮：Reporter (300 tokens) ← 🔴 在这里中断
────────────────────────────────────────────────
累计消耗：1460 tokens

❌ 没有断点续传：
- 重连后重新生成 → 再消耗 1460 tokens
- 真实成本：1460 (浪费) + 1460 (重新生成) = 2920 tokens！

✅ 有断点续传：
- 前 3 轮状态已保存在 Redis
- 重连后从第 4 轮继续 → 只消耗 300 tokens
- 真实成本：1460 (初始) + 300 (续传) = 1760 tokens
- 节省率：40%！
```

---

## 📦 **Docker 安装（推荐）**

### **方式 1：使用 Docker Compose（一键启动）**

1. 确保 Docker Desktop 已运行
2. 启动 Redis 容器：
   ```powershell
   docker-compose up -d redis
   ```

3. 验证状态：
   ```powershell
   docker ps | findstr redis
   # 应该看到：redis-ai-agent ... Up ... (healthy)
   ```

### **方式 2：手动 Docker 命令**

```bash
docker run -d \
  --name redis-ai-agent \
  -p 6379:6379 \
  --network shared-network \
  -v redis-data:/data \
  redis:7-alpine \
  redis-server --appendonly yes --requirepass your_redis_password
```

---

## ⚙️ **环境变量配置**

在 `.env.local` 中添加以下配置：

```env
# Redis 配置（用于多 Agent 状态缓存和断点续传）
REDIS_HOST=localhost       # Docker 容器内使用 'redis'
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
```

---

## 🔧 **本地安装（Windows）**

如果不使用 Docker，可以手动安装 Redis：

### **使用 WSL2 安装**

1. 安装 WSL2（如果未安装）：
   ```powershell
   wsl --install
   ```

2. 在 WSL 中安装 Redis：
   ```bash
   sudo apt update
   sudo apt install redis-server
   ```

3. 启动 Redis：
   ```bash
   sudo service redis-server start
   ```

4. 验证：
   ```bash
   redis-cli ping
   # 应该返回：PONG
   ```

---

## 📊 **Redis 数据结构**

### **缓存的数据**

```typescript
Key: multi_agent:{conversationId}:{assistantMessageId}
Value: {
  completedRounds: number,        // 已完成的轮次
  sessionState: MultiAgentSession, // 会话完整状态
  userQuery: string,              // 用户查询
  timestamp: number               // 缓存时间
}
TTL: 300 秒（5 分钟）
```

### **示例**

```
Key: multi_agent:conv_123:msg_456
Value: {
  "completedRounds": 3,
  "sessionState": {
    "session_id": "session_1234567890",
    "user_query": "什么是量子计算？",
    "mode": "multi_agent",
    "status": "in_progress",
    "current_round": 3,
    "max_rounds": 5,
    "agents": { ... },
    "history": [ ... ],
    "consensus_trend": [0.65, 0.75, 0.82]
  },
  "userQuery": "什么是量子计算？",
  "timestamp": 1703923200000
}
TTL: 300 秒（5 分钟后自动删除）
```

---

## 🔍 **验证 Redis 连接**

### **使用 Redis CLI**

```bash
# 连接到 Redis
docker exec -it redis-ai-agent redis-cli

# 输入密码（如果设置了）
AUTH your_redis_password

# 测试
PING
# 返回：PONG

# 查看所有缓存的会话
KEYS multi_agent:*

# 查看某个会话的状态
GET multi_agent:conv_123:msg_456

# 退出
EXIT
```

### **使用代码验证**

启动项目后，查看日志：

```
✅ Redis 已连接: localhost:6379
💾 已保存多 agent 状态: multi_agent:conv_123:msg_456 (第 3 轮)
🔄 从 Redis 恢复状态，将从第 4 轮继续
```

---

## 📈 **性能监控**

### **查看 Redis 状态**

```bash
docker exec -it redis-ai-agent redis-cli INFO stats
```

关键指标：
- `total_commands_processed`：总命令数
- `instantaneous_ops_per_sec`：当前每秒操作数
- `used_memory_human`：内存使用量
- `connected_clients`：连接客户端数

### **查看缓存键数量**

```bash
docker exec -it redis-ai-agent redis-cli DBSIZE
```

---

## 🐛 **故障排查**

### **问题 1：Redis 连接失败**

```
❌ Redis 连接错误: ECONNREFUSED 127.0.0.1:6379
```

**解决方案**：
1. 检查 Redis 容器是否运行：
   ```powershell
   docker ps | findstr redis
   ```

2. 检查端口是否被占用：
   ```powershell
   netstat -an | findstr 6379
   ```

3. 重启 Redis 容器：
   ```powershell
   docker restart redis-ai-agent
   ```

### **问题 2：Redis 认证失败**

```
❌ Redis 连接错误: WRONGPASS invalid username-password pair
```

**解决方案**：
检查 `.env.local` 中的 `REDIS_PASSWORD` 是否与 Docker 配置一致。

### **问题 3：断点续传不工作**

```
⚠️  Redis 中未找到可用状态，将从头开始
```

**原因**：
- Redis 不可用（降级到不使用缓存）
- 缓存已过期（5 分钟 TTL）
- `clientAssistantMessageId` 不匹配

**解决方案**：
1. 确认 Redis 运行正常：
   ```bash
   docker logs redis-ai-agent
   ```

2. 检查日志中的缓存键：
   ```
   💾 已保存多 agent 状态: multi_agent:{conversationId}:{assistantMessageId}
   ```

3. 确认重连时间 < 5 分钟

---

## 🚀 **启动项目**

1. 启动 Redis：
   ```powershell
   docker-compose up -d redis
   ```

2. 启动项目：
   ```powershell
   npm run dev
   ```

3. 测试多 Agent 模式：
   - 切换到"多Agent模式"
   - 发送一个问题
   - 等待 2-3 轮后，手动断开网络
   - 重新连接网络
   - 观察是否从断点继续

---

## 📚 **相关文件**

- `api/services/redisClient.ts` - Redis 客户端工具类
- `api/services/sseLimiter.ts` - SSE 并发控制
- `api/workflows/multiAgentOrchestrator.ts` - 多 Agent 编排器
- `api/lambda/chat.ts` - 聊天 API（集成 Redis）
- `src/hooks/useSSEStream.ts` - 前端 SSE 流处理
- `docker-compose.yml` - Docker 配置
- `start-redis.ps1` - Redis 启动脚本

---

## 💡 **优化建议**

### **生产环境**

1. **Redis 持久化**：
   - 使用 AOF（Append Only File）持久化
   - 配置自动备份策略

2. **Redis 集群**：
   - 使用 Redis Sentinel 实现高可用
   - 使用 Redis Cluster 实现分片

3. **监控告警**：
   - 集成 Prometheus + Grafana 监控 Redis
   - 设置内存使用告警

4. **安全**：
   - 使用强密码
   - 限制访问 IP
   - 启用 TLS 加密

### **开发环境**

1. **降级策略**：
   - Redis 不可用时自动降级（当前已实现）
   - 日志清晰标注是否使用缓存

2. **调试工具**：
   - 使用 RedisInsight 可视化管理
   - 使用 Redis Monitor 实时查看命令

---

## 🎤 **面试答题模板**

> **面试官**：你们的多 Agent 模式如果中断了，token 不是浪费了吗？

**你的回答**：

"这确实是个严重问题。我实现了基于 Redis 的断点续传机制：

**技术方案**：
1. 每轮结束后，将会话状态序列化并保存到 Redis（5 分钟 TTL）
2. 中断重连时，前端传递 `resumeFromRound` 参数
3. 后端从 Redis 恢复状态，从指定轮次继续

**效果**：
- Token 节省率：40-80%（取决于中断时机）
- 用户体验：无需重新等待已完成的讨论
- 降级策略：Redis 不可用时自动降级到重新生成

**实现要点**：
- 会话状态序列化：`JSON.stringify(session)`
- 键设计：`multi_agent:{conversationId}:{assistantMessageId}`
- 原子性保证：每轮结束后立即保存
- 自动清理：5 分钟 TTL，避免内存泄漏

这个方案在成本节省和实现复杂度之间取得了最佳平衡。"

