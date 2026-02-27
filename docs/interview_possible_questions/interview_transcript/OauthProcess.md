## OAuth/OIDC 登录流程（面试讲解稿）

## 安全要点速览（XSS / CSRF / 中间人）

### 术语表（这份流程里最容易讲混的点）

- **BFF Session（登录态）**
  - **cookie**：`bff_sid=<sid>`（HttpOnly）
  - **名词拆开**：
    - `bff_sid`：cookie **名字**
    - `<sid>`：cookie **值**（session id / 会话号）
  - **服务端存储**：Redis session（里面存用户信息 + access/refresh/id_token）
  - **作用**：表达“这个浏览器已经登录了”，前端用 `/api/auth/me` 判断登录态

- **CSRF Session（防跨站写请求）**
  - **cookie**：`bff_csrf_sid=<csrfSid>`（HttpOnly）
  - **名词拆开**：
    - `bff_csrf_sid`：cookie **名字**
    - `csrfSid`：cookie **值**（CSRF session id / 防跨站会话号）
  - **header**：`X-CSRF-Token: <csrfToken>`（前端同源页面才能拿到并带上）
  - **服务端存储**：Redis 里用 `csrfSid → csrfToken` 绑定
  - **作用**：防 CSRF（因为 cookie 会被浏览器自动携带，写请求必须再证明“是同源页面主动发起的”）

- **login state（登录中间态 / OIDC 临时上下文）**
  - **存储位置**：Redis（短 TTL，比如 10 分钟）
  - **key**：通常用 `state` 作为索引（你回调里会带 `state`）
  - **内容**：至少包含 `nonce / code_verifier / returnTo / deviceIdHash`，你项目里还会把 **`csrfSid` 也写进去做浏览器绑定**
  - **作用**：把“发起登录时生成的防伪参数”保存起来，等 callback 回来校验 + 换 token 用

- **state lock（一次性消费锁）**
  - **存储位置**：Redis（NX + TTL）
  - **作用**：防并发/重放——避免同一个 `state` 被重复处理（重复换 token / 重复建 session）
  - **关键顺序**：必须在 **csrfSid 校验之后** 再抢锁，避免攻击者拿到泄露链接后先抢锁造成 DoS

- **PKCE（S256）里的两个东西**
  - **code_verifier**：只存后端（在 login state 里），绝不出现在浏览器里
  - **code_challenge**：发给 IdP（`SHA256(code_verifier)`），IdP 用它来校验你换 token 时提交的 verifier
  - **一句话记忆**：`code_verifier` 是“私钥”（只在 BFF）；`code_challenge` 是“公示的指纹”（给 IdP）

- **JWT / id_token 校验（为什么第 14 步要验）**
  - **id_token 是什么**：IdP 发给 BFF 的“签名身份证”（JWT），里面有用户是谁、发给谁、什么时候过期、以及本次登录的 `nonce`。
  - **为什么要验签（JWKS）**：JWT 只是一个字符串，**能解码不代表可信**；BFF 必须用 IdP 公钥验签，确认“没被篡改 + 确实是 IdP 签的”。
  - **JWKS 是什么**：IdP 公开的“公钥集合”接口（HTTP）；BFF 不是等 IdP 主动“发公钥”，而是**按需去拉 JWKS 并缓存**（支持密钥轮换）。
  - **`kid` 从哪来**：`kid` 在 JWT 的 header 里（相当于“这张证用了哪把钥匙盖章”）；BFF 用这个 `kid` 去 JWKS 里找到对应公钥来验签。
  - **验哪些关键字段**：`iss`（签发者是谁）/ `aud`（签给谁）/ `exp`（过期没）/ `nonce`（是不是这次登录那一把）。

### 流程（15 句话版本）

> 下面这 15 句就是**完整流程**；后文不再重复“逐步拆解”，只保留参考与踩坑点。


