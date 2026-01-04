# 🔐 SSO 登录体系设计（OAuth2 / OIDC + Modern.js BFF）

> 适用场景：当前项目是“弱登录 / 匿名用户 + 设备防刷”，希望升级为 **SSO（单点登录）**，并且保持 **BFF 同源**、**前端不落地敏感 Token**、可与现有 `deviceIdHash` 风控融合。

## 🎯 目标与边界

### 目标
- **标准化登录**：基于 **OAuth2 + OpenID Connect（OIDC）** 的登录（身份认证）。
- **SSO**：多个业务应用（不同域/子域/项目）共享同一个 IdP（身份提供方）的登录态。
- **安全默认**：前端尽量不直接持有 `access_token/refresh_token`，统一由 **BFF 管理**。
- **兼容现状**：保留你现有的“设备指纹/防刷”体系，把它作为 **风控信号** 和 **账号保护** 的一部分。

### 非目标（建议不自己造轮子）
- 不建议自研完整 IdP（账号体系 + MFA + 风控 + 审计 + 密钥轮转）作为第一版目标。
- 第一阶段建议接入成熟 IdP：**Keycloak / Auth0 / Okta / Authing / 企业自建 IAM**（它们都支持 OIDC）。

## 🧩 总体架构（推荐：BFF 代管 Token）

### 组件
- **Browser（React SPA）**：只负责触发登录、渲染登录态，不保存敏感 Token。
- **BFF（Modern.js /api）**：OAuth2/OIDC 客户端（Relying Party），处理重定向、回调、会话、Token 交换与刷新。
- **IdP（OIDC Provider）**：统一登录中心（SSO 的核心），负责用户认证、发放 `id_token/access_token/refresh_token`。
- **业务 API**：
  - 当前项目里基本都在 BFF 内（`api/lambda/*`）。
  - 如果未来拆出独立资源服务器，也建议由 BFF 带 Token 调用资源服务器（或使用后端网关）。

### 为什么用 BFF 管 OAuth？
- **同源 Cookie 会话**：`/api/*` 与页面同源（你现在就是这样），不需要复杂 CORS。
- **降低 XSS 伤害面**：前端不存 Token，XSS 很难直接拿到 `refresh_token`。
- **统一安全策略**：Token 刷新、撤销、权限校验、审计都在服务端集中实现。

## ✅ 标准选型（推荐“OIDC 授权码 + PKCE”）

### 推荐流程
- **OIDC Authorization Code Flow + PKCE**
  - OAuth2 负责“授权”，OIDC 在其上提供“身份”（`id_token`）。
  - PKCE 用于防止授权码被截获后被重放。

### 关键参数（必须做）
- **`state`**：防 CSRF（回调时校验）。
- **`nonce`**：防 `id_token` 重放（回调后校验 nonce）。
- **PKCE**：`code_verifier`（BFF 保存）+ `code_challenge`（发给 IdP）。

## 🔄 端到端流程（落到你项目的路由结构）

你项目已启用 BFF：`modern.config.ts` 中 `bff.prefix = '/api'`，并且 BFF 路由位于 `api/lambda/*`。

建议新增目录：
- `api/lambda/auth/login.ts` → `GET /api/auth/login`
- `api/lambda/auth/callback.ts` → `GET /api/auth/callback`
- `api/lambda/auth/logout.ts` → `POST /api/auth/logout`（或 `GET` 也可以，但更建议 `POST`）
- `api/lambda/auth/me.ts` → `GET /api/auth/me`

### 1) 开始登录：`GET /api/auth/login`
1. 前端点击“登录”，跳转到 `/api/auth/login?returnTo=/xxx`。
2. BFF 生成：
   - `state`（随机）
   - `nonce`（随机）
   - `code_verifier`（随机）
   - `code_challenge = BASE64URL(SHA256(code_verifier))`
3. BFF 将这组数据写入 **短期存储**（推荐 Redis，TTL 5-10 分钟）：
   - key：`oidc:login:{state}` 或随机 `loginId`
