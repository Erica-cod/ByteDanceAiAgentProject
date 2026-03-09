# 🐳 Docker 部署指南

## 🚀 快速启动

### Windows PowerShell
```powershell
.\docker-start.ps1
```

### Linux/Mac
```bash
chmod +x docker-start.sh
./docker-start.sh
```

---

## 📋 手动启动步骤

### 步骤 1: 创建共享网络
```bash
docker network create shared-network
```

### 步骤 2: 启动 MongoDB
```bash
docker run -d \
  --name mongodb-global \
  --network shared-network \
  -p 27017:27017 \
  -v mongodb-data:/data/db \
  mongo:latest
```

**Windows PowerShell**:
```powershell
docker run -d `
  --name mongodb-global `
  --network shared-network `
  -p 27017:27017 `
  -v mongodb-data:/data/db `
  mongo:latest
```

### 步骤 3: 构建并启动应用
```bash
# 清理旧容器
docker rm -f bytedance-ai-agent

# 构建镜像（无缓存）
docker compose build --no-cache

# 启动应用
docker compose up -d
```

### 步骤 4: 验证
```bash
# 查看容器状态
docker compose ps

# 查看日志
docker logs -f bytedance-ai-agent

# 验证网络连接
docker network inspect shared-network
```

---

## 🔧 常见问题

### 问题 1: 容器无法连接到 MongoDB

**症状**: 应用日志显示 `MongoDB connection failed`

**解决方案**:
```bash
# 1. 确认两个容器在同一网络
docker network inspect shared-network

# 2. 确保 MongoDB 容器名正确
docker ps --filter name=mongodb-global

# 3. 手动连接 MongoDB 到网络（如果不在）
docker network connect shared-network mongodb-global

# 4. 重启应用容器
docker compose restart
```

### 问题 2: 端口被占用

**症状**: `Error: port 8080 already in use`

**解决方案**:
```bash
# 查找占用端口的进程
# Windows:
netstat -ano | findstr :8080

# Linux/Mac:
lsof -i :8080

# 停止占用端口的容器
docker ps | grep 8080
docker stop <container_id>
```

### 问题 3: 镜像构建缓存问题

**症状**: 代码修改后容器内没有更新

**解决方案**:
```bash
# 完全清理并重建
docker compose down
docker rmi bytedanceaiagentproject-app
docker compose build --no-cache
docker compose up -d
```

### 问题 4: 网络不存在

**症状**: `network shared-network not found`

**解决方案**:
```bash
# 创建网络
docker network create shared-network

# 重新启动容器
docker compose up -d
```

---

## 🛠️ 维护命令

### 查看日志
```bash
# 实时日志
docker logs -f bytedance-ai-agent

# 最近 100 行
docker logs --tail 100 bytedance-ai-agent
```

### 进入容器
```bash
docker exec -it bytedance-ai-agent sh
```

### 重启服务
```bash
# 重启应用容器
docker compose restart

# 重启 MongoDB
docker restart mongodb-global
```

### 停止服务
```bash
# 停止所有服务
docker compose down

# 停止并删除数据卷（⚠️ 会删除数据库数据）
docker compose down -v
```

### 清理资源
```bash
# 清理未使用的镜像
docker image prune -a

# 清理所有未使用的资源
docker system prune -a
```

---

## 📦 容器架构

```
┌─────────────────────────────────────────┐
│         Host Machine (Windows)          │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │      Ollama (Port 11434)          │  │
│  │      ↑                             │  │
│  │      │ host.docker.internal        │  │
│  └──────┼────────────────────────────┘  │
│         │                                │
│  ┌──────┴──────────────────────────┐   │
│  │    shared-network (bridge)      │   │
│  │                                  │   │
│  │  ┌────────────────────────────┐ │   │
│  │  │  bytedance-ai-agent        │ │   │
│  │  │  (App Container)           │ │   │
│  │  │  Port: 8080                │ │   │
│  │  └────────────────────────────┘ │   │
│  │                                  │   │
│  │  ┌────────────────────────────┐ │   │
│  │  │  mongodb-global            │ │   │
│  │  │  (MongoDB Container)       │ │   │
│  │  │  Port: 27017               │ │   │
│  │  └────────────────────────────┘ │   │
│  └──────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

---

## ✅ 验证清单

启动后检查以下项目：

- [ ] shared-network 网络存在
- [ ] mongodb-global 容器运行中
- [ ] bytedance-ai-agent 容器运行中
- [ ] 两个容器都在 shared-network 中
- [ ] 应用日志显示 `✅ MongoDB connected successfully`
- [ ] 访问 http://localhost:8080 正常

---

## 🔄 更新部署流程

每次代码更新后：

```bash
# 1. 停止旧容器
docker compose down

# 2. 拉取最新代码
git pull origin main

# 3. 重新构建并启动
docker compose build --no-cache
docker compose up -d

# 4. 查看日志确认
docker logs -f bytedance-ai-agent
```

或者直接运行启动脚本：
```powershell
.\docker-start.ps1
```

---

## 📞 需要帮助？

如果遇到问题：

1. 查看容器日志：`docker logs bytedance-ai-agent`
2. 查看网络配置：`docker network inspect shared-network`
3. 检查容器状态：`docker compose ps`
4. 重新运行启动脚本：`.\docker-start.ps1`

