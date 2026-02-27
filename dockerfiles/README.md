# Dockerfiles 目录

本目录包含项目中各个服务的独立 Dockerfile 配置。

## 文件说明

### app.Dockerfile
主应用服务的 Dockerfile，用于构建和运行 Modern.js 应用。

**构建方式：**
- 多阶段构建，优化镜像大小
- 第一阶段：编译 TypeScript 和构建前端资源
- 第二阶段：仅包含生产依赖和构建产物

**启动命令：** `npm run serve`

**端口：** 8080

---

### idp.Dockerfile
IDP (Identity Provider) 服务的 Dockerfile，用于运行 OIDC 认证服务。

**构建方式：**
- 多阶段构建
- 使用 tsx 直接运行 TypeScript 代码，无需预编译

**启动命令：** `npm run start:idp`

**端口：** 9000

---

## 使用说明

### 本地开发环境（docker-compose.yml）

```bash
# 启动所有服务
docker-compose up -d

# 构建并启动
docker-compose up -d --build

# 查看日志
docker-compose logs -f app
docker-compose logs -f idp
```

### 生产环境（docker-compose.prod.yml）

```bash
# 使用生产配置启动
docker-compose -f docker-compose.prod.yml up -d

# 构建并启动
docker-compose -f docker-compose.prod.yml up -d --build
```

### 单独构建镜像

```bash
# 构建主应用镜像
docker build -f dockerfiles/app.Dockerfile -t bytedance-ai-agent:latest .

# 构建 IDP 服务镜像
docker build -f dockerfiles/idp.Dockerfile -t bytedance-idp:latest .
```

---

## 服务说明

### 依赖官方镜像的服务

以下服务直接使用官方 Docker 镜像，无需自定义 Dockerfile：

- **Redis**: `redis:7-alpine` - 用于缓存和会话存储
- **MongoDB**: `mongo:7` - 主数据库
- **Ollama**: `ollama/ollama:latest` - AI 模型推理服务

---

## 注意事项

1. **环境变量配置**
   - 开发环境：在 `docker-compose.yml` 中直接配置
   - 生产环境：通过 `./deploy/.env` 文件加载

2. **网络配置**
   - 开发环境：使用外部 `shared-network` 网络
   - 生产环境：使用内部 `app-net` bridge 网络

3. **数据持久化**
   - Redis: `redis-data` volume
   - MongoDB: `mongo-data` volume
   - Ollama: `ollama-data` volume

4. **健康检查**
   - 所有服务都配置了健康检查
   - 生产环境中服务启动有依赖顺序（depends_on + condition）

---

## 维护建议

### 更新依赖
定期更新 package.json 后，需要重新构建镜像：
```bash
docker-compose build --no-cache
```

### 清理旧镜像
```bash
# 清理未使用的镜像
docker image prune -a

# 清理构建缓存
docker builder prune
```

### 日志管理
```bash
# 查看特定服务日志
docker-compose logs -f [service_name]

# 查看最近 100 行日志
docker-compose logs --tail=100 [service_name]
```

---

## 故障排查

### 服务启动失败
1. 检查日志：`docker-compose logs [service_name]`
2. 检查健康状态：`docker-compose ps`
3. 验证环境变量：`docker-compose config`

### 网络问题
```bash
# 检查网络连接
docker network ls
docker network inspect shared-network
docker network inspect app-net

# 重建网络
docker-compose down
docker-compose up -d
```

### 数据卷问题
```bash
# 查看数据卷
docker volume ls

# 备份数据卷
docker run --rm -v redis-data:/data -v $(pwd):/backup alpine tar czf /backup/redis-backup.tar.gz -C /data .
```
