# Nginx 反向代理配置完成

## 部署架构

```
浏览器 (http://localhost:8000)
  ↓
Nginx (nginx-reverse-proxy:80, 映射到宿主机8000)
  ├─→ /auth, /token, /.well-known/* → IDP (idp-ai-agent:9000)
  └─→ /* → 主应用 (bytedance-ai-agent:8080)
```

## 配置说明

### 1. Nginx 反向代理

**文件**: `nginx.conf`

- 监听端口：80（容器内部）
- 映射端口：8000（宿主机访问）
- IDP 路由：`/auth`, `/token`, `/jwks`, `/me`, `/session`, `/.well-known/*`
- 应用路由：其他所有路径

### 2. 服务端口配置

| 服务 | 容器内端口 | 暴露端口 | 说明 |
|------|----------|---------|------|
| Nginx | 80 | 8000 (宿主机) | 统一入口 |
| IDP | 9000 | 无 (内部) | 仅容器间访问 |
| App | 8080 | 无 (内部) | 仅容器间访问 |
| MongoDB | 27017 | 27017 (宿主机) | 数据库 |
| Redis | 6379 | 6379 (宿主机) | 缓存 |

### 3. 环境变量配置

**IDP 配置** (idp-ai-agent):
```bash
IDP_ISSUER=http://localhost:8000
IDP_REDIRECT_URIS=http://localhost:8000/api/auth/callback
```

**应用 OIDC 配置** (bytedance-ai-agent):
```bash
OIDC_ISSUER=http://idp-ai-agent:9000  # 容器间访问
OIDC_REDIRECT_URI=http://localhost:8000/api/auth/callback
```

## 使用方法

### 启动服务

```bash
# 方式1：使用修复脚本
npm run docker:fix-mongo

# 方式2：手动启动
docker-compose down
docker-compose up -d
```

### 访问应用

1. **主应用**: http://localhost:8000
2. **IDP 登录**: http://localhost:8000/auth （Nginx 会转发到 IDP）
3. **OIDC 配置**: http://localhost:8000/.well-known/openid-configuration
4. **健康检查**: http://localhost:8000/health

### 验证部署

```bash
# 1. 检查所有容器状态
docker-compose ps

# 2. 测试 Nginx 健康检查
curl http://localhost:8000/health
# 应该返回：healthy

# 3. 测试 IDP 配置
curl http://localhost:8000/.well-known/openid-configuration
# 应该返回 JSON 配置

# 4. 查看日志
docker-compose logs -f nginx
docker-compose logs -f idp
docker-compose logs -f app
```

## 故障排查

### 问题 1：无法访问 http://localhost:8000

**检查**:
```bash
# 查看 Nginx 容器状态
docker ps | findstr nginx

# 查看 Nginx 日志
docker logs nginx-reverse-proxy

# 测试端口
netstat -ano | findstr ":8000"
```

**解决**:
- 确保 8000 端口未被其他程序占用
- 检查 Windows 防火墙设置
- 重启 Docker Desktop

### 问题 2：IDP 认证失败

**检查**:
```bash
# 从应用容器访问 IDP
docker exec bytedance-ai-agent wget -qO- http://idp-ai-agent:9000/.well-known/openid-configuration

# 从 Nginx 容器访问 IDP
docker exec nginx-reverse-proxy wget -qO- http://idp-ai-agent:9000/.well-known/openid-configuration
```

**解决**:
- 确保 `IDP_ISSUER` 和 `OIDC_ISSUER` 配置正确
- 检查 `IDP_REDIRECT_URIS` 和 `OIDC_REDIRECT_URI` 匹配
- 查看 IDP 日志：`docker logs idp-ai-agent`

### 问题 3：SSE 流式响应中断

**检查**:
```bash
# 查看 Nginx 配置
docker exec nginx-reverse-proxy cat /etc/nginx/nginx.conf | grep -A 5 "proxy_buffering"
```

**解决**:
已在 `nginx.conf` 中配置：
```nginx
proxy_buffering off;
proxy_cache off;
proxy_set_header X-Accel-Buffering no;
proxy_read_timeout 300s;
```

### 问题 4：MongoDB 连接失败

运行修复脚本：
```bash
npm run docker:fix-mongo
```

## 配置文件

### docker-compose.yml

- Nginx 服务配置
- 服务依赖关系
- 健康检查
- 端口映射

### nginx.conf

- 反向代理规则
- 上游服务器配置
- 请求头转发
- 超时设置
- SSE 支持

## 安全注意事项

1. **生产环境必须**：
   - 使用 HTTPS (SSL/TLS)
   - 更改默认密钥
   - 限制 CORS
   - 启用速率限制

2. **OIDC 安全**：
   - `IDP_CLIENT_SECRET` 和 `OIDC_CLIENT_SECRET` 必须一致
   - 回调 URI 必须完全匹配
   - 使用强随机密钥

3. **网络安全**：
   - IDP 和 App 不直接暴露到宿主机
   - 所有外部访问经过 Nginx
   - 启用 Nginx 访问日志审计

## 下一步

### 添加 HTTPS 支持

1. 生成或获取 SSL 证书
2. 修改 `nginx.conf` 添加 SSL 配置
3. 更新环境变量使用 HTTPS URL

### 添加速率限制

在 `nginx.conf` 中添加：
```nginx
http {
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    
    server {
        location /api/ {
            limit_req zone=api_limit burst=20 nodelay;
        }
    }
}
```

### 添加访问日志分析

```bash
# 实时查看访问日志
docker exec nginx-reverse-proxy tail -f /var/log/nginx/access.log

# 分析错误日志
docker exec nginx-reverse-proxy cat /var/log/nginx/error.log
```

## 相关文档

- [Docker 部署指南](./DOCKER_MIGRATION_GUIDE.md)
- [MongoDB 连接修复](./DOCKER_FIX_MONGODB.md)
- [IDP Docker 配置](./IDP_DOCKER_CONFIG.md)
- [环境变量配置](./ENV_SETUP_GUIDE.md)

---

**总结**：Nginx 反向代理统一了应用入口，所有外部访问通过 `http://localhost:8000`，内部服务间通过容器名通信，实现了安全的服务隔离。
