# 环境变量配置指南

## 📋 概述

本项目使用环境变量管理敏感配置信息（如 API 密钥、数据库密码等），避免将这些信息硬编码在代码中或提交到 Git 仓库。

## 🔒 安全说明

**⚠️ 重要提醒：**
- `.env.local` 和 `.env.production` 文件已添加到 `.gitignore`，不会被提交到 Git
- **切勿**将真实的 API 密钥、密码等敏感信息提交到 GitHub
- 生产环境必须使用强密码，不要使用默认值

## 📂 环境变量文件说明

### 本地开发环境

**文件名：** `.env.local` (需要手动创建)

```bash
# 从示例文件创建
cp .env.example .env.local
```

然后编辑 `.env.local` 文件，填入真实的配置信息。

### Docker 生产环境

**文件名：** `deploy/.env` (需要手动创建)

```bash
# 从示例文件创建
cp deploy/env.example deploy/.env
```

然后编辑 `deploy/.env` 文件，填入真实的配置信息。

## 🔑 必需的环境变量

### 1. Tavily 搜索 API

联网搜索功能需要此密钥。

```env
TAVILY_API_KEY=your_tavily_api_key_here
```

**获取方式：**
1. 访问 [Tavily 官网](https://tavily.com/)
2. 注册账号并登录
3. 在控制台获取 API Key

### 2. 火山引擎豆包大模型 API

使用豆包大模型需要此密钥。

```env
ARK_API_KEY=your_ark_api_key_here
ARK_API_URL=https://ark.cn-beijing.volces.com/api/v3/chat/completions
ARK_MODEL=your_ark_model_endpoint_id
```

**获取方式：**
1. 访问 [火山引擎控制台](https://console.volcengine.com/ark)
2. 创建 API Key
3. 配置模型 Endpoint ID

### 3. Redis 密码

**⚠️ 生产环境必须配置强密码！**

```env
REDIS_PASSWORD=your_secure_redis_password_here
```

**建议生成强密码：**

```bash
# Linux/Mac
openssl rand -base64 32

# PowerShell (Windows)
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

### 4. IDP Client Secret

内部身份认证服务的密钥。

```env
IDP_CLIENT_SECRET=your_secure_idp_client_secret_here
```

**⚠️ 生产环境必须更改默认值 `dev_secret_change_me`！**

### 5. OIDC Client Secret

OIDC 认证服务的密钥。

```env
OIDC_CLIENT_SECRET=your_secure_oidc_client_secret_here
```

**⚠️ 生产环境必须更改默认值 `dev_secret_change_me`！**

## 📦 可选的环境变量

### MongoDB 配置

```env
# 本地开发
MONGODB_URI=mongodb://localhost:27017/ai-agent

# Docker 生产环境
MONGODB_URI=mongodb://mongo:27017/ai-agent
```

### Ollama 配置

```env
OLLAMA_API_URL=http://localhost:11434
OLLAMA_MODEL=deepseek-r1:1.5b
```

### 性能配置

```env
MAX_SSE_CONNECTIONS=3
MEMORY_WINDOW_SIZE=10
MEMORY_MAX_TOKENS=4000
```

## 🚀 使用方法

### 本地开发

1. **创建环境变量文件：**
   ```bash
   cp .env.example .env.local
   ```

2. **编辑 `.env.local`，填入真实配置**

3. **启动项目：**
   ```bash
   npm run dev
   ```

### Docker 部署

#### 方式一：使用 docker-compose.yml（开发/测试）

1. **创建环境变量文件：**
   ```bash
   cp .env.example .env.local
   ```

2. **编辑 `.env.local`，填入真实配置**

3. **启动服务：**
   ```bash
   docker-compose up -d
   ```

4. **Docker Compose 会自动读取 `.env.local` 文件**

#### 方式二：使用 docker-compose.prod.yml（生产环境）

1. **创建环境变量文件：**
   ```bash
   cp deploy/env.example deploy/.env
   ```

2. **编辑 `deploy/.env`，填入真实配置**

3. **启动服务：**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

4. **Docker Compose 会读取 `deploy/.env` 文件**

## ✅ 验证配置

### 检查环境变量是否生效

```bash
# 本地开发
npm run dev

# 查看控制台输出，应该显示：
# 🔧 Tavily API Key: 已配置 (tvly-xxx...)
# 🔧 ARK API Key: 已配置 (9a75dc8d...)
```

### 检查 Docker 容器环境变量

```bash
# 查看应用容器的环境变量
docker exec bytedance-ai-agent env | grep -E "TAVILY|ARK|REDIS"

# 应该看到配置的环境变量值
```

## 🔍 故障排查

### 问题 1：API 密钥未生效

**症状：** 控制台显示 `⚠️ TAVILY_API_KEY 未配置`

**解决方法：**
1. 确认 `.env.local` 文件存在且位于项目根目录
2. 确认环境变量名称正确（区分大小写）
3. 重启开发服务器

### 问题 2：Docker 容器无法读取环境变量

**症状：** Docker 容器内环境变量为空

**解决方法：**
1. 确认 `docker-compose.yml` 中的 `environment` 配置正确
2. 确认环境变量文件路径正确
3. 重新构建并启动容器：
   ```bash
   docker-compose down
   docker-compose up -d --build
   ```

### 问题 3：Redis 连接失败

**症状：** `Redis connection error: WRONGPASS`

**解决方法：**
1. 确认 `REDIS_PASSWORD` 环境变量已设置
2. 确认密码在 Redis 服务和应用中一致
3. 重启 Redis 容器

## 📚 相关文档

- [Docker 部署指南](./DOCKER_MIGRATION_GUIDE.md)
- [Tavily 搜索集成指南](./docs/09-Third-Party-Integration/TAVILY_SEARCH_GUIDE.md)
- [项目 README](./README.md)

## 🤝 贡献指南

如果你发现新的需要配置的环境变量，请：

1. 在 `.env.example` 中添加示例配置
2. 在 `deploy/env.example` 中添加示例配置
3. 更新本文档
4. 提交 Pull Request

---

**最后提醒：** 请定期更换生产环境的密钥，确保安全！🔐
