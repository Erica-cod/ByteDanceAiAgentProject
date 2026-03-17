# 🧩 自研“简化版 IdP”方案（OIDC/OAuth2 + BFF 管 Token + 设备指纹风控）

> 目标：**前端尽量不直接持有 `access_token/refresh_token`**，统一由 **Modern.js BFF** 代管，同时把你现有的 `deviceIdHash`（Canvas/GPU 等）接入 **登录风控/账号保护**。
>
> 适用：你当前项目是单体 Modern.js（前端 + BFF 同源），想做演示/可控的 SSO 能力，但暂时接不了企业 IdP。

---

## 0. 先说清楚：自研 IdP 的“最小可用”边界

如果你“完全从零”实现 OIDC Provider，会踩很多坑（签名校验、JWK 轮转、授权码/刷新令牌安全、重放/CSRF、防开放重定向、会话与登出、一堆细节）。

**强烈建议的自研路线**：
- **IdP 不从零写协议**，而是用成熟实现做“协议骨架”，你只做：
  - 用户体系（demo 或真实）
  - UI/交互（登录页、同意页）
  - 令牌存储/撤销（DB/Redis）
  - 风控（设备指纹、登录保护）

**常见选型**：
- **Node.js**：`oidc-provider`（成熟的 OIDC Provider 实现，你写配置和持久化适配）
  - `https://www.npmjs.com/package/oidc-provider`
  - `https://github.com/panva/node-oidc-provider`
- **Go**：ORY Hydra（更偏企业级/微服务化，学习成本高一些）
  - `https://www.ory.sh/hydra/docs/`
  - `https://github.com/ory/hydra`
- **现成 IdP**（不自研协议）：Keycloak（功能全但偏重）
  - `https://www.keycloak.org/docs/latest/securing_apps/#openid-connect`

---

## 1. 推荐总体形态：IdP 独立服务 + BFF 代管 Token（浏览器只拿 Cookie）

### 组件
- **Browser（React）**：不存 token；只发起跳转/调用 `/api/auth/*`；拿到的是“已登录/用户信息/权限”
- **BFF（你项目的 `/api/*`）**：OAuth 客户端（Relying Party），**持有并刷新 token**，并发会话 Cookie（HttpOnly）
- **IdP（你自研的认证中心）**：OIDC Provider，提供标准端点（authorize/token/userinfo/jwks/…）

### 为什么 BFF 代管 token
- 前端不落地 token：XSS 成本大幅提升
- 同源 Cookie：你现在就是 `/api` 前缀，天然同源，落地简单
- 风控集中：设备指纹、IP、速率限制、异常登录检测都放 BFF/IdP

---

## 2. “简化版 IdP”最小端点集合（OIDC 基本盘）

**必须**
- `GET /.well-known/openid-configuration`（OIDC Discovery）
  - 让 BFF 自动发现 `authorization_endpoint/token_endpoint/jwks_uri/userinfo_endpoint`
  - 规范：`https://openid.net/specs/openid-connect-discovery-1_0.html`
- `GET /jwks`（公开签名公钥）
- `GET /authorize`（授权码入口）
- `POST /token`（用 code 换 token；用 refresh_token 刷新）
- `GET /userinfo`（BFF 用 access_token 拉用户信息）

**建议**
- `POST /revoke`（撤销 refresh_token）
- `GET/POST /logout`（可选：OIDC RP-Initiated Logout）

---

## 3. BFF 端：推荐你现在就能落地的“会话 + token 代管”模型

### BFF 会话模型
- 浏览器拿到：`sid`（HttpOnly Cookie，例如 `__Host-bff_sid`）
- BFF 服务器存：`sid -> { sub, profile, roles, access_token, refresh_token, expires_at, deviceRisk }`
- 存储建议：演示内存；生产 Redis

### BFF 的 auth 路由（你项目建议）
- `GET /api/auth/login`：发起授权（重定向到 IdP `/authorize`）
- `GET /api/auth/callback`：收 code，换 token，创建 BFF session
- `GET /api/auth/me`：前端查询是否登录、用户、是否解锁多 Agent
- `POST /api/auth/logout`：清 BFF session；可选同时调用 IdP revoke/logout

> 你目前已经在分支里做了“演示 Cookie Session”；未来换成真正 IdP，只要保持 `/api/auth/me` 返回结构稳定，前端改动很小。

---

## 4. 把你现有 `deviceIdHash` 融进“账号保护/风控”的最佳切入点

你已有：
- 前端：`src/utils/privacyFirstFingerprint.ts` 生成 `deviceIdHash` 并上报 `/api/device/track`
- BFF：`/api/device/track` 可记录、清理设备

### A. 登录前（发起授权时）带上 deviceIdHash
流程：
1. 前端拿到 `deviceIdHash`
2. 跳转 `/api/auth/login?returnTo=...` 时附带 `deviceIdHash`（query 或 header）
3. BFF 在重定向 IdP 的 `/authorize` 时把它带过去：
   - 方案1（推荐）：作为 `login_hint`/自定义参数传给 IdP（IdP 端读取并记录）
   - 方案2：BFF 自己先把 `{state -> deviceIdHash}` 存 Redis，回调再取

