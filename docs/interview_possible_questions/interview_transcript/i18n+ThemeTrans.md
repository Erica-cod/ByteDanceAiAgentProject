## i18n + Theme（面试话术整理版）

> 目标：**60–90 秒能讲清主线**，追问时也能按点展开；最后附“10 秒文件速记”和“决策口诀”。

---

## i18n（国际化）

### 60–90 秒话术版

我们项目的国际化用的是 `i18next` + `react-i18next`。入口 `src/index.tsx` 会同步 `import './i18n/config'`，确保 React 渲染前 i18n 已初始化，避免首屏出现 key 闪一下。  
配置在 `src/i18n/config.ts`：把 `zh.json/en.json` 作为 resources 注册，语言选择逻辑是：优先读 `localStorage` 的 `language`，没有就读 `navigator.language`，`zh*` 走中文，否则英文；`fallbackLng` 设成 `zh`，保证缺失文案也能兜底。  
业务组件里用 `useTranslation()` 取 `t()` 来渲染文案，比如设置面板 `SettingsPanel.tsx`；切换语言时调用 `i18n.changeLanguage('zh'|'en')`，同时把选择写回 `localStorage`，这样刷新/下次打开仍保持用户选择。我们现在是轻量实现：没有引入 `i18next-browser-languagedetector`，而是自己写了一个最小可控的检测函数；后续如果要扩展多语言、按模块分包，可以把 resources 做成懒加载并拆分命名空间。

### 面试追问点（每点 60–90 秒）

#### 1) 为什么要在 `index.tsx` 同步导入 i18n？
因为 i18n 初始化会决定 `lng` 和 `resources`，如果晚于首屏渲染，React 组件第一次渲染可能拿不到翻译，出现 `settings.title` 这种 key 的闪烁。同步 `import` 能保证 i18next ready 后再渲染，体验更稳定。

#### 2) 为什么不用 `i18next-browser-languagedetector`？
我们只需要最核心的两步：读 `localStorage` + 读浏览器语言，逻辑非常简单，引入 detector 会增加依赖体积和隐式行为。这是“够用优先”的取舍：先做最小闭环，后续要支持更复杂的策略（比如 query 参数、cookie、SSG/SSR）再上 detector 更合适。

#### 3) `escapeValue: false` 为啥这么配？安全吗？
因为 React 默认会对插值做 XSS 防护（它会转义插入到 DOM 的文本），i18next 再 escape 会导致重复转义、显示异常。我们这里的翻译文本是本地 json，不是用户输入，所以风险可控；如果未来要在翻译里插入富文本/HTML，会改成显式白名单渲染或统一走 `Trans` 组件并严格控制内容来源。

#### 4) SSR/预渲染下 `localStorage`/`navigator` 会报错，怎么处理？
在 SSR 或预渲染环境里没有 `window/localStorage/navigator`，直接读会报错。我们目前是纯前端 SPA，所以没触发这个问题；但如果未来要上 SSR/SSG，做法是把语言检测包装成 `typeof window === 'undefined'` 的分支：服务端用默认语言或从请求头 `Accept-Language` 推断，客户端 hydrate 后再对齐一次。这样既不报错，也能避免首屏语言跳变。

#### 5) 多语言规模变大后，JSON 全量打包会变大，怎么优化？
现在只有中英两份字典，直接打进包里最简单。扩展到多语言/多模块后，建议做两件事：
- 按模块拆 namespace（比如 `settings/chat/common`），只加载当前页面需要的翻译
- 翻译文件改成动态 import（懒加载），比如 `i18n.addResourceBundle` 或 `i18next-http-backend`

#### 6) 语言切换会不会导致全量重渲染？体验怎么保证？
`react-i18next` 会让使用 `t()` 的组件在语言变化时重新渲染，这是符合预期的。体验上，我们保证切换语言是用户明确操作；另外可以通过组件拆分和 `memo` 优化，把与文案无关的大组件隔离，避免整个页面重绘。必要时还可以加一个很轻的切换过渡提示，避免用户觉得“闪一下”。

#### 7) 翻译 key 缺失怎么发现？如何做质量保障？
运行时我们用 `fallbackLng` 兜底，避免白屏。质量保障上更关键的是：
- 开发阶段开启 i18next 的 missingKey 日志或上报
- CI 加一个脚本对比 `en.json/zh.json` 的 key 集合，缺失就 fail
- 约定“新增文案必须同步两份”，否则 PR 不过

#### 8) 为什么不用 ICU/messageformat 做复数、性别、日期？
当前产品文案简单，中英文足够。要做更专业的国际化（复数、日期、本地化格式），可以接 `i18next-icu` 或统一接入 `Intl.DateTimeFormat/NumberFormat`，并把时间/数字格式化收口到 util，避免散落在组件里。

---

## Theme（明暗主题切换）

### 60–90 秒话术版

主题切换我们用 Zustand 做状态管理，核心文件是 `src/stores/themeStore.ts`。状态拆成两层：用户选择的 `theme`（`light/dark/auto`）和实际生效的 `effectiveTheme`（`light/dark`）。这样 `auto` 模式下我们可以根据系统主题计算实际主题，并且在系统主题变化时更新。  
每次切换主题，会把 `effectiveTheme` 写到 `document.documentElement`：设置 `data-theme=dark|light`，并切换 `dark-theme/light-theme` class。CSS 侧用 `[data-theme="dark"]` 作为总开关：`src/index.css` 控制全局背景和过渡，`src/themes/dark-theme.css` 定义暗色 CSS 变量和组件样式。  
为了解决刷新时的闪烁，我们在 `persist` 的 `onRehydrateStorage` 回调里，store 恢复后第一时间把主题写到 DOM，尽量保证首屏就命中正确主题。`auto` 跟随系统则用 `matchMedia('(prefers-color-scheme: dark)')` 监听变化，但只有当用户选择 `auto` 时才会触发更新，避免不必要的重渲染。

