# 🔧 12-Miscellaneous（杂项）

## 📌 模块简介

本文件夹包含了一些不属于主要模块但同样重要的技术实现和问题修复，包括国际化、主题切换、JSON 修复、UI 问题修复等。

## 📚 核心文档

### 🌐 国际化和主题

#### 1. I18N_AND_THEME_GUIDE.md（6KB）
**国际化和主题完整指南**

**国际化（i18n）实现：**

```typescript
// i18n 配置
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      zh: {
        translation: {
          welcome: '欢迎',
          chat: '聊天',
          settings: '设置'
        }
      },
      en: {
        translation: {
          welcome: 'Welcome',
          chat: 'Chat',
          settings: 'Settings'
        }
      }
    },
    lng: 'zh',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

// 使用
import { useTranslation } from 'react-i18next';

function App() {
  const { t, i18n } = useTranslation();
  
  return (
    <div>
      <h1>{t('welcome')}</h1>
      <button onClick={() => i18n.changeLanguage('en')}>
        English
      </button>
    </div>
  );
}
```

**主题切换实现：**

```typescript
// 主题配置
const themes = {
  light: {
    background: '#ffffff',
    text: '#000000',
    primary: '#1890ff'
  },
  dark: {
    background: '#1a1a1a',
    text: '#ffffff',
    primary: '#177ddc'
  }
};

// 主题 Store
import create from 'zustand';

const useThemeStore = create((set) => ({
  theme: 'light',
  setTheme: (theme) => set({ theme })
}));

// 使用
function App() {
  const { theme, setTheme } = useThemeStore();
  
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  
  return (
    <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  );
}

// CSS 变量
:root[data-theme='light'] {
  --bg-color: #ffffff;
  --text-color: #000000;
}

:root[data-theme='dark'] {
  --bg-color: #1a1a1a;
  --text-color: #ffffff;
}
```

**持久化：**
```typescript
// 保存主题设置
localStorage.setItem('theme', theme);

// 初始化时读取
const savedTheme = localStorage.getItem('theme') || 'light';
setTheme(savedTheme);
```

#### 2. QUICK_START_I18N_THEME.md（4KB）
**快速开始指南**

简化版的配置和使用说明，适合快速上手。

### 🔧 JSON 处理

#### 3. JSON_REPAIR_IMPLEMENTATION.md（7KB）
**JSON 修复实现**

**问题场景：**
LLM 返回的 JSON 可能不完整或格式错误：
```json
{
  "name": "John",
  "age": 30,
  "hobbies": ["reading", "coding
}
```

**修复策略：**

```typescript
function repairJSON(brokenJSON: string): any {
  try {
    // 1. 尝试直接解析
    return JSON.parse(brokenJSON);
  } catch (error) {
    // 2. 修复常见问题
    let repaired = brokenJSON
      // 补全未闭合的字符串
      .replace(/"([^"]*?)$/g, '"$1"')
      // 补全未闭合的数组
      .replace(/\[([^\]]*?)$/g, '[$1]')
      // 补全未闭合的对象
      .replace(/\{([^}]*?)$/g, '{$1}')
      // 移除末尾逗号
      .replace(/,(\s*[}\]])/g, '$1');
    
    try {
      return JSON.parse(repaired);
    } catch (e) {
      // 3. 使用第三方库
      return JSONRepair(brokenJSON);
    }
  }
}
```

**使用场景：**
```typescript
// 流式传输中的 JSON
const chunks = [];
stream.on('data', (chunk) => {
  chunks.push(chunk);
  
  // 尝试解析
  const partial = chunks.join('');
  try {
    const obj = repairJSON(partial);
    // 成功解析
    handleData(obj);
  } catch (e) {
    // 继续等待更多数据
  }
});
```

#### 4. JSON_REPAIR_STRATEGY.md（6KB）
**JSON 修复策略**

详细的修复策略和算法说明。

#### 5. JSON_GARBAGE_FIX.md（7KB）
**JSON 垃圾字符修复**

**问题：**
LLM 返回的 JSON 前后可能有垃圾字符：
```
这是一个 JSON：{"name": "John"}，请查收。
```

**解决方案：**
```typescript
function extractJSON(text: string): any {
  // 1. 提取 JSON 部分
  const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('No JSON found');
  }
  
  // 2. 解析
  return JSON.parse(jsonMatch[0]);
}

// 使用正则提取多个 JSON
function extractAllJSON(text: string): any[] {
  const regex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
  const matches = text.match(regex) || [];
  return matches.map(m => JSON.parse(m));
}
```

### 🎨 UI 修复

#### 6. PLAN_CARD_RENDERING_FIX.md（5KB）
**计划卡片渲染修复**

**问题：**
多智能体系统中，Planner 生成的计划卡片渲染错误，步骤显示混乱。

**原因：**
1. 状态更新时机不对
2. Key 值设置错误
3. 组件重渲染导致闪烁

**解决方案：**