### B. IdP 的“交互页”（登录页）做风险判定
在 IdP 的登录交互里，使用以下信号计算风险分：
- `deviceIdHash` 是否见过（账号历史绑定）
- IP/ASN/地理（粗粒度即可）
- UA 摘要（你已有）
- 失败次数、频率、异常时间段

风险处置建议：
- **低风险**：直接放行
- **中风险**：加验证码（或者要求邮件/短信一次性码）
- **高风险**：拒绝/冻结，或只给低权限会话

### C. 登录后：设备绑定 & 令牌刷新绑定（关键）
**不要只在登录时校验**，更重要的是在“刷新 refresh_token/敏感操作”时校验：
- refresh_token 在数据库中绑定：
  - `sub`
  - `deviceIdHash`（或设备集合）
  - `rotating_jti`（支持轮换）
  - `ipHash/uaHash`（可选）
- 每次 refresh：
  - 设备不一致 => 拒绝刷新（要求重新登录/二次校验）

这样你能把“设备指纹”转化为真正的**账号保护**，而不只是防刷。

---

## 5. “简化版 IdP”数据模型（最小集合）

### 用户与客户端
- `users(id, username, password_hash, created_at, status, mfa_enabled?)`
- `clients(client_id, client_secret_hash?, redirect_uris, grant_types, scopes)`

### 授权码与会话（短期）
- `auth_codes(code, client_id, sub, redirect_uri, code_challenge, expires_at, consumed_at, deviceIdHash)`

### 刷新令牌（强烈建议：只存服务端）
- `refresh_tokens(id, sub, client_id, deviceIdHash, expires_at, revoked_at, rotated_from?, family_id)`
  - **轮换**：每次 refresh 都签发新的 refresh_token，旧的标记 revoked（防重放）

### 设备绑定与风控
- `account_devices(sub, deviceIdHash, first_seen_at, last_seen_at, trust_level, risk_flags)`
- `login_events(sub?, deviceIdHash?, ipHash, uaHash, result, reason, created_at)`

---

## 6. 安全要点（别省略）

### OAuth2/OIDC 必做
- 授权码模式（不要 implicit）
- `state` 防 CSRF（回调必须校验）
- `nonce` 防 id_token 重放（OIDC 必做）
- PKCE（即使 BFF 做客户端也建议保留，演示更“标准”）

参考（权威）：
- OAuth2：`https://www.rfc-editor.org/rfc/rfc6749`
- PKCE：`https://www.rfc-editor.org/rfc/rfc7636`
- OAuth2 安全最佳实践：`https://www.rfc-editor.org/rfc/rfc9126`
- 浏览器应用最佳实践：`https://www.rfc-editor.org/rfc/rfc9700`
- OIDC Core：`https://openid.net/specs/openid-connect-core-1_0.html`

### Cookie Session + CSRF
- BFF 给浏览器只发 **HttpOnly + SameSite=Lax** 的 session cookie
- 写接口加 CSRF（double submit 或 session 绑定 token）
  - OWASP CSRF：`https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html`
  - OWASP Session：`https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html`

---

## 7. 两种“自研简化 IdP”的落地路线（按成本从低到高）

### 路线 A（推荐）：用 `oidc-provider` 搭 IdP，自己写用户/风控/存储
你实现：
- 用户登录交互页（用户名密码/验证码）
- deviceIdHash 风控策略
- Adapter：把授权码、refresh token、session 存到 Mongo/Redis

优点：协议坑少，比较“像真的”

### 路线 B：不做完整 OIDC，只做“中央登录中心 + BFF 票据交换”
只用于内部演示：
- IdP 只发一个短期 `ticket`（一次性、5分钟、绑定 deviceIdHash）
- BFF 用 ticket 换取自己的 session（cookie），不让浏览器接触任何 token

优点：最省事
缺点：不标准，后续接第三方/多应用会比较痛

---

## 8. 和你现有“单模型/多 Agent 解锁”的结合点（建议）

你已经做了“未登录禁用多 Agent”的 gating（演示 Cookie Session）。

当你切到真正 IdP 后：
- `GET /api/auth/me` 返回：
  - `loggedIn`
  - `user`
  - `canUseMultiAgent`（由 roles/level 或付费状态决定）
  - `risk`（可选，提示用户完成二次验证/绑定设备）
- 后端 `/api/chat` 在 `mode=multi_agent` 时强制校验 `canUseMultiAgent`

---

## 9. 一些补充阅读（偏工程实践/思路）
- 双 token/轮换的一些工程讨论（非权威）：`https://changweihua.github.io/zh-CN/blog/2025-06/double_token.html`
- SSO 方案概览（中文博客，作参考）：`https://www.cnblogs.com/zxlh1529/p/19166926`


