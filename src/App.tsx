import React, { useEffect } from 'react';
import { useThemeStore } from './stores/themeStore';
import { initLocalStorageLRU } from './utils/localStorageLRU';
import { AppRoutes } from './router/AppRoutes';

const App: React.FC = () => {
  const { theme, updateEffectiveTheme } = useThemeStore();
  
  // 初始化主题
  useEffect(() => {
    updateEffectiveTheme();
  }, []);

  // ✅ 初始化 LocalStorage LRU 管理
  useEffect(() => {
    console.log('🚀 初始化 LocalStorage LRU 管理...');
    // 获取用户 ID 并初始化 LRU
    import('./utils/userManager').then(({ getUserId }) => {
      const userId = getUserId();
      initLocalStorageLRU(userId);
    });
  }, []);
  
  return (
    <div className="app">
      <AppRoutes />
    </div>
  );
};

export default App;