1. 我们这套登录的核心目标是：**前端永远不拿 token**（不放 localStorage/JS 变量），浏览器只保留 `HttpOnly` cookie；真正的 token（`access/refresh/id_token`）都在 BFF 的 Redis session 里托管。  
2. 参与方就三个：**前端（浏览器）→ BFF（8080）→ IdP（9000）**，外加一个 Redis 当“保险柜”（放 session）和“临时柜”（放 login state）。  
3. 用户点“登录”后，前端其实不做鉴权逻辑，只做一次跳转：`GET /api/auth/login?returnTo=...&deviceIdHash=...`（把“登录成功回哪儿”和“设备信号”带过去）。  
4. BFF 收到登录请求，第一步不是去换 token，而是先准备两类“防伪材料”：**CSRF 票据**（防跨站写请求）和 **login state（登录中间态）**（防回调伪造/重放/被抢）。  
5. CSRF 票据这块可以通俗理解成“双因子”：浏览器自动带的 `HttpOnly bff_csrf_sid=<csrfSid>` + 前端同源脚本才能加的 `X-CSRF-Token=<csrfToken>`；后续所有写请求都要“cookie + header”同时对上才放行。  
6. login state 可以理解成“这次登录的临时档案袋”，BFF 会生成并存到 Redis（短 TTL）：`state / nonce / code_verifier / returnTo / deviceIdHash`，并把 `csrfSid` 也写进去（注意：这里的 `csrfSid` 就是 `bff_csrf_sid` 这个 cookie 的值），用来把这次登录和“发起登录的那个浏览器”绑定住。  
7. 这里的 `state` 就像“取件码”（回调带回来用来找档案袋）；`nonce` 像“防重放水印”（防别人拿旧的 `id_token` 再来糊弄你）。  
8. **最后的授权code 只是半张票**，真正能换 token 还得有 `code_verifier`；而 `code_verifier` 只存在 BFF 的 login state 里，浏览器永远看不到，对外只发 `code_challenge=SHA256(code_verifier)`（verifier 的摘要/指纹）给 IdP。  
9. 准备好这些材料后，BFF 才会 302 把浏览器带去 IdP 的 `/auth`（把 `state/nonce/code_challenge` 等参数一并带上）。  
10. 用户在 IdP 完成登录（必要时触发新设备 step-up/OTP）并确认授权后，IdP **不会把 token 发给浏览器**，只回跳 BFF：`/api/auth/callback?code=...&state=...`（浏览器手里拿到的只是授权码）。  
11. BFF 收到 callback 的第一件事是：用 query 里的 `state` 去 Redis 取回 login state，然后做“浏览器绑定校验”——请求带来的 `bff_csrf_sid` 必须和 login state 里记录的一致，不一致直接拒绝（防别人捡到链接来抢登）。  
12. 通过绑定校验后，BFF 会抢一个 `state lock（NX+TTL）`，**抢到后立刻 delete login state（一次性消费）**：这样同一个 `state` 不会被并发/重放处理两次（避免重复换 token、重复建 session）。  
13. 接着 BFF 才去 IdP 的 `/token` 换票：提交 `code + code_verifier`，拿回 `id_token（IdP 发给 BFF 的“签名身份证”（JWT），里面有用户是谁、发给谁、什么时候过期、以及本次登录的 `nonce`。） / access_token / refresh_token（续期）`（这一步完全在后端发生，浏览器看不到 token）。  
14. 换到 token 之后 BFF 不会“只解码看一眼”，而是会做标准校验：先从 **JWKS** 拿到 IdP 的公钥来**验签**（确认 JWT 没被篡改、确实是 IdP 签的），再检查 `iss/aud/exp/nonce`（分别是签发者/受众/过期时间/一次性随机数），确认 token 真实、未过期、且确实属于这次登录上下文（nonce 必须和 login state 里那份对上）。 
  - **JWKS 是什么**：IdP 公开的“公钥集合”接口（HTTP）；BFF 不是等 IdP 主动“发公钥”，而是**按需去拉 JWKS 并缓存**（支持密钥轮换）。
  - **验哪些关键字段**：`iss`（签发者是谁）/ `aud`（签给谁）/ `exp`（过期没）/ `nonce`（是不是这次登录那一把）。 
15. 最后 BFF 在 Redis 创建登录 session（把用户信息 + token 放进去），并给浏览器下发 `HttpOnly bff_sid=<sid>` 当“门禁卡”（以后浏览器每次请求会自动带上它，BFF 用它去 Redis 找 session），再 302 回到 `returnTo`；之后前端用 `/api/auth/me` 看登录态，所有写请求统一走 `X-CSRF-Token` 校验。