### 面试追问点（每点 60–90 秒）

#### 1) 为什么要 `theme` + `effectiveTheme` 两层？
因为 `auto` 本质是策略，不是具体主题。UI 上用户选择的是“跟随系统”，但落到 CSS 必须是确定的 `dark/light`。分两层能清晰表达：`theme` 负责记录用户意图，`effectiveTheme` 负责驱动 DOM/CSS 渲染；也方便打点和 debug：一眼能看出用户选了 `auto` 还是手动。

#### 2) 为什么把主题写到 `documentElement` 的 `data-theme`？
这是最通用的做法：CSS 可以用属性选择器全局控制，同时不依赖具体组件树，不用在每个组件传 props。写到 `html` 比写到某个容器更稳，因为样式可以覆盖全局（包括 body 背景、滚动条、弹窗等）。另外我们也同步切换 class，是为了兼容未来按 class 做更复杂的主题策略。

#### 3) `auto` 模式如何实时跟随系统？
我们用 `matchMedia('(prefers-color-scheme: dark)')`，监听 `change` 事件。事件触发时拿 store 当前值，如果用户还是 `auto` 就重新计算并更新 `effectiveTheme`；如果用户手动选了 `light/dark`，就忽略系统变化，尊重用户选择。这样既保证体验一致，也避免频繁更新。

#### 4) 怎么避免主题切换/刷新时闪烁？
关键是越早写 DOM 越好。我们用 `persist` 的 `onRehydrateStorage`，在 Zustand 恢复持久化状态时立刻把 `data-theme` 写到 DOM；同时 `App.tsx` 的 mount 时也会调用 `updateEffectiveTheme()` 做兜底。CSS 里也用 `transition` 做平滑过渡，避免瞬间切换带来的刺眼感。

#### 5) 为什么把主题状态放 Zustand，而不是纯 CSS 或 Context？
主题是跨页面/跨组件的全局状态，还要持久化、要跟随系统变化。Zustand 的好处是：写法轻、不会像 Context 那样因为 value 变化导致大范围 re-render；配 `persist` 能很自然地把用户选择落到 `localStorage`；而且我们可以在 store 里集中处理“写 DOM、监听系统主题”这些副作用，组件只负责按钮触发，职责更清晰。

#### 6) 如何做到“0 闪烁”的主题（更进阶）？
目前我们用 `onRehydrateStorage` + `App` 首次 `updateEffectiveTheme()`，已经能显著减少闪烁。但严格意义的 0 闪烁最好是：在 HTML 首屏渲染前就把 `data-theme` 写到 `<html>` 上。做法是在 `index.html` 或入口脚本最早位置加一段内联脚本：读取 `localStorage` 的 theme，计算 `effectiveTheme`，然后立刻 `setAttribute`。这样 CSS 在首屏就按正确主题渲染，基本不会闪。

#### 7) `matchMedia` 监听如何避免内存泄漏？
泄漏点在于组件反复挂载时重复 `addEventListener`。我们把监听逻辑放到 store 文件顶层，且用 `createEventManager` 统一注册管理，避免重复绑定；如果未来需要在某些场景手动清理，也可以通过事件管理器集中移除。核心原则是：监听要么全局只注册一次，要么明确在生命周期里 add/remove。

#### 8) CSS 变量 vs Tailwind/主题组件库，怎么选？
我们用 `[data-theme="dark"]` + CSS 变量，是因为它框架无关、改造成本低、覆盖面广（包括 body 背景、滚动条、第三方组件）。如果将来要统一设计系统，CSS 变量仍是底层最稳定的方案；在其上再叠 Tailwind 的 dark mode 或组件库主题都可以。面试时我会强调“选择器作为开关、变量作为契约”，可维护性最好。

#### 9) 为什么写在 `documentElement` 而不是 `body`？
写在 `html`（`documentElement`）更通用：很多全局样式选择器会以 `html` 为根，第三方组件可能挂在 body 外层或 portal，写到 `html` 能覆盖所有。body 也能做，但一旦有 portal/弹层/全局背景等，`html` 作为统一开关更稳。

---

## 快速文件速记（面试最后 10 秒收尾）

- **i18n**：`src/index.tsx`（同步初始化）→ `src/i18n/config.ts`（语言选择+资源注册）→ `src/i18n/locales/*.json`（字典）→ `SettingsPanel.tsx`（切换语言并持久化）
- **Theme**：`src/stores/themeStore.ts`（`theme/effectiveTheme` + `persist` + `matchMedia` 监听）→ `src/index.css` / `src/themes/dark-theme.css`（CSS 选择器与变量）→ `App.tsx`（启动兜底更新）

### Hook vs store 选择（决策口诀）

- **全局、长期、必须唯一** → store 顶层
- **局部、短期、随组件生灭** → Hook
- 主题 `matchMedia`：更偏 store 顶层（全局且希望只监听一次）
- 任意组件的 DOM 事件（click/scroll/resize）：更偏 Hook（组件卸载自动清理）
- 如果硬要用 Hook 做全局监听：必须把 Hook 放在 `App` 这类根组件里，并保证只挂载一次，否则会重复注册