4. BFF 302 重定向到 IdP `/authorize`：
   - `response_type=code`
   - `scope=openid profile email`（按需）
   - `client_id=...`
   - `redirect_uri=https://your-app.com/api/auth/callback`
   - `state=...`
   - `nonce=...`
   - `code_challenge=...`
   - `code_challenge_method=S256`

### 2) 回调：`GET /api/auth/callback`
1. IdP 重定向回：`/api/auth/callback?code=...&state=...`
2. BFF：
   - 读取并校验 `state` 是否存在/未过期
   - 使用 `code_verifier` 向 IdP `/token` 换取 token
3. **验证 OIDC**（建议严格做）：
   - 校验 `id_token` 签名（用 IdP 的 JWKS）
   - 校验 `iss/aud/exp/iat`
   - 校验 `nonce`（与开始登录时一致）
4. 建立应用会话（Session）：
   - 生成 `sessionId`
   - 服务端保存会话：`sessionId -> { sub, user, roles, tokens, deviceRisk }`
   - 下发 Cookie（HttpOnly）：
     - `Set-Cookie: __Host-bff_sid=...; HttpOnly; Secure; SameSite=Lax; Path=/`
5. 302 重定向回 `returnTo`（或默认 `/`）。

### 3) 获取登录态：`GET /api/auth/me`
- 前端应用启动时调用 `/api/auth/me`
- BFF 从 `__Host-bff_sid` 找到会话并返回：
  - `user`（id/昵称/邮箱）
  - `roles/level`（给 `RequireAccess` 用）
  - 可选：`risk`（设备风险分数、是否需要二次校验）

### 4) 退出：`POST /api/auth/logout`
- BFF 清除本地会话（删除 Redis/session）
- 清 Cookie（Max-Age=0）
- 如果 IdP 支持 RP-Initiated Logout：
  - 可重定向到 IdP 的 `end_session_endpoint`
  - 实现“真正的单点退出”（需要 IdP 支持与配置）

## 🍪 会话与 CSRF 策略（建议）

### Cookie 建议
- **会话 Cookie**：`__Host-bff_sid`
  - `HttpOnly`：前端 JS 读不到
  - `Secure`：仅 HTTPS（生产必须）
  - `SameSite=Lax`：兼容 OAuth 回调的顶层导航；同时能降低 CSRF 风险
  - `Path=/` 且使用 `__Host-` 前缀（更强约束：不允许 Domain 属性、路径必须 `/`）

### CSRF
当你采用 **Cookie Session** 时，`POST/PUT/DELETE` 这类接口建议加 CSRF：
- **双提交 Cookie（double submit）**：BFF 下发 `csrf_token`（非 HttpOnly），前端在请求头加 `x-csrf-token`，BFF 校验二者一致。
- 或者将 CSRF token 放入 session 中并绑定 Origin/Referer 校验。

> 你现在很多接口是 JSON POST（比如 `/api/user`、`/api/device/track`），引入 SSO 后建议统一补齐 CSRF 防护（至少对“写操作”）。

## 🧠 如何融合你现有的“设备防刷/弱登录”

你目前已经有两条“身份线索”：
- **匿名 userId**：`src/utils/userManager.ts` 在 localStorage 保存 `userId`
- **设备 deviceIdHash**：`src/utils/privacyFirstFingerprint.ts` 生成并上报 `/api/device/track`

升级为 SSO 后，建议这样融合：

### 1) 登录前：把 deviceIdHash 作为“风控上下文”
- 前端触发 `/api/auth/login` 时，附带 `deviceIdHash`（推荐用 query 或 header）：
  - `GET /api/auth/login?returnTo=...&deviceIdHash=...`
- BFF 把它存入本次登录请求上下文（与 `state` 绑定）。