#### 常见追问：既然 HttpOnly 防 XSS 读 token，为什么不直接把 JWT 存在 HttpOnly cookie？

- **一句话**：JWT 放进 HttpOnly cookie 只能解决“JS 读不到”，但解决不了 **CSRF**，也让 **撤销/登出/风控/续期/轮换** 变得更难；所以更常见的工程做法是 **cookie 只放 session id（`bff_sid`），token 放服务端**。
- **下线/踢下线怎么办**：在 BFF session 方案下，“让用户立刻下线”很简单——**删除 Redis 里的 session** + **清掉浏览器的 `bff_sid` cookie** 即可；如果还要把 IdP 侧也登出/撤销续期能力，可以额外做 IdP logout 或 refresh token revoke（但前端仍不需要直接持有 token）。
- **CSRF 仍然存在**：cookie 会被浏览器自动携带；即使 JWT 在 HttpOnly cookie 里，跨站也可能“带着 JWT”打你的写接口，所以你还是要做 SameSite/Origin/CSRF token（复杂度并不会因为 JWT 放 cookie 就消失）。
- **撤销/登出更难**：JWT 一旦签发，天然是“可离线验证”的 bearer token；如果把它直接当凭证放 cookie，想做到“立刻踢下线/设备丢失立即失效/风控冻结”就很不优雅（除非再引入黑名单/版本号/短 TTL + 频繁刷新，复杂度又回来了）。
- **refresh token 更敏感**：你往往还要处理续期（refresh token / rotation）；把 refresh token 也放到浏览器侧（哪怕 HttpOnly）等于扩大攻击面与滥用面。
- **最小暴露面**：BFF 托管 token 后，前端只有 `bff_sid` 这张“门禁卡”；token 泄露的渠道更少，也更容易做统一治理（缓存、续期、吊销、审计）。


#### 常见追问：oidc-provider（IdP）的大致原理（跟你第 13/14 步最相关
它把 OIDC 的“协议复杂度”封装掉：授权码、token 端点、JWKS、公钥轮换、id_token 签发这些都按标准实现。
你们做的是“业务交互层”：比如登录页、OTP/step-up、同意页；oidc-provider 负责最后把授权码/Token 按协议发出来。
JWKS/验签怎么来的：IdP 会暴露 JWKS 公钥集合 HTTP 接口；BFF 在验 id_token 时按需拉取并缓存，用 token header 里的 kid 选对公钥验签。

### 这套方案里，哪些主要是在防 **XSS**？

- **token 不落前端（核心）**：access_token / refresh_token / id_token 都只放在 BFF 的 Redis session 里，浏览器只有 `HttpOnly` 的 session cookie（例如 `bff_sid`）。  
  - 作用：即使页面发生 XSS，攻击脚本也**读不到 cookie**、更拿不到 token，显著降低“被偷 token 长期冒用”的风险。
- **用 Cookie 表达登录态，但 JS 读不到凭证**：关键 cookie 设置为 `HttpOnly`，避免“前端存 localStorage / 可被 JS 读取”的传统坑。

> 说明：XSS 依然可能做“代用户操作”（比如发起请求、读页面上已渲染的数据）。所以 **“token 不落前端”是降低破坏面**，不是让 XSS 变成无害。工程上通常还会配合 CSP、依赖安全、输入输出编码等手段进一步降风险（本文先聚焦你项目已落地的部分）。

### 这套方案里，哪些主要是在防 **CSRF**？

- **SameSite=Lax**：减少跨站请求自动携带 cookie 的机会，同时兼容 OAuth 回调这种“顶级导航跳转（GET）”场景。
- **Origin/Referer 校验**：不在白名单就拒绝，阻断大多数跨站伪造写请求。
- **session-bound CSRF（双证明）**：  
  - cookie 里有 `HttpOnly` 的 `bff_csrf_sid`（浏览器自动带，但 JS 读不到）  
  - 写请求必须额外带 `X-CSRF-Token`（前端同源页面才能拿到并加上）  
  - 后端用 `csrfSid → Redis token` 做比对，不匹配就 403
