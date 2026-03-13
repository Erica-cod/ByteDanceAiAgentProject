import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { BrowserRouter } from 'react-router-dom';
import { dnsPrefetch, preconnect } from './utils/perf/resourceHints';

// ✅ 导入 i18n 配置（同步，必需）
import './i18n/config';

const CRITICAL_INLINE_STYLE_ID = 'critical-inline-style';

function injectCriticalInlineStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(CRITICAL_INLINE_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = CRITICAL_INLINE_STYLE_ID;
  style.textContent = `
    html, body, #root, .app {
      margin: 0;
      padding: 0;
      min-height: 100%;
      background: #f7f8fa;
      color: #1f2329;
    }
    .chat-layout__header, .chat-header {
      min-height: 64px;
    }
    .chat-header__title h1 {
      margin: 0;
      font-size: 28px;
      line-height: 1.3;
      font-weight: 700;
    }
  `;
  document.head.appendChild(style);
}

function setupResourceHints(): void {
  if (typeof window === 'undefined') return;

  // 对真实业务请求域名提前建立连接，减少首个跨域请求握手时间。
  const origins = [
    'https://ark.cn-beijing.volces.com',
    'https://api.tavily.com',
  ];

  origins.forEach(origin => {
    dnsPrefetch(origin);
    preconnect(origin);
  });
}

injectCriticalInlineStyles();
setupResourceHints();

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

