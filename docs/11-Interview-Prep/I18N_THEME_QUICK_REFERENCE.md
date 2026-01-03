# 🎯 国际化与主题切换 - 面试快速参考

## ⏱️ 3 分钟核心要点

---

## 🌍 国际化（i18n）

### 技术栈
```
i18next + react-i18next + LocalStorage
```

### 核心流程

```typescript
// 1. 初始化配置
i18n
  .use(initReactI18next)
  .init({
    resources: { zh: {...}, en: {...} },
    lng: getDefaultLanguage(),  // 智能检测
    fallbackLng: 'zh'
  });

// 2. 智能检测默认语言
LocalStorage → 浏览器语言 → 默认中文

// 3. 组件中使用
const { t, i18n } = useTranslation();
t('chat.sendButton')  // 翻译
i18n.changeLanguage('en')  // 切换

// 4. 持久化
localStorage.setItem('language', lng)
```

### 翻译文件结构
```json
{
  "chat": {
    "sendButton": "发送",
    "inputPlaceholder": "输入您的问题..."
  },
  "settings": {
    "language": "语言",
    "theme": "主题"
  }
}
```

**按模块分组，语义化 Key**

---

## 🎨 主题切换

### 技术栈
```
Zustand + CSS Variables + matchMedia API + LocalStorage
```

### 核心流程

```typescript
// 1. Zustand 状态管理
{
  theme: 'auto',              // 用户选择: light | dark | auto
  effectiveTheme: 'dark'      // 实际应用: light | dark
}

// 2. 切换主题
setTheme(theme) {
  // 计算实际主题
  const effectiveTheme = theme === 'auto' 
    ? getSystemTheme()  // 获取系统主题
    : theme;
  
  // 应用到 DOM
  document.documentElement.setAttribute('data-theme', effectiveTheme);
  document.documentElement.classList.add(`${effectiveTheme}-theme`);
}

// 3. 系统主题监听 (auto 模式)
window.matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', handleThemeChange);

// 4. 持久化
Zustand persist 中间件自动同步 LocalStorage
```

### CSS 实现

```css
/* CSS Variables 定义主题色 */
[data-theme="dark"] {
  --bg-primary: #1a1a1a;
  --text-primary: #e4e4e4;
  --primary-color: #667eea;
}

/* 应用主题色 */
[data-theme="dark"] .chat-container {
  background: var(--bg-primary);
  color: var(--text-primary);
  transition: background-color 0.2s ease;  /* 平滑过渡 */
}
```

---

## 📋 面试标准答题模板

### Q1: 如何实现多语言切换？

**答：** 我们使用 `i18next` + `react-i18next` 实现：

1. **翻译文件**: JSON 格式，按功能模块分组
2. **智能检测**: LocalStorage → 浏览器语言 → 默认中文
3. **组件使用**: `useTranslation()` Hook → `t('key')` 翻译
4. **切换 + 持久化**: `i18n.changeLanguage()` + `localStorage`

**亮点**：自动检测用户语言偏好，持久化存储

---

### Q2: 如何实现主题切换？

**答：** 我们使用 `Zustand + CSS Variables + matchMedia` 实现：

#### **1. 状态管理 (Zustand)**
- 双层状态: `theme` (用户选择) + `effectiveTheme` (实际应用)
- 三种模式: light / dark / auto

#### **2. DOM 操作**
```typescript
document.documentElement.setAttribute('data-theme', 'dark');
```

#### **3. CSS 样式**
- CSS Variables 定义主题色: `--bg-primary`, `--text-primary`
- Attribute Selector 覆盖样式: `[data-theme="dark"] { ... }`

#### **4. 系统主题监听**
```typescript
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ...)
```
只在 `auto` 模式下响应系统变化

#### **5. 持久化**
Zustand `persist` 中间件自动同步 LocalStorage

**亮点**：支持跟随系统主题、实时监听系统变化、平滑过渡动画

---

## 🎯 关键技术点速查

| 功能 | 技术 | 关键 API |
|------|------|---------|
| **i18n 初始化** | `i18next` | `i18n.init()` |
| **翻译** | `react-i18next` | `useTranslation()` → `t('key')` |
| **语言切换** | `i18next` | `i18n.changeLanguage('en')` |
| **语言持久化** | `LocalStorage` | `localStorage.setItem('language')` |
| **主题状态** | `Zustand` | `create()` + `persist()` |
| **主题 DOM** | DOM API | `setAttribute('data-theme')` |
| **主题样式** | CSS | `[data-theme="dark"]` + CSS Variables |
| **系统主题** | `matchMedia` | `matchMedia('(prefers-color-scheme: dark)')` |

---

## 💡 技术亮点（面试加分点）

### 国际化
1. ✅ **智能检测**: 三级优先级 (LocalStorage → 浏览器 → 默认)
2. ✅ **持久化**: 用户偏好自动保存
3. ✅ **模块化**: 翻译文件按功能分组，易维护