- **callback race 的绑定**：把 OAuth 登录中间态（state 等）绑定到浏览器侧的 `csrfSid`，就算 code/state 链接泄露，也没对应 cookie 进不来（本质也是在防“跨站/跨上下文伪造回调”）。

### 有没有防 **中间人攻击（MITM）**？

- **有一定的缓解，但前提是必须走 HTTPS/TLS**：  
  - **PKCE（S256）**：就算授权码（code）被截获，没有 `code_verifier` 也换不到 token，能缓解“截获 code → 换 token”这类攻击。  
  - **id_token 验签 + iss/aud/exp/nonce 校验**：能防“伪造/篡改的 token”被接受，以及防重放（nonce）。
- **但如果没有 HTTPS/TLS，MITM 仍然可以做到很多事**（看/改流量、注入脚本等），这不是靠 OAuth 参数就能彻底解决的。生产环境要确保全链路 HTTPS，必要时再叠加 HSTS 等。

主要参考的是几条成熟、安全行业常用的“组合拳”，以及对应的开源实现思路：

## 方案参考与项目落地

> 流程本身请看上面的 **“流程（15 句话版本）”**；这一节只保留“我参考了哪些标准/为什么这么选”。

### 1) OAuth2/OIDC（OpenID Connect）标准流程

- 参考点：OIDC 授权码模式（Authorization Code Flow）+ state/nonce 的使用方式  
- 你项目里体现：state 防伪造回调、nonce 防 id_token 重放、回调校验 iss/aud/exp 等

#### 为什么不用其他模式？
- 不使用隐式授权模式（Implicit）
- 原因：token（access_token）会直接出现在前端/URL 片段里，暴露面更大；并且该模式在 OAuth 2.1 趋势下已不推荐。
- 对比：我们要的是“前端不持有 token，全部由 BFF 托管”，隐式模式天然不匹配。
- 不使用密码凭证模式（ROPC / Password Grant）
- 原因：前端要直接收集用户密码并交给“客户端/应用”，安全与合规风险高；也绕过 IdP 的风控/二次验证等能力，扩展性差；同样属于不推荐的遗留模式。
- 对比：我们需要标准化登录、可插拔风控（deviceIdHash）、可 step-up（OTP），授权码模式更适合。
- 不使用客户端凭证模式（Client Credentials）
- 原因：它是给“机器对机器（M2M）”用的，没有用户参与、没有用户登录态，不解决“用户登录”问题。
- 对比：我们这里是用户登录 + 会话管理，不适用。

  
如果面试官追问“你具体借鉴了谁”，你可以说：  
“协议层严格按 OAuth2/OIDC/PKCE 标准；实现层 IdP 用 oidc-provider，JWT 校验用 jose；架构层借鉴 BFF 代管 token、cookie session 的实践；安全加固借鉴 SameSite/CSRF/Origin 校验，以及把登录上下文绑定到浏览器 cookie 来防回调被复用抢登。”
你可以把它理解成：前端只负责“跳转去登录”，真正的身份凭证都放在后端（BFF）。前端最后只拿到一个“门禁卡”（Cookie），以后每次请求自动带上这张卡。

## 踩坑点

### “token 不落前端”但仍要处理 CSRF
- HttpOnly cookie 能防“JS 读 token”，但浏览器会自动带 cookie，所以写接口仍要防 CSRF。
- 你们用 SameSite=Lax + session-bound CSRF + Origin/Referer，这是正确的组合拳。
### 回调 URL 泄露导致“抢登（race）”
- 这点非常容易被忽略：攻击者拿到 code&state 直接打 /api/auth/callback，BFF 会替他换 token。
- 你们已经做了修复：login state 绑定 HttpOnly csrfSid，callback 必须同 cookie 才放行。
### PKCE 常见误区
- 误区：以为 PKCE 可以解决所有登录安全问题。实际上它主要防“偷 code 换 token”，不直接解决“偷 callback URL 打 BFF”这种场景（需要绑定 cookie/response_mode=form_post 等补强）。
- 误区：把 code_verifier 放到前端/URL，这是大忌（你们没这么做）。