```typescript
// 1. 使用稳定的 key
const PlanCard = ({ plan }) => {
  return (
    <div className="plan-card">
      {plan.steps.map((step, index) => (
        <div 
          key={`${plan.id}-${step.id}-${index}`}  // 组合 key
          className="step"
        >
          <div className="step-number">{index + 1}</div>
          <div className="step-content">{step.content}</div>
        </div>
      ))}
    </div>
  );
};

// 2. 使用 memo 避免不必要的重渲染
const PlanCard = React.memo(({ plan }) => {
  // ...
}, (prevProps, nextProps) => {
  return prevProps.plan.id === nextProps.plan.id &&
         prevProps.plan.steps.length === nextProps.plan.steps.length;
});

// 3. 使用 CSS 过渡
.step {
  opacity: 0;
  animation: fadeIn 0.3s ease-in forwards;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}
```

**效果：**
- ✅ 步骤显示正确
- ✅ 无闪烁
- ✅ 流畅的动画

## 🎯 关键技术点

### 国际化最佳实践

1. **命名规范**
```typescript
// ✅ 好的命名
{
  "user.profile.name": "Name",
  "user.profile.email": "Email"
}

// ❌ 不好的命名
{
  "name": "Name",
  "email": "Email"
}
```

2. **参数插值**
```typescript
// 定义
{
  "welcome": "Welcome, {{name}}!"
}

// 使用
t('welcome', { name: 'John' })
// 输出: "Welcome, John!"
```

3. **复数处理**
```typescript
{
  "message_one": "You have {{count}} message",
  "message_other": "You have {{count}} messages"
}

t('message', { count: 1 })  // "You have 1 message"
t('message', { count: 5 })  // "You have 5 messages"
```

### 主题切换优化

1. **避免闪烁**
```typescript
// 在 HTML 加载前设置主题
<script>
  const theme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', theme);
</script>
```

2. **平滑过渡**
```css
* {
  transition: background-color 0.3s ease,
              color 0.3s ease;
}
```

3. **系统主题检测**
```typescript
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
  ? 'dark'
  : 'light';

// 监听系统主题变化
window.matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', (e) => {
    setTheme(e.matches ? 'dark' : 'light');
  });
```

### JSON 处理技巧

1. **渐进式解析**
```typescript
// 流式接收 JSON 时，尝试解析部分内容
const tryParsePartial = (text: string) => {
  // 尝试提取已完成的对象
  const completeObjects = text.match(/\{[^{}]*\}/g);
  return completeObjects?.map(obj => JSON.parse(obj)) || [];
};
```

2. **容错解析**
```typescript
// 即使 JSON 有错误，也尽可能提取信息
const tolerantParse = (text: string) => {
  try {
    return JSON.parse(text);
  } catch (e) {
    // 使用正则提取 key-value
    const pairs = text.match(/"(\w+)"\s*:\s*"([^"]*)"/g);
    const obj = {};
    pairs?.forEach(pair => {
      const [key, value] = pair.match(/"([^"]+)"/g);
      obj[key.slice(1, -1)] = value.slice(1, -1);
    });
    return obj;
  }
};
```

## 💡 面试要点

### 1. 国际化实现
**问题：如何实现国际化？**
- **i18next**：成熟的 i18n 库
- **语言文件**：分离翻译文本
- **动态切换**：无刷新切换语言
- **持久化**：保存用户语言偏好

### 2. 主题切换
**问题：如何实现主题切换？**
- **CSS 变量**：定义主题变量
- **data 属性**：切换主题
- **本地存储**：保存主题偏好
- **系统主题**：检测系统偏好

### 3. JSON 处理
**问题：如何处理不完整的 JSON？**
- **try-catch**：捕获解析错误
- **修复策略**：补全缺失部分
- **容错机制**：提取部分信息
- **第三方库**：使用专业库

### 4. UI 渲染问题
**问题：如何避免组件闪烁？**
- **稳定 key**：使用唯一稳定的 key
- **React.memo**：避免不必要的重渲染
- **CSS 过渡**：使用动画平滑过渡
- **骨架屏**：loading 时显示骨架

## 🔗 相关模块

- **06-Performance-Optimization**：UI 性能优化
- **04-Multi-Agent**：计划卡片的使用场景

## 📊 实现效果

### 用户体验
- ✅ 多语言支持
- ✅ 深色/浅色主题
- ✅ 平滑的主题切换
- ✅ 流畅的 UI 渲染

### 稳定性
- ✅ 容错的 JSON 解析
- ✅ 无闪烁的 UI
- ✅ 主题设置持久化

---

**建议阅读顺序：**
1. `I18N_AND_THEME_GUIDE.md` - 国际化和主题
2. `JSON_REPAIR_IMPLEMENTATION.md` - JSON 修复
3. `PLAN_CARD_RENDERING_FIX.md` - UI 问题修复

**这些虽然是"杂项"，但在项目中同样重要，体现了对用户体验和代码鲁棒性的重视。**

