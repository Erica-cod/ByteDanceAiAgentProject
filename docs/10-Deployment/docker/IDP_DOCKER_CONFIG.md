# IDP Docker 配置说明

## 问题描述

在 Docker 环境中，IDP 认证服务（localhost:9000）无法被应用容器正确访问，导致 OIDC 认证流程失败。

## 问题根源

Docker 容器网络隔离导致以下问题：

1. **浏览器访问**：用户通过 `http://localhost:9000` 访问 IDP（通过端口映射到宿主机）
2. **容器内访问**：应用容器内的 `localhost` 指向容器自己，而不是 IDP 容器
3. **OIDC Issuer 验证**：OIDC 协议要求 issuer 完全匹配，但容器内无法正确解析 `localhost:9000`

## 解决方案

### 方案 A：使用宿主机网络（推荐用于本地开发）

在 `docker-compose.yml` 中，让应用容器使用宿主机网络：

```yaml
services:
  app:
    network_mode: "host"
    # ... 其他配置
```

**优点**：
- 应用容器可以直接访问 `localhost:9000`
- OIDC issuer 验证无问题
- 配置简单

**缺点**：
- 不适合生产环境
- 端口映射失效（直接使用宿主机端口）

### 方案 B：使用环境变量分离配置（推荐用于生产）

为 Docker 环境创建专门的配置：

**1. 创建 `.env.docker` 文件**

```bash
# IDP 配置（保持 localhost，因为浏览器需要访问）
IDP_ISSUER=http://localhost:9000
IDP_CLIENT_ID=ai-agent-bff
IDP_CLIENT_SECRET=your_secret_here
IDP_REDIRECT_URIS=http://localhost:8080/api/auth/callback

# 应用 OIDC 配置（使用宿主机 IP 或容器名）
OIDC_ISSUER=http://host.docker.internal:9000
OIDC_CLIENT_ID=ai-agent-bff
OIDC_CLIENT_SECRET=your_secret_here
OIDC_REDIRECT_URI=http://localhost:8080/api/auth/callback

# 其他配置...
MONGODB_URI=mongodb://mongodb-global:27017/ai-agent
REDIS_HOST=redis
REDIS_PASSWORD=your_redis_password
TAVILY_API_KEY=your_tavily_api_key
ARK_API_KEY=your_ark_api_key
```

**2. 修改 `docker-compose.yml`**

```yaml
services:
  app:
    env_file:
      - .env.docker  # 使用 Docker 专用配置
    environment:
      - OIDC_ISSUER=http://host.docker.internal:9000
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

### 方案 C：反向代理（最佳实践用于生产）

使用 Nginx 作为统一入口：

```yaml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - idp
      - app

  idp:
    # 不暴露端口到宿主机
    expose:
      - "9000"

  app:
    # 不暴露端口到宿主机
    expose:
      - "8080"
```

**nginx.conf**：
```nginx
http {
    upstream idp {
        server idp-ai-agent:9000;
    }
    
    upstream app {
        server bytedance-ai-agent:8080;
    }
    
    server {
        listen 80;
        
        location /auth {
            proxy_pass http://idp;
        }
        
        location / {
            proxy_pass http://app;
        }
    }
}
```

## 当前采用方案

目前项目采用**临时方案**：

在 `docker-compose.yml` 中：

```yaml
app:
  environment:
    - OIDC_ISSUER=http://localhost:9000
  extra_hosts:
    - "host.docker.internal:host-gateway"
```

并修改代码，尝试多个 IDP 地址：

```typescript
// 在 bffOidcAuth.ts 中
const IDP_URLS = [
  'http://localhost:9000',
  'http://host.docker.internal:9000',
  'http://idp-ai-agent:9000'
];

async function discoverIdP() {
  for (const url of IDP_URLS) {
    try {
      const config = await fetch(`${url}/.well-known/openid-configuration`);
      if (config.ok) return url;
    } catch (e) {
      continue;
    }
  }
  throw new Error('IDP not reachable');
}
```

## 验证步骤

### 1. 检查 IDP 是否可访问

```bash
# 从宿主机
curl http://localhost:9000/.well-known/openid-configuration

# 从应用容器内
docker exec bytedance-ai-agent wget -qO- http://host.docker.internal:9000/.well-known/openid-configuration
```

### 2. 检查环境变量

```bash
# IDP 容器
docker exec idp-ai-agent printenv | grep IDP

# 应用容器
docker exec bytedance-ai-agent printenv | grep OIDC
```

### 3. 测试认证流程

1. 浏览器访问：http://localhost:8080
2. 点击登录，应该跳转到：http://localhost:9000/auth
3. 登录后，应该回调到：http://localhost:8080/api/auth/callback

## 常见问题

### Q1: fetch failed / ECONNREFUSED

**原因**：应用容器无法访问 IDP

**解决**：
```bash
# 检查 extra_hosts 是否生效
docker exec bytedance-ai-agent cat /etc/hosts

# 应该看到类似：
# 192.168.65.254  host.docker.internal
```

### Q2: issuer mismatch

**原因**：OIDC issuer 验证失败

**解决**：确保 IDP 的 `IDP_ISSUER` 和应用的 `OIDC_ISSUER` 都使用浏览器可访问的地址（如 `http://localhost:9000`）

### Q3: redirect_uri mismatch

**原因**：回调地址不匹配

**解决**：
```bash
# 检查 IDP 配置
docker exec idp-ai-agent printenv IDP_REDIRECT_URIS

# 检查应用配置
docker exec bytedance-ai-agent printenv OIDC_REDIRECT_URI

# 两者必须完全一致
```

## 推荐配置（生产环境）

使用 `docker-compose.prod.yml` + Nginx 反向代理：

```yaml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - idp
      - app

  idp:
    environment:
      - IDP_ISSUER=https://yourdomain.com
      - IDP_REDIRECT_URIS=https://yourdomain.com/api/auth/callback
    expose:
      - "9000"

  app:
    environment:
      - OIDC_ISSUER=http://idp-ai-agent:9000  # 容器内访问
      - OIDC_REDIRECT_URI=https://yourdomain.com/api/auth/callback
    expose:
      - "8080"
```

这样：
- 外部访问统一通过 HTTPS
- 容器间通信使用内部网络
- 配置清晰，易于维护

## 相关文档

- [Docker 部署指南](./DOCKER_MIGRATION_GUIDE.md)
- [环境变量配置](./ENV_SETUP_GUIDE.md)
- [IDP OIDC 快速开始](./docs/02-Security-System/IDP_OIDC_PROVIDER_QUICKSTART.md)

---

**总结**：Docker 环境下的 IDP 配置需要特别注意网络隔离和 OIDC issuer 验证。推荐使用 Nginx 反向代理统一入口，或在开发环境使用 `host.docker.internal` 访问宿主机服务。