### 3) 回调的“一次性消费”与并发/重放防护（补强点）

除了 `state/nonce` 的标准校验外，我们对 callback 做了 **一次性消费锁**：

- **为什么需要这个锁？（面试官常追问）**
  - **现实场景会出现并发回调**：用户双击、浏览器/代理重试、网络抖动导致回调请求重复发送，都可能让同一个 `state` 在短时间内被并行处理。
  - **只靠“delete state”不够**：如果两个请求几乎同时 `loadLoginState(state)` 成功，在其中一个删掉 state 之前，另一个也可能继续往下走，造成：
    - 同一登录中间态被处理两次（重复换 token / 重复建会话）
    - 产生不可预期的边界行为（例如用户拿到两个 session，或其中一次失败但仍消耗了上游 code）
  - **锁必须放在 csrfSid 校验之后**：如果先抢锁、再校验 csrfSid，攻击者拿到泄露的 `code/state` 链接就可能“抢占锁”把合法用户卡死（DoS）。所以我们先做浏览器绑定校验，再抢占 lock。

- **先校验 cookie 绑定（csrfSid）**：防止 callback URL 泄露后被外部复用抢登
- **再抢占 state lock（NX + TTL）**：防止并发/重复 callback 导致同一 `state` 被处理多次
- **抢到锁后立刻 delete login state**：保证 `state/nonce/code_verifier` 用完即删，减少重放窗口

对应实现：
- `api/lambda/auth/callback.ts`（csrfSid 校验: L45-L52；抢锁: L54-L59；删除 state: L61-L63）
- `api/lambda/_utils/bffOidcAuth.ts`（acquireLoginStateLock: L205-L217）


### 我们为什么还要带 X-CSRF-Token？
一句话：因为 Cookie（哪怕 HttpOnly）会被浏览器自动带上，单靠 Cookie 身份就可能被跨站伪造；`X-CSRF-Token` 的作用是让写请求必须**额外证明：这是同源页面脚本主动发起的**，而不是别的网站诱导出来的请求。它是在前端发“写请求”（POST/PUT/DELETE 等）之前自动加上的，不是你手动到每个请求里写。
具体机制是我们新加的统一封装 fetchWithCsrf：
- 文件：src/utils/fetchWithCsrf.ts
- 逻辑：
  - 它会先判断请求方法是不是写操作（不是 GET/HEAD/OPTIONS 就算写）
  - 如果是写操作：
    - 先 GET /api/auth/csrf 拿到 csrfToken（只缓存到内存）
    - 然后在请求头上 headers.set('X-CSRF-Token', csrfToken)
  - 最后再真正发请求（并带上 credentials: 'include' 让 cookie 一起走）
    它是靠 HTTP method 来判断的：只要不是“只读方法”，就当成写操作。
    在 src/utils/fetchWithCsrf.ts 里逻辑是：
    - 先取 method（如果你没传，默认当 GET）
    - 转成大写
    - 判断：
    - GET / HEAD / OPTIONS → 不是写操作
    - 其他（比如 POST / PUT / PATCH / DELETE）→ 写操作，会自动加 X-CSRF-Token
    所以你只要在调用 fetchWithCsrf 时写了 method: 'POST' 这类，它就会走“写请求路径”。
然后我们把项目里所有关键写请求都改成用 fetchWithCsrf(...)，例如：
- /api/chat：src/hooks/data/useSSEStream/index.ts
- /api/user：src/utils/userManager.ts
- /api/device/track：src/utils/privacyFirstFingerprint.ts
- 对话/归档/上传相关：src/utils/conversationAPI.ts、src/utils/localStorageLRU.ts、src/utils/chunkUploader.ts、src/hooks/data/useSSEStream/upload.ts
- /api/auth/logout：src/stores/authStore.ts
  每次前端发写请求时，由 fetchWithCsrf 统一加上 X-CSRF-Token。

#### 展开：为什么还要带 X-CSRF-Token？它起什么作用？
1) 只靠 Cookie 会发生什么（CSRF 的根本原因）
攻击者在自己的网站放一个表单/请求，诱导用户点击。  
用户浏览器发请求到你的 BFF 时，会自动带上你域名下的 cookie（例如 bff_sid）。
如果你的写接口只检查 cookie 是否存在，那攻击者就能让用户“在不知情的情况下”完成写操作（发消息、改资料、删除对话等）。