### 主题切换
1. ✅ **跟随系统**: `auto` 模式，实时监听系统主题变化
2. ✅ **双层状态**: 分离用户选择和实际应用
3. ✅ **平滑过渡**: CSS transition 动画
4. ✅ **性能优化**: CSS Variables，避免 JavaScript 动态修改

---

## 🔍 深入追问准备

### Q: 为什么用 CSS Variables 而不是直接切换 CSS 类？

**答：**
1. **集中管理**: 主题色统一在一处定义，修改方便
2. **性能更好**: 浏览器原生支持，比 JS 动态修改快
3. **易于维护**: 新增主题色只需添加变量
4. **动态计算**: 可以用 `calc()` 计算衍生颜色

---

### Q: 为什么主题需要双层状态 (theme + effectiveTheme)？

**答：**
1. `theme` 保存用户意图，可以是 `'auto'`
2. `effectiveTheme` 用于 CSS 渲染，必须是 `'light'` 或 `'dark'`
3. 当用户选择 `auto` 时，`effectiveTheme` 根据系统主题动态计算
4. 这样设计解耦了"用户选择"和"实际渲染"

---

### Q: matchMedia 的作用是什么？

**答：**
`matchMedia` 是浏览器原生 API，用于检测 CSS 媒体查询：

```typescript
const mediaQuery = matchMedia('(prefers-color-scheme: dark)');

// 1. 立即检测系统主题
mediaQuery.matches  // true = 深色, false = 浅色

// 2. 监听系统主题变化
mediaQuery.addEventListener('change', (e) => {
  console.log(e.matches);  // 系统主题改变时触发
});
```

**应用场景**: macOS 白天自动切浅色，晚上自动切深色

---

### Q: 如何防止主题切换时页面闪烁？

**答：** 我们使用了三个策略：

1. **提前应用主题**: 在 `onRehydrateStorage` 回调中立即应用主题
   ```typescript
   onRehydrateStorage: () => (state) => {
     document.documentElement.setAttribute('data-theme', ...);
   }
   ```

2. **CSS 过渡动画**: 平滑过渡，而不是瞬间切换
   ```css
   transition: background-color 0.2s ease;
   ```

3. **初始化时机**: 在 `App.tsx` 最早的 `useEffect` 中执行

---

### Q: 如何支持更多语言（如日语、韩语）？

**答：** 扩展非常简单：

1. 添加翻译文件: `src/i18n/locales/ja.json`
2. 注册资源:
   ```typescript
   import ja from './locales/ja.json';
   
   i18n.init({
     resources: {
       zh: { translation: zh },
       en: { translation: en },
       ja: { translation: ja }  // 新增
     }
   });
   ```
3. 添加切换按钮:
   ```tsx
   <button onClick={() => changeLanguage('ja')}>日本語</button>
   ```

**完全不需要修改组件代码**，因为都是用 `t('key')` 引用

---

## 📦 完整数据流（记忆图）

```
用户操作
  ↓
┌──────────────┐    ┌──────────────┐
│  i18n Store  │    │ Theme Store  │
│  - language  │    │ - theme      │
│              │    │ - effective  │
└──────┬───────┘    └──────┬───────┘
       ↓                   ↓
┌──────────────┐    ┌──────────────┐
│ LocalStorage │    │ LocalStorage │
│ - language   │    │ - theme-...  │
└──────┬───────┘    └──────┬───────┘
       ↓                   ↓
┌──────────────┐    ┌──────────────┐
│ 组件重新渲染 │    │  DOM 更新    │
│ t('key')     │    │ data-theme   │
└──────────────┘    └──────┬───────┘
                            ↓
                     ┌──────────────┐
                     │ CSS 应用样式 │
                     │ [data-theme] │
                     └──────────────┘
```

---

## 🎬 面试演示脚本（1 分钟）

> "我们项目实现了**中英双语切换**和**明暗主题切换**。
>
> **国际化方面**，使用 `i18next`，翻译文件按模块管理，支持智能语言检测和持久化。
>
> **主题切换方面**，使用 `Zustand` 管理状态，支持三种模式：浅色、深色、跟随系统。关键是双层状态设计：`theme` 存用户选择，`effectiveTheme` 存实际主题。当用户选择 `auto` 时，我们用 `matchMedia` 监听系统主题变化，自动切换。
>
> CSS 方面使用 CSS Variables 定义主题色，通过 `data-theme` 属性切换样式，配合 `transition` 实现平滑动画。
>
> 两者都使用 `LocalStorage` 持久化，用户刷新不丢失设置。"

---

## 📚 相关文件速查

```
src/i18n/
  ├── config.ts           ← i18n 初始化
  └── locales/
      ├── zh.json         ← 中文翻译
      └── en.json         ← 英文翻译

src/stores/
  └── themeStore.ts       ← 主题状态管理

src/themes/
  └── dark-theme.css      ← 暗色主题样式

src/components/old-structure/
  └── SettingsPanel.tsx   ← 设置面板 (使用示例)

src/App.tsx               ← 主题初始化
```

---

**面试前 5 分钟必看！** 🔥

