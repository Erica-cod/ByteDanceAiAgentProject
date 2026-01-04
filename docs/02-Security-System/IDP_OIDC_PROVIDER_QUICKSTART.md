# 🚀 路线 A Quickstart：自研简化 IdP（`oidc-provider` + Redis）

> 你已选择路线 A：用成熟的 OIDC Provider 实现做“协议骨架”，自研用户/风控/存储。
>
> 本仓库已内置一个 **可跑的演示版 IdP**：`idp/server.ts`（Redis 存储）。

## 1) 安装与启动

### 启动 IdP

```bash
npm run dev:idp
```

默认会监听：`http://localhost:9000`

### 验证 OIDC Discovery

访问（浏览器打开即可）：
- `http://localhost:9000/.well-known/openid-configuration`

如果看到 JSON 且包含 `authorization_endpoint/token_endpoint/jwks_uri`，说明 IdP 正常。

## 2) 环境变量（写到 `.env.local`）

IdP 复用你现有 Redis 配置：
- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD`（没有就留空）

新增 IdP 配置（示例）：

```ini
# ===== IdP（OIDC Provider）=====
IDP_ISSUER=http://localhost:9000
IDP_PORT=9000

# 给 BFF 用的 OIDC Client（演示）
IDP_CLIENT_ID=ai-agent-bff
IDP_CLIENT_SECRET=dev_secret_change_me
IDP_REDIRECT_URIS=http://localhost:8080/api/auth/callback

# Cookie 签名密钥（演示可用，生产必须换）
IDP_COOKIE_KEY_1=dev_cookie_key_1_change_me
IDP_COOKIE_KEY_2=dev_cookie_key_2_change_me
```

## 3) 交互页与 deviceIdHash（风控信号）

当前 IdP 的交互页在：
- `/interaction/:uid`

并且 IdP 已允许在 `/auth` 授权请求中透传自定义参数：
- `deviceIdHash`

你可以在发起授权时带上：
- `deviceIdHash=...`

IdP 会在登录时：
- 记录登录事件到 Redis 列表：`idp:login_events`（最多保留 1000 条）
- 将账号与设备绑定：`idp:account_device:{accountId}:{deviceIdHash}`（默认保留 30 天）
- 首次见到的设备会标记为 `risk=medium`（演示）

## 4) 下一步：让 BFF 走真正的 OIDC 登录

现在 IdP 已就绪，下一步我们会把 BFF 的 `/api/auth/login` + `/api/auth/callback` 做成：
- 授权码 + PKCE
- BFF 代管 token（refresh/access 只存服务端）
- 前端只拿 HttpOnly session cookie

你确认一下：
- BFF 仍在 `http://localhost:8080`（你项目默认端口）
- 回调地址是否就是：`http://localhost:8080/api/auth/callback`


