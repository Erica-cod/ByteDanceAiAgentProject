# Docker 配置迁移指南

## 📋 迁移概述

本次重构将原本单一的 `Dockerfile` 拆分为多个服务独立的 Dockerfile，提高了项目的可维护性和灵活性。

### 变更内容

#### 原架构
```
ByteDanceAiAgentProject/
├── Dockerfile (同时用于 app 和 idp)
├── docker-compose.yml
└── docker-compose.prod.yml
```

#### 新架构
```
ByteDanceAiAgentProject/
├── Dockerfile (已废弃，保留用于向后兼容)
├── dockerfiles/
│   ├── app.Dockerfile (主应用服务)
│   ├── idp.Dockerfile (IDP 认证服务)
│   └── README.md (详细文档)
├── docker-compose.yml (已更新)
├── docker-compose.prod.yml (已更新)
└── deploy/
    └── env.example (环境变量示例)
```

---

## 🔄 迁移步骤

### 第一步：更新本地环境

#### 1. 停止现有容器
```bash
docker-compose down
```

#### 2. 清理旧镜像（可选但推荐）
```bash
# 列出所有相关镜像
docker images | grep bytedance

# 删除旧镜像
docker rmi bytedance-ai-agent
docker rmi <其他相关镜像ID>
```

#### 3. 使用新配置构建并启动
```bash
# 构建并启动所有服务
docker-compose up -d --build

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f
```

---

### 第二步：更新生产环境

#### 1. 备份现有配置
```bash
# 导出当前运行的容器配置
docker-compose -f docker-compose.prod.yml config > backup-config.yml

# 备份数据卷
docker run --rm -v redis-data:/data -v $(pwd):/backup alpine tar czf /backup/redis-backup.tar.gz -C /data .
docker run --rm -v mongo-data:/data -v $(pwd):/backup alpine tar czf /backup/mongo-backup.tar.gz -C /data .
```

#### 2. 配置环境变量
```bash
# 复制环境变量示例
cp deploy/env.example deploy/.env

# 编辑 .env 文件，填入实际配置
vim deploy/.env
```

**重要环境变量：**
- `APP_IMAGE`: 主应用镜像（留空则本地构建）
- `IDP_IMAGE`: IDP 服务镜像（留空则本地构建）
- `REDIS_PASSWORD`: Redis 密码（必须修改）
- `MONGODB_URI`: MongoDB 连接字符串
- `TAVILY_API_KEY`: Tavily API 密钥
- `ARK_API_KEY`: Volcengine ARK API 密钥

#### 3. 停止旧服务
```bash
docker-compose -f docker-compose.prod.yml down
```

#### 4. 使用新配置启动
```bash
# 构建并启动所有服务
docker-compose -f docker-compose.prod.yml up -d --build

# 监控服务启动
docker-compose -f docker-compose.prod.yml logs -f
```

#### 5. 验证服务健康
```bash
# 检查所有服务状态
docker-compose -f docker-compose.prod.yml ps

# 健康检查
curl http://localhost:8080/  # 主应用
curl http://localhost:9000/.well-known/openid-configuration  # IDP
redis-cli -h localhost -p 6379 -a your_password ping  # Redis
```

---

## 📝 配置说明

### docker-compose.yml（开发/测试环境）

**变更内容：**
```yaml
# 原配置
app:
  build:
    context: .
    dockerfile: Dockerfile

# 新配置
app:
  build:
    context: .
    dockerfile: dockerfiles/app.Dockerfile
```

**特点：**
- 直接在 `environment` 中配置环境变量
- 使用外部 `shared-network` 网络（与外部 MongoDB 通信）
- Ollama 运行在宿主机（通过 `host.docker.internal` 访问）

---

### docker-compose.prod.yml（生产环境）

**变更内容：**
```yaml
# 原配置
idp:
  image: ${APP_IMAGE}

app:
  image: ${APP_IMAGE}

# 新配置
idp:
  build:
    context: .
    dockerfile: dockerfiles/idp.Dockerfile
  image: ${IDP_IMAGE:-bytedance-idp:latest}

app:
  build:
    context: .
    dockerfile: dockerfiles/app.Dockerfile
  image: ${APP_IMAGE:-bytedance-ai-agent:latest}
```

**特点：**
- 所有服务都在 Docker 中运行（包括 Ollama 和 MongoDB）
- 使用 `deploy/.env` 文件管理环境变量
- 使用内部 `app-net` bridge 网络
- 完整的服务健康检查和依赖管理

---

## 🏗️ 构建策略

### 本地构建（开发环境）
```bash
# 构建特定服务
docker-compose build app
docker-compose build redis

# 构建所有服务
docker-compose build

# 强制重新构建（无缓存）
docker-compose build --no-cache
```

### 生产镜像构建