2) X-CSRF-Token 在你们项目里做了哪件关键事？
你们是 session-bound CSRF：
- 浏览器有一个 HttpOnly 的 bff_csrf_sid（JS 读不到）
- 前端从 /api/auth/csrf 拿到一个 csrfToken（只放内存）
- 写请求必须带：
  - Cookie：bff_csrf_sid=...（浏览器自动带）
  - Header：X-CSRF-Token: <csrfToken>（前端主动加）
后端校验逻辑是：
- 用 cookie 里的 csrfSid 去 Redis 找到期望的 token
- 比较 X-CSRF-Token 是否等于 Redis 里的 token
- 不匹配就 403
效果：攻击者的网站即使能让浏览器自动带 cookie，也拿不到正确的 token 塞进 header（因为浏览器的跨站限制 + 同源策略）。我们在 Modern.js BFF 里默认同源提供页面和 API，所以前端请求 BFF 不需要额外处理 CORS，天生不会有跨域问题，所以请求会被拒绝。

3) 你可能会问：攻击者也能加 header 吧？
跨站页面要想带你自定义的 X-CSRF-Token，通常必须走 CORS 预检，而你们又做了：
- Origin/Referer 校验（不在白名单直接拒绝）
- SameSite=Lax（进一步减少跨站携带 cookie 的机会）
所以攻击者即便想“自己写 fetch 加 header”，也会在跨站阶段被挡住。

4) 跟 SameSite 的关系（为什么不只靠 SameSite）
- SameSite=Lax 能挡掉很多跨站 POST，但并不是万能（有些场景仍可能绕、或业务必须允许某些跨域情况）。
- 所以最佳实践是组合：SameSite + CSRF Token + Origin/Referer。  
其中 X-CSRF-Token 就是 CSRF Token 这层的载体。
SameSite=Lax 的规则：
- 大多数跨站请求不会带 Cookie（比如第三方网站里发起的 fetch/XHR、表单 POST、加载图片/脚本等），从而降低 CSRF 风险。
- 但“顶级导航跳转（Top-level navigation）的 GET”会带 Cookie：例如用户从别的网站点击链接跳到你的网站（地址栏跳转），浏览器会带
上 Cookie。
为什么我们用 Lax？
- 更安全：挡住了大量跨站“偷偷带 cookie”的请求（CSRF 常见入口）。
- 兼容登录流程：OAuth/OIDC 登录通常需要浏览器跳转回来（顶级 GET 导航），Lax 允许这类跳转携带 cookie，不容易把登录搞坏。
补充对比：
- SameSite=Strict：几乎所有跨站导航都不带 Cookie，最安全但更容易影响第三方跳转/登录回调体验。
- SameSite=None：跨站也会带 Cookie（必须配 Secure），风险更高，通常只有在必须第三方场景时才用。

你可以在面试里这么说
“Cookie 会自动携带，所以必须再加一个只有同源页面才能带上的 proof。我们用 session-bound CSRF：cookie 里放 csrfSid，token 存 Redis，写请求必须带 X-CSRF-Token 才放行，再叠加 Origin/Referer 校验和 SameSite 形成多层防护。”
你可以用一句话复述
“前端点登录只跳转到 BFF，BFF 生成防伪参数把我带去 IdP 登录；IdP 登录后只给 BFF 一个授权码，BFF 在后端换 token 并校验，再用 HttpOnly cookie 建立会话；之后前端用 /api/auth/me 判断登录态，后端对多 Agent 强校验 session。”

### 2) PKCE（RFC 7636）的加固思路

- 参考点：code_verifier（秘密）+ code_challenge=S256（摘要）绑定 “code → token exchange”  
- 你项目里体现：BFF 生成 verifier、对外只发 challenge，换 token 时再提交 verifier

### 3) BFF（Backend for Frontend）代管 token

