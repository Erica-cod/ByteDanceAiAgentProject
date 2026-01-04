import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { BrowserRouter } from 'react-router-dom';

// ✅ 导入 i18n 配置（同步，必需）
import './i18n/config';

// ✅ 延迟加载代码高亮样式（非关键资源）
// 只在需要时加载，减少初始渲染阻塞
const loadHighlightStyles = () => {
  import('highlight.js/styles/github.css').catch((err) => {
    console.warn('Failed to load highlight.js styles:', err);
  });
};

// ✅ 延迟加载暗色主题样式（非关键资源）
const loadDarkTheme = () => {
  import('./themes/dark-theme.css').catch((err) => {
    console.warn('Failed to load dark theme:', err);
  });
};

// ✅ 在空闲时加载非关键资源
if ('requestIdleCallback' in window) {
  requestIdleCallback(() => {
    loadHighlightStyles();
    loadDarkTheme();
  });
} else {
  // 降级方案：延迟加载
  setTimeout(() => {
    loadHighlightStyles();
    loadDarkTheme();
  }, 1);
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