#### 方式一：本地构建并推送到 Registry
```bash
# 构建主应用镜像
docker build -f dockerfiles/app.Dockerfile -t your-registry/bytedance-ai-agent:v1.0.0 .
docker push your-registry/bytedance-ai-agent:v1.0.0

# 构建 IDP 镜像
docker build -f dockerfiles/idp.Dockerfile -t your-registry/bytedance-idp:v1.0.0 .
docker push your-registry/bytedance-idp:v1.0.0

# 更新 deploy/.env
APP_IMAGE=your-registry/bytedance-ai-agent:v1.0.0
IDP_IMAGE=your-registry/bytedance-idp:v1.0.0
```

#### 方式二：服务器上本地构建
```bash
# 在 deploy/.env 中留空或使用默认值
# APP_IMAGE=bytedance-ai-agent:latest
# IDP_IMAGE=bytedance-idp:latest

# Docker Compose 会自动构建
docker-compose -f docker-compose.prod.yml up -d --build
```

---

## 🔍 服务说明

### 1. 主应用服务（app）
- **Dockerfile**: `dockerfiles/app.Dockerfile`
- **端口**: 8080
- **功能**: Modern.js 应用，提供 Web 界面和 BFF API
- **启动命令**: `npm run serve`

### 2. IDP 服务（idp）
- **Dockerfile**: `dockerfiles/idp.Dockerfile`
- **端口**: 9000
- **功能**: OIDC 身份提供者，处理用户认证
- **启动命令**: `npm run start:idp`

### 3. Redis
- **镜像**: `redis:7-alpine`
- **端口**: 6379
- **功能**: 缓存、会话存储、多代理状态管理

### 4. MongoDB（仅生产环境）
- **镜像**: `mongo:7`
- **端口**: 27017（内部）
- **功能**: 主数据库

### 5. Ollama（仅生产环境）
- **镜像**: `ollama/ollama:latest`
- **端口**: 11434
- **功能**: AI 模型推理服务

---

## 🧪 测试迁移

### 测试计划
```bash
# 1. 构建镜像
docker-compose build

# 2. 启动服务
docker-compose up -d

# 3. 检查服务状态
docker-compose ps

# 4. 测试主应用
curl http://localhost:8080/

# 5. 测试 IDP
curl http://localhost:9000/.well-known/openid-configuration

# 6. 测试 Redis
docker-compose exec redis redis-cli -a your_redis_password ping

# 7. 查看日志
docker-compose logs app
docker-compose logs idp
docker-compose logs redis
```

### 常见问题排查

#### 问题 1: 服务启动失败
```bash
# 查看详细日志
docker-compose logs --tail=50 [service_name]

# 检查容器状态
docker inspect [container_name]

# 重启服务
docker-compose restart [service_name]
```

#### 问题 2: 网络连接问题
```bash
# 检查网络
docker network ls
docker network inspect shared-network

# 重建网络
docker-compose down
docker-compose up -d
```

#### 问题 3: 端口冲突
```bash
# 查看端口占用
netstat -ano | findstr :8080
netstat -ano | findstr :9000

# 修改 docker-compose.yml 中的端口映射
ports:
  - "8081:8080"  # 改为 8081
```

#### 问题 4: 镜像构建失败
```bash
# 清理 Docker 缓存
docker system prune -a

# 强制重新构建
docker-compose build --no-cache [service_name]
```

---

## 📊 性能优化建议

### 1. 使用多阶段构建缓存
```bash
# 构建时利用缓存
docker-compose build

# 强制刷新缓存
docker-compose build --no-cache
```

### 2. 优化镜像大小
- 使用 `alpine` 基础镜像
- 清理 npm 缓存
- 仅复制必要文件

### 3. 资源限制（可选）
在 docker-compose 中添加资源限制：
```yaml
services:
  app:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

---

## 🔒 安全建议

### 1. 环境变量管理
- ❌ 不要提交 `deploy/.env` 到 Git
- ✅ 使用 `.gitignore` 排除敏感配置
- ✅ 在生产环境使用强密码

### 2. 网络隔离
- 生产环境使用内部网络（`app-net`）
- 仅暴露必要端口
- 考虑使用 Nginx 反向代理

### 3. 镜像安全
```bash
# 扫描镜像漏洞
docker scan bytedance-ai-agent:latest

# 定期更新基础镜像
docker pull node:20-alpine
docker-compose build --no-cache
```

---

## 📚 相关文档

- [dockerfiles/README.md](./dockerfiles/README.md) - Dockerfile 详细说明
- [DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md) - Docker 部署指南
- [deploy/env.example](./deploy/env.example) - 环境变量配置示例

---

## 🆘 获取帮助

如果遇到问题：

1. 查看日志：`docker-compose logs -f [service_name]`
2. 检查文档：阅读 `dockerfiles/README.md`
3. 验证配置：`docker-compose config`
4. 重建服务：`docker-compose down && docker-compose up -d --build`

---

## ✅ 迁移检查清单

- [ ] 停止旧容器
- [ ] 清理旧镜像
- [ ] 配置 `deploy/.env` 文件
- [ ] 更新环境变量
- [ ] 构建新镜像
- [ ] 启动所有服务
- [ ] 验证服务健康
- [ ] 测试应用功能
- [ ] 备份数据卷
- [ ] 更新部署文档

完成所有检查项后，迁移即完成！🎉
