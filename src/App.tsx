import React, { useEffect, Suspense, lazy } from 'react';
import { useThemeStore } from './stores/themeStore';

// ✅ 懒加载 ChatInterface（代码分割）- 使用重构版
const ChatInterface = lazy(() => import('./components/business/Chat/ChatInterfaceRefactored'));

// ✅ 加载中占位符（优化 LCP）
const LoadingFallback = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    fontSize: '18px',
    color: '#666'
  }}>
    <div>加载中...</div>
  </div>
);

const App: React.FC = () => {
  const { theme, updateEffectiveTheme } = useThemeStore();
  
  // 初始化主题
  useEffect(() => {
    updateEffectiveTheme();
  }, []);
  
  return (
    <div className="app">
      <Suspense fallback={<LoadingFallback />}>
        <ChatInterface />
      </Suspense>
    </div>
  );
};

export default App;