- 参考点：不要让浏览器持有 access/refresh token，用 HttpOnly session cookie 表达登录态  
- 行业常见落地：Next.js/Remix 等框架的“服务端 session + 前端只管 UI 状态”这一类架构思想  
- 你项目里体现：token 只存在 BFF Redis session，前端只打 /api/auth/me 看状态

### 4) oidc-provider（成熟的 OIDC IdP 骨架）

- 参考点：不手写 OIDC 协议，直接用经过大量项目验证的 IdP 实现骨架，再做 demo 交互页/存储适配/风控  
- 你项目里体现：IdP 使用 oidc-provider + Redis Adapter，Grant/Session/Code/Token 等协议态由它管理
- 主要在文件 idp/server.ts
### 5) jose（JWT/JWS 校验的标准做法）

- 参考点：用 JWKS 拉公钥校验 id_token 签名、校验 iss/aud/exp/nonce  
- 你项目里体现：BFF 用 jose 做 jwtVerify，而不是“只解码不验签”

### 6) CSRF 防护的成熟组合

- 参考点：SameSite + Origin/Referer 校验 + CSRF token（你用的是 session-bound 变体）  
- 你项目里体现：bff_csrf_sid（HttpOnly）+ Redis token + 写请求 X-CSRF-Token
跨站页面要想带你自定义的 X-CSRF-Token，通常必须走 CORS 预检，而你们又做了：
- Origin/Referer 校验（不在白名单直接拒绝）
- SameSite=Lax（进一步减少跨站携带 cookie 的机会）
所以攻击者即便想“自己写 fetch 加 header”，也会在跨站阶段被挡住。
### 7) “抢登（callback race）”的业界补强思路

- 参考点：把 OAuth 登录上下文绑定到发起登录的浏览器（常见做法是额外的 login cookie / 双重 cookie 绑定）  
- 你项目里体现：把 login state 绑定到 HttpOnly csrfSid，callback 必须同 cookie 才放行

### 8) 风控/新设备 step-up（业界账号保护常见模型）

- 参考点：device binding + risk-based auth（risk=medium 触发 OTP/MFA）  
- 你项目里体现：deviceIdHash 作为风险信号，新设备强制二次验证，通过后写账号-设备绑定

---

### 流程图（文字版，可扫读）

