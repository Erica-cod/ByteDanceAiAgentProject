# Redis Docker 配置指南

## 📋 当前配置

你的 Redis 已在 `docker-compose.yml` 中配置，密码为 `your_redis_password`。

## 🔧 配置步骤

### 1. 创建本地环境变量文件

```bash
# 复制模板文件
cp .env.example .env
```

然后编辑 `.env` 文件，确保 Redis 密码与 `docker-compose.yml` 中一致：

```bash
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password  # 与 docker-compose.yml 第 8 行保持一致
```

### 2. 重启 Redis 容器（如果密码有变化）

```bash
# 停止并删除旧容器
docker-compose down redis

# 重新启动 Redis
docker-compose up -d redis
```

### 3. 验证 Redis 连接

```bash
# 方法 1: 使用 Docker 命令连接
docker exec -it redis-ai-agent redis-cli -a your_redis_password ping
# 应该返回: PONG

# 方法 2: 使用本地 redis-cli（如果安装了）
redis-cli -h localhost -p 6379 -a your_redis_password ping
# 应该返回: PONG
```

### 4. 测试工具系统的 Redis 缓存

```bash
npm run test:fallback
```

## 🔐 修改 Redis 密码（可选）

如果你想修改密码，需要同时更新两个地方：

### 1. 修改 `docker-compose.yml`

```yaml
services:
  redis:
    # ...
    command: redis-server --appendonly yes --requirepass 你的新密码
    # ...
    
  app:
    environment:
      # ...
      - REDIS_PASSWORD=你的新密码  # Docker 容器内的应用使用
```

### 2. 修改 `.env`（本地开发使用）

```bash
REDIS_PASSWORD=你的新密码
```

### 3. 重启 Redis 容器

```bash
docker-compose down redis
docker-compose up -d redis
```

## ⚠️ 注意事项

1. **密码一致性**：确保 3 个地方的密码一致
   - `docker-compose.yml` 第 8 行（Redis 服务器配置）
   - `docker-compose.yml` 第 36 行（app 容器环境变量）
   - `.env` 文件（本地开发环境）

2. **不要提交 .env**：`.env` 文件包含敏感信息，已被 `.gitignore` 忽略

3. **生产环境**：生产环境应该使用更强的密码，建议使用密码管理工具

## 🧪 测试 Redis 缓存功能

### 快速测试

```bash
# 运行降级和缓存测试
npm run test:fallback
```

### 预期输出

```
✅ [CacheManager] Redis 缓存已启用
✅ 缓存命中: search_web
```

如果看到 `⚠️ [CacheManager] Redis 不可用，使用内存缓存`，说明：
- Redis 密码配置错误
- Redis 服务未启动
- 端口被占用

## 📊 监控 Redis

### 查看 Redis 日志

```bash
docker logs -f redis-ai-agent
```

### 查看 Redis 统计信息

```bash
docker exec -it redis-ai-agent redis-cli -a your_redis_password INFO
```

### 查看缓存键

```bash
# 查看所有工具缓存键
docker exec -it redis-ai-agent redis-cli -a your_redis_password KEYS "tool:cache:*"

# 查看缓存数量
docker exec -it redis-ai-agent redis-cli -a your_redis_password DBSIZE
```

## 🔍 故障排查

### 问题 1: NOAUTH Authentication required

**原因**：密码配置不正确

**解决**：检查 `.env` 文件中的 `REDIS_PASSWORD` 是否与 `docker-compose.yml` 一致

### 问题 2: Connection refused

**原因**：Redis 容器未启动

**解决**：
```bash
docker-compose up -d redis
docker ps | grep redis
```

### 问题 3: 缓存不生效

**原因**：Redis 连接失败，系统自动降级到内存缓存

**解决**：
1. 检查 Redis 是否运行：`docker ps | grep redis`
2. 检查密码配置
3. 查看应用日志确认错误信息

## 🎯 最佳实践

1. **开发环境**：使用简单密码，方便调试
2. **生产环境**：使用强密码（至少 16 位，包含大小写字母、数字、特殊字符）
3. **定期备份**：Redis 数据持久化到 `redis-data` volume
4. **监控**：定期检查 Redis 内存使用情况

## 📚 相关文档

- [工具降级机制和 Redis 缓存](./api/tools/v2/FALLBACK_AND_REDIS_CACHE.md)
- [Docker Compose 配置](./docker-compose.yml)
- [Redis 官方文档](https://redis.io/documentation)

