## 实习经历（面试扫读版）

> 面试官最常沿着这条线追问：**你做了什么 → 为什么这么做 → 怎么验证有效 → 遇到坑怎么解决**。  
> 下面按你写的 3 块经历，整理成“可快速扫到重点”的版本。

---

## 1) 封装 axios + JWT 鉴权（最爱追）

### 一句话讲法

我把请求层和业务层分开：**请求层**统一鉴权、错误处理、重试/取消；**业务层**只关心数据；并且做了 **401 自动刷新 + 队列重放**，避免并发下重复刷新。

### 高频追问清单（按问答背）

1. **你怎么封装 axios 的？封装了哪些能力？**
   - 拦截器（request/response）、统一 baseURL、timeout、headers、错误码处理、重试/取消、接口模块化等
2. **JWT 放在哪里？为什么？**
   - localStorage vs Cookie（HttpOnly）对比；XSS/CSRF 风险差异
3. **token 过期怎么处理？刷新机制怎么做？**
   - refresh token、无感刷新、并发请求“只刷新一次”的队列/锁
4. **401 / 403 / 500 你怎么区分处理？**
   - 401：未登录/过期 → 刷新或跳登录
   - 403：无权限 → 提示/跳 403 页
   - 5xx：服务端异常 → toast + 兜底
5. **怎么避免多个接口同时 401 导致重复刷新？**
   - refresh 进行中标记 + pending queue；刷新成功后重放请求
6. **鉴权前端做还是后端做？前端鉴权有什么意义？**
   - 后端最终裁决；前端做路由守卫/菜单权限/按钮权限提升体验、减少无效请求
7. **如何处理跨域、携带凭证？**
   - CORS、withCredentials、cookie token 等
8. **怎么做请求取消、防止重复提交？**
   - AbortController（axios v1 支持）/ cancel token；按钮 loading 锁
9. **你遇到过什么坑？怎么解决？**
   - token 刷新死循环、刷新接口也被拦截、时间差导致刚刷新又过期、刷新失败后清理状态等

### 加分句（直接背）

- “我把请求层和业务层分开：请求层负责鉴权、错误处理、重试；业务层只关心数据。”
- “我做了 401 自动刷新 + 队列重放，避免并发下重复刷新导致雪崩。”
- “安全上我知道 localStorage 有 XSS 风险；更理想是 HttpOnly cookie，但实习项目受后端方案限制，所以我至少做了风险意识和输入/输出处理。”

---

## 2) 前端 SEO：robots.txt / metadata / 语义化标签

### 一句话讲法

我做的不只是写 meta，而是“**可抓取 + 可理解 + 可验证**”：完善 robots 和 metadata，结构语义化，同时用 GSC 抓取渲染去验证爬虫看到的是完整内容。

### 高频追问清单

1. **robots.txt 写了什么？为什么这么写？**
   - allow/disallow、Sitemap 指向、屏蔽私密路径（/admin、/api、/login）、避免抓取重复页面（参数页）
2. **metadata 具体做了哪些？**
   - title/description/keywords（基础）
   - canonical（避免重复内容）
   - Open Graph / Twitter Card（社交分享）
   - meta robots（noindex/nofollow）在特定页面用
   - viewport、charset、hreflang（多语言才用）
3. **语义化标签怎么影响 SEO？**
   - 结构更清晰：header/nav/main/section/article/footer
   - 标题层级：h1-h2-h3
   - 图片 alt、表单 label、面包屑 nav
   - 也提升可访问性（a11y），间接提高体验指标
4. **你们是 CSR 还是 SSR/SSG？SEO 怎么做？**
   - CSR 页面对 SEO 不友好；如果没有 SSR，就用预渲染/动态渲染，至少保证核心内容可被爬虫拿到
5. **你怎么验证爬虫能看到内容？**
   - GSC 的 URL inspection（抓取与渲染），看渲染截图与 HTML；站点地图提交情况
6. **SEO 还有哪些关键因素？**
   - Core Web Vitals（LCP/INP/CLS）、移动端适配、内部链接结构、内容质量、结构化数据（Schema.org）

### 加分句

- “我做的不只是写 meta，而是用 GSC 的 Inspect URL/抓取渲染确认爬虫拿到的是完整内容。”
- “语义化 + metadata 同时也改善无障碍和分享卡片，属于一举多得。”

---

## 3) 用 GSC 验证：10 天 CTR 提升 10%（亮点，但会追‘因果’）

