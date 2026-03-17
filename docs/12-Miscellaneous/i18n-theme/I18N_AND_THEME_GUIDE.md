# 多语言和主题切换功能使用指南

## 功能概述

本项目已集成完整的多语言（i18n）和主题切换功能，支持：

- **多语言支持**：中文和英文
- **主题模式**：浅色模式、深色模式、跟随系统
- **持久化存储**：用户设置会自动保存到本地存储

## 功能特性

### 1. 多语言支持

#### 支持的语言
- 🇨🇳 中文（简体）
- 🇺🇸 英文（English）

#### 自动语言检测
- 首次访问时，系统会根据浏览器语言自动选择合适的语言
- 用户手动选择的语言会被保存，下次访问时自动应用

#### 语言切换
1. 点击右上角的 **⚙️ 设置** 按钮
2. 在"语言"部分选择您想要的语言
3. 页面会立即切换到所选语言

### 2. 主题切换

#### 支持的主题模式
- ☀️ **浅色模式**：明亮清爽的界面
- 🌙 **深色模式**：护眼的暗色界面
- 🔄 **跟随系统**：自动跟随操作系统的主题设置

#### 主题切换
1. 点击右上角的 **⚙️ 设置** 按钮
2. 在"主题"部分选择您想要的主题模式
3. 界面会立即切换到所选主题

#### 深色模式特性
- 精心设计的暗色配色方案
- 降低屏幕亮度，减少眼睛疲劳
- 所有组件都完美适配深色主题
- 代码高亮也针对深色模式优化

### 3. 其他设置

在设置面板中，您还可以：
- 选择 AI 模型（Ollama / Doubao）
- 切换对话模式（单智能体 / 多智能体）

## 技术实现

### 使用的技术栈

- **i18next**: 国际化框架
- **react-i18next**: React 的 i18next 绑定
- **Zustand**: 状态管理（主题状态）
- **CSS Variables**: 主题样式变量

### 项目结构

```
src/
├── i18n/
│   ├── config.ts              # i18n 配置
│   └── locales/
│       ├── zh.json            # 中文翻译
│       └── en.json            # 英文翻译
├── stores/
│   └── themeStore.ts          # 主题状态管理
├── themes/
│   └── dark-theme.css         # 深色主题样式
└── components/
    └── SettingsPanel.tsx      # 设置面板组件
```

### 核心文件说明

#### 1. i18n 配置 (`src/i18n/config.ts`)
- 初始化 i18next
- 加载语言资源
- 自动检测浏览器语言
- 从本地存储恢复用户语言设置

#### 2. 主题状态管理 (`src/stores/themeStore.ts`)
- 使用 Zustand 管理主题状态
- 支持三种主题模式：light、dark、auto
- 自动监听系统主题变化
- 持久化存储用户主题选择

#### 3. 深色主题样式 (`src/themes/dark-theme.css`)
- 使用 CSS 变量定义暗色主题
- 通过 `[data-theme="dark"]` 选择器应用样式
- 覆盖所有组件的颜色方案

#### 4. 设置面板 (`src/components/SettingsPanel.tsx`)
- 模态对话框形式的设置界面
- 集成语言切换、主题切换等功能
- 响应式设计，适配移动端

## 开发指南

### 添加新的翻译

1. 在 `src/i18n/locales/zh.json` 中添加中文翻译：
```json
{
  "yourKey": {
    "subKey": "你的翻译文本"
  }
}
```

2. 在 `src/i18n/locales/en.json` 中添加英文翻译：
```json
{
  "yourKey": {
    "subKey": "Your translation text"
  }
}
```

3. 在组件中使用：
```tsx
import { useTranslation } from 'react-i18next';

const YourComponent = () => {
  const { t } = useTranslation();
  return <div>{t('yourKey.subKey')}</div>;
};
```

### 添加新的主题样式

在 `src/themes/dark-theme.css` 中添加新的样式规则：

```css
[data-theme="dark"] .your-component {
  background: var(--bg-primary);
  color: var(--text-primary);
  border-color: var(--border-color);
}
```

### 使用主题状态

```tsx
import { useThemeStore } from '../stores/themeStore';

const YourComponent = () => {
  const { theme, effectiveTheme, setTheme } = useThemeStore();
  
  // theme: 用户选择的主题 ('light' | 'dark' | 'auto')
  // effectiveTheme: 实际应用的主题 ('light' | 'dark')
  // setTheme: 切换主题的方法
  
  return (
    <button onClick={() => setTheme('dark')}>
      切换到深色模式
    </button>
  );
};
```

## 最佳实践

### 1. 翻译文本
- 使用语义化的键名，如 `chat.sendButton` 而不是 `btn1`
- 保持翻译文件结构清晰，按功能模块分组
- 避免硬编码文本，所有用户可见的文本都应该使用 `t()` 函数

### 2. 主题样式
- 使用 CSS 变量而不是硬编码颜色值
- 确保所有组件在浅色和深色模式下都能正常显示
- 注意对比度，确保文本可读性

### 3. 用户体验
- 主题切换应该是平滑的，使用 CSS 过渡动画
- 保存用户的选择，避免每次访问都需要重新设置
- 提供"跟随系统"选项，尊重用户的系统设置

## 浏览器兼容性

- Chrome/Edge: ✅ 完全支持
- Firefox: ✅ 完全支持
- Safari: ✅ 完全支持
- IE11: ❌ 不支持（项目使用现代 React 特性）

## 常见问题

### Q: 如何添加新的语言？

A: 
1. 在 `src/i18n/locales/` 下创建新的语言文件，如 `ja.json`
2. 在 `src/i18n/config.ts` 中导入并注册新语言
3. 在 `SettingsPanel.tsx` 中添加语言切换按钮

### Q: 主题切换后某些组件样式不正确？

A: 检查该组件是否有对应的深色主题样式。在 `src/themes/dark-theme.css` 中添加相应的样式规则。

### Q: 如何自定义主题颜色？

A: 修改 `src/themes/dark-theme.css` 中的 CSS 变量值，如 `--primary-color`、`--bg-primary` 等。

## 更新日志

### v1.0.0 (2024-12-29)
- ✅ 实现中英文双语支持
- ✅ 实现浅色/深色主题切换
- ✅ 添加"跟随系统"主题选项
- ✅ 集成设置面板组件
- ✅ 持久化存储用户设置
- ✅ 所有主要组件支持多语言
- ✅ 完整的深色主题样式

## 贡献指南

如果您想为多语言或主题功能做出贡献：

1. 添加新的语言翻译
2. 优化深色主题的配色方案
3. 修复主题切换相关的 bug
4. 改进设置面板的用户体验

欢迎提交 Pull Request！

## 许可证

本项目遵循 MIT 许可证。