```text
[Browser / React UI]
  |
  | (1) 点击登录（只做跳转，不保存 token）
  |     GET /api/auth/login?returnTo=...&deviceIdHash=...
  |     Files:
  |       - src/stores/authStore.ts (beginLogin: L51-L58)
  |       - src/components/business/Chat/ChatInterfaceRefactored.tsx (触发 beginLogin: L172-L181)
  v
[BFF @ :8080]
  |
  | (2) 生成“防伪三件套”并写 Redis（TTL 10min）
  |     - state  : 防 CSRF
  |     - nonce  : 防 id_token 重放
  |     - PKCE   : code_verifier(后端保存) + code_challenge(发给IdP)
  |     Files:
  |       - api/lambda/auth/login.ts (L19-L40)
  |       - api/lambda/_utils/bffOidcAuth.ts
  |         - createLoginState: L153-L174
  |         - saveLoginState: L187-L189
  |
  | (3) 302 跳转 IdP /auth（携带 state/nonce/code_challenge/deviceIdHash）
  |     GET http://localhost:9000/auth?...&state=...&nonce=...&code_challenge=...&deviceIdHash=...
  |     Files:
  |       - api/lambda/_utils/bffOidcAuth.ts (buildAuthorizationUrl: L299-L316)
  v
[IdP @ :9000]
  |
  | (4) 登录交互页：输入用户名；用 deviceIdHash 判断新设备
  |     POST /interaction/:uid/login
  |     Files:
  |       - idp/server.ts
  |         - login form action: L263-L274
  |         - login handler: L301-L379
  |
  | (5) 新设备 step-up（二次验证 OTP，TTL 5min）
  |     POST /interaction/:uid/mfa
  |     Files:
  |       - idp/server.ts (mfa handler: L382-L445)
  |
  | (6) 同意授权（consent）
  |     POST /interaction/:uid/confirm
  |     Files:
  |       - idp/server.ts (confirm handler: L448-L487)
  v
[BFF @ :8080]
  |
  | (7) 回调：校验“浏览器绑定” + 抢占 state lock + 单次删除（防并发/重放）
  |     GET /api/auth/callback?code=...&state=...
  |     Files:
  |       - api/lambda/auth/callback.ts
  |         - csrfSid 校验：L45-L52
  |         - state lock：L54-L59
  |         - delete state：L61-L63
  |       - api/lambda/_utils/bffOidcAuth.ts (acquireLoginStateLock: L205-L217)
  |
  | (8) 换 token：code + code_verifier（PKCE 私钥）
  |     Files:
  |       - api/lambda/auth/callback.ts (调用 exchangeCodeForTokens: L65-L69)
  |       - api/lambda/_utils/bffOidcAuth.ts (exchangeCodeForTokens: L318-L355)
  |
  | (9) 校验 id_token：
  |     - JWKS + iss/aud/exp（签名与声明校验）
  |     - nonce 校验（防重放）
  |     Files:
  |       - api/lambda/auth/callback.ts (verifyIdTokenNonce: L70-L72)
  |       - api/lambda/_utils/bffOidcAuth.ts (verifyIdTokenNonce: L357-L367)
  |       - api/lambda/_utils/bffOidcAuth.ts (createBffSession 内 jwtVerify: L231-L236)
  |
  | (10) 建立 BFF Session（Redis）并下发 HttpOnly Cookie
  |     Files:
  |       - api/lambda/auth/callback.ts (Set-Cookie + 302: L84-L90)
  |       - api/lambda/_utils/bffOidcAuth.ts (buildSetBffSessionCookie: L78-L89)
  v
[Browser / React UI]
  |
  | (11) 刷新登录态（前端用 /api/auth/me 得到 loggedIn/canUseMultiAgent）
  |     GET /api/auth/me
  |     Files:
  |       - src/stores/authStore.ts (refreshMe: L32-L48)
  |       - api/lambda/auth/me.ts (getBffSessionFromHeaders: L16-L44)
  |(11.5) 懒加载 CSRF Token（只在第一次“写请求”前发生一次）
  | 触发时机：第一次 POST/PUT/DELETE/PATCH    
  | 调用 fetchWithCsrf
  | - 先请求：GET /api/auth/csrf（拿到 csrfToken，并下发 HttpOnly bff_csrf_sid）
  | - 再自动加头：X-CSRF-Token: <csrfToken>
  | Files（前端）：| - src/utils/fetchWithCsrf.ts
  | - 写方法判断：L47-L55（isWrite + headers.set('X-CSRF-Token', ...)）
  | - 懒请求 token：L16-L44（GET /api/auth/csrf + 内存缓存）
  | Files（后端 token 下发）：| - api/lambda/auth/csrf.ts（GET handler: L19-L37）
  | Files（后端校验写接口）：| - api/lambda/_utils/csrf.ts（requireCsrf: L157-L175）
  |v[BFF @ :8080]|
  | (11.6) 所有写接口统一校验 CSRF（Origin/Referer + sid + X-CSRF-Token）
  | Files:| - api/lambda/_utils/csrf.ts| - Origin/Referer：L115-L141
  | - 读 cookie sid + 校验 header：L164-L173|
  v
  | (12) 后端安全边界：multi_agent 必须已登录，否则 403
  |     POST /api/chat { mode: 'multi_agent' }
  |     Files:
  |       - api/lambda/chat.ts (multi_agent gate: L331-L356)
  |
  | (13) 完整登出：清 BFF + 清 IdP（RP-Initiated Logout）
  |     POST /api/auth/logout  -> 返回 idpLogoutUrl
  |     GET  <IdP end_session_endpoint>  -> IdP 清 session
  |     GET /api/auth/logout/callback?returnTo=/  -> 回站内
  |     Files:
  |       - src/stores/authStore.ts (logout 跳转: L60-L75)
  |       - api/lambda/auth/logout.ts (L22-L59)
  |       - api/lambda/_utils/bffOidcAuth.ts (buildEndSessionUrl: L284-L297)
  |       - idp/server.ts (rpInitiatedLogout + post_logout_redirect_uris: L156-L221)
  |       - api/lambda/auth/logout/callback.ts (L1-L29)
```