### 一句话讲法

我不是只报一个‘提升 10%’，而是用 GSC 把数据拆到同一批页面/同一批 query 上对比，尽量排除流量结构变化带来的假象。

### 高频追问清单

1. **CTR 提升怎么计算的？哪个维度？**
   - GSC Performance：对比前后区间；按 Query / Page / Device / Country 拆
2. **10 天提升 10% 是否统计显著？排除偶然波动了吗？**
   - 对比同一批 query/page；排除节假日/活动；看 impressions 是否变化；也看平均排名是否变化
3. **哪些改动最可能影响 CTR？**
   - title/description 更贴合搜索意图、结构更清晰、富结果（结构化数据）、避免重复标题
   - robots/语义化更偏“可抓取/可理解”，对 CTR 影响没那么直接；title/description 更直接
4. **你如何用 GSC 定位问题与验证改动？**
   - 覆盖率：索引/排除原因
   - 站点地图：提交与抓取
   - URL inspection：抓取时间、渲染、是否可索引
   - 性能：CTR、展示、排名、查询词
5. **有没有做过结构化数据（JSON-LD）？**
   - 如果没做：可以说“当时没覆盖到，但我知道它能带来富结果，提高 CTR”

### 加分句（非常关键）

- “我把 CTR 提升拆开看：同一批页面 + 同一批 query 的 CTR 提升更能说明是我们改动带来的，而不是流量结构变化。”

---

## 4) 面试官可能让你现场讲/画的题

- 画一个 axios 请求流程图：发请求 → 加 token → 响应 → 401 → refresh → 重放 → 失败 → 登出
- 讲清楚 localStorage token vs cookie token 的安全差异（XSS/CSRF）
- 说 robots.txt 和 meta robots 的区别
- 解释为什么语义化有利于 SEO（以及对 a11y 的帮助）
- 解释 GSC 指标：impressions/clicks/CTR/average position 各代表什么

---

## 5) 30 秒版本（直接背）

“实习中我负责了一部分前端工程化和 SEO。工程化上我封装了 axios：统一错误处理、请求/响应拦截器，并基于 JWT 做鉴权，处理了 token 过期与 401 的刷新逻辑，避免并发请求重复刷新。SEO 上我完善了 robots.txt、页面 metadata 和语义化结构，并用 Google Search Console 做抓取渲染验证与数据对比，10 天左右同一批页面的 CTR 约提升 10%。”

---

## 6) 语义化改造（面试可落地说法：你做了哪些 + 怎么验证）

> 面试官想听的不是“把 div 换成 main”，而是：你怎么规划结构、标题层级、可访问性、以及怎么验证改动没破坏样式/交互。

### 结构骨架（替代 div 套娃）

- `<header>`（logo、站点标题、搜索框等）
- `<nav>`（主导航/面包屑）
- `<main>`（每页唯一主内容区）
- `<section>`（有主题的区域，建议带标题）
- `<article>`（可独立分发/复用内容：文章、帖子、商品）
- `<aside>`（侧边栏、相关推荐）
- `<footer>`（版权、友链、备案）

你可以这么讲：  
“我按页面信息架构把 div 拆成 header/nav/main/section/article/footer，让搜索引擎和读屏器能更明确理解哪些是导航、哪些是正文。”

### 标题层级（H1/H2/H3 不乱用）

- 每页通常一个 H1（核心主题）
- H2 划分大模块（产品信息/评论/FAQ）
- H3 再细分子模块
- 不为字体大小跳级（样式交给 CSS）

### 列表、导航、面包屑

- 导航菜单：`<nav><ul><li><a>...`
- 列表数据：`<ul>/<ol>`（搜索结果、文章列表、商品列表）
- 面包屑：`<nav aria-label="breadcrumb">` + `ol/li`

### 图片与媒体

- 信息性图片必须写 `alt`
- 图文组合用 `figure/figcaption`
- 装饰图用空 alt：`alt=""`

### 表单与交互

- `label for=id` 绑定输入框
- button 不用 div 冒充（可键盘、可读屏）
- input 类型使用 `email/number/search` 等

### 怎么验证不是嘴炮

- Chrome Lighthouse：Accessibility + SEO 分数是否提升
- GSC URL Inspection：抓取渲染后的 DOM 结构是否更清晰
- 无障碍快速验证：Tab 顺序、焦点可达、按钮可触发
