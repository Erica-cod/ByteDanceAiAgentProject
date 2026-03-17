# MongoDB 连接问题修复指南

## 问题描述

Docker 容器无法连接到 MongoDB，报错：
```
MongoServerSelectionError: getaddrinfo ENOTFOUND mongodb-global
```

## 问题原因

`docker-compose.yml` 依赖外部的 `mongodb-global` 容器，但 Docker DNS 解析存在时序问题，导致应用启动时无法解析主机名。

## 解决方案

已更新 `docker-compose.yml`，添加 MongoDB 服务到同一个 compose 文件中，确保正确的启动顺序和依赖关系。

## 使用步骤

### 1. 停止现有容器

```bash
# 停止并删除现有容器
docker-compose down

# 如果有旧的 mongodb-global 容器，也停止它
docker stop mongodb-global
docker rm mongodb-global
```

### 2. 清理（可选）

如果需要清空数据库重新开始：

```bash
# 删除 MongoDB 数据卷
docker volume rm bytedanceaiagentproject_mongodb-data

# 删除 Redis 数据卷
docker volume rm bytedanceaiagentproject_redis-data
```

⚠️ **警告**：这会删除所有数据库数据！

### 3. 启动服务

```bash
# 确保 shared-network 网络存在
docker network create shared-network 2>$null

# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f app
```

### 4. 验证连接

```bash
# 检查所有容器状态
docker-compose ps

# 应该看到：
# - mongodb-global    (healthy)
# - redis-ai-agent    (healthy)
# - idp-ai-agent      (healthy)
# - bytedance-ai-agent (healthy)

# 查看 MongoDB 日志
docker logs mongodb-global --tail 20

# 查看应用日志，应该看到：
# ✅ MongoDB connected successfully
docker logs bytedance-ai-agent | findstr "MongoDB"
```

## 配置说明

### 更新的 docker-compose.yml 包含：

1. **MongoDB 服务**
   - 容器名：`mongodb-global`
   - 端口：`27017`
   - 健康检查：确保数据库准备就绪
   - 数据持久化：使用 Docker volume

2. **Redis 服务**
   - 容器名：`redis-ai-agent`
   - 端口：`6379`
   - 健康检查：确保 Redis 准备就绪
   - 密码保护：使用环境变量

3. **IDP 服务**
   - 依赖：Redis (healthy)
   - 端口：`9000`

4. **应用服务**
   - 依赖：MongoDB (healthy), Redis (healthy), IDP (started)
   - 端口：`8080`
   - 正确的启动顺序：MongoDB → Redis → IDP → App

## 环境变量

确保设置以下环境变量（在 `.env.local` 或通过命令行）：

```bash
# Redis 密码
REDIS_PASSWORD=your_secure_redis_password

# MongoDB URI（docker-compose 会自动设置，无需手动配置）
# MONGODB_URI=mongodb://mongodb-global:27017/ai-agent

# API 密钥
TAVILY_API_KEY=your_tavily_api_key
ARK_API_KEY=your_ark_api_key
```

## 故障排查

### 问题 1：容器无法启动

```bash
# 查看详细日志
docker-compose logs

# 检查端口占用
netstat -ano | findstr ":8080"
netstat -ano | findstr ":27017"
```

### 问题 2：MongoDB 连接超时

```bash
# 检查 MongoDB 容器状态
docker ps -f name=mongodb-global

# 进入 MongoDB 容器测试
docker exec -it mongodb-global mongosh

# 在 mongosh 中执行：
use ai-agent
db.test.insertOne({test: 1})
db.test.find()
```

### 问题 3：网络问题

```bash
# 检查网络
docker network ls
docker network inspect shared-network

# 确保所有容器都在同一网络
docker inspect mongodb-global -f '{{range $key, $value := .NetworkSettings.Networks}}{{$key}} {{end}}'
docker inspect bytedance-ai-agent -f '{{range $key, $value := .NetworkSettings.Networks}}{{$key}} {{end}}'
```

### 问题 4：DNS 解析失败

```bash
# 从应用容器内测试 DNS
docker exec bytedance-ai-agent ping -c 2 mongodb-global
docker exec bytedance-ai-agent nslookup mongodb-global
```

## 生产环境

对于生产环境，建议使用 `docker-compose.prod.yml`：

```bash
# 创建环境变量文件
cp deploy/env.example deploy/.env
# 编辑 deploy/.env 填入真实配置

# 启动生产环境
docker-compose -f docker-compose.prod.yml up -d
```

`docker-compose.prod.yml` 包含完整的服务栈（MongoDB, Redis, Ollama, IDP, App），适合生产部署。

## 相关文档

- [环境变量配置指南](./ENV_SETUP_GUIDE.md)
- [Docker 迁移指南](./DOCKER_MIGRATION_GUIDE.md)
- [README](./README.md)

---

**总结**：修复后的 `docker-compose.yml` 包含了 MongoDB 服务，并配置了正确的依赖关系和健康检查，确保容器按正确的顺序启动并能互相连接。