### 2) 登录回调：绑定设备信号
- 回调成功创建 session 时，把 `deviceIdHash` 与账号 `sub` 绑定存储：
  - `account_device_binding (sub, deviceIdHash, firstSeenAt, lastSeenAt, riskFlags)`
- 如果出现“账号在全新设备 + 异常行为”，可以：
  - 增加验证码/二次确认
  - 或降低权限（只读/限流）

### 3) 匿名数据迁移（体验很关键）
用户登录后，把匿名用户的数据（对话、偏好、草稿等）合并到账号：
- 合并策略：
  - `sub` 维度的数据为主
  - 匿名 `userId` 作为“临时桶”，登录后迁移并清理
- 这一步你可以作为第二阶段做（先把登录跑通）。

## 🗃️ 数据模型（最小集合）

### 会话（Session）
- `sessionId`
- `sub`（IdP 用户唯一标识）
- `profile`（昵称/邮箱/头像）
- `roles/level`
- `tokens`（建议仅存服务端）
  - `access_token`
  - `refresh_token`（加密存储更好）
  - `expires_at`
- `deviceContext`
  - `deviceIdHash`
  - `riskScore`

### 账号与权限
第一版最简单：本地只维护角色映射
- `account_role (sub, role, updatedAt)`

## 🔧 环境变量建议（放到 .env.local / .env.production）

建议新增以下变量（示例名称，可按你习惯调整）：
- `OIDC_ISSUER`：例如 `https://idp.example.com/realms/xxx`
- `OIDC_CLIENT_ID`
- `OIDC_CLIENT_SECRET`（若使用 confidential client）
- `OIDC_REDIRECT_URI`：例如 `https://app.example.com/api/auth/callback`
- `OIDC_POST_LOGOUT_REDIRECT_URI`：例如 `https://app.example.com/`
- `SESSION_SECRET`：用于会话签名/加密（如果你实现加密存储）
- `SESSION_STORE=redis`（可选）

> 你项目里 `api/config/env.ts` 会加载根目录的 `.env.local` / `.env.production`，所以照这个约定加即可。

## 🧪 前端接入建议（React + TS）

### 最小改动做法
- 登录：按钮点击直接 `window.location.href = '/api/auth/login?returnTo=' + encodeURIComponent(location.pathname)`
- 启动时拉取登录态：
  - 在全局 store 初始化时请求 `/api/auth/me`
  - 用返回的 `roles/level` 驱动 `RequireAccess`

### 逐步替换“弱登录”
短期可以同时保留：
- 未登录用户：继续用 `userId` + `deviceIdHash`（匿名体验）
- 已登录用户：`sub` 为主身份

## 🛡️ 安全清单（上线前必查）

- **只用 Authorization Code Flow**（避免 Implicit Flow）
- **强制 PKCE（S256）**
- **校验 state + nonce**
- **严格校验 id_token**（签名/JWKS/iss/aud/exp/nonce）
- **Cookie：HttpOnly + Secure + SameSite=Lax**
- **写操作加 CSRF**
- **所有回调地址白名单**（IdP 配置 + 服务端校验 `returnTo`，防开放重定向）
- **会话存储支持水平扩展**（生产建议 Redis）

## 🔗 参考资料（权威/可落地）

- OAuth 2.0（RFC 6749）：`https://www.rfc-editor.org/rfc/rfc6749`
- PKCE（RFC 7636）：`https://www.rfc-editor.org/rfc/rfc7636`
- OAuth 2.0 for Native Apps（RFC 8252）：`https://www.rfc-editor.org/rfc/rfc8252`
- OAuth 2.0 Security Best Current Practice（RFC 9126）：`https://www.rfc-editor.org/rfc/rfc9126`
- OAuth 2.0 for Browser-Based Apps（RFC 9700）：`https://www.rfc-editor.org/rfc/rfc9700`
- OpenID Connect Core 1.0：`https://openid.net/specs/openid-connect-core-1_0.html`
- OWASP（会话/CSRF 相关备查）：`https://cheatsheetseries.owasp.org/`


