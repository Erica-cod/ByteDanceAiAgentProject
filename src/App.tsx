import React, { useEffect } from 'react';
import { useThemeStore } from './stores/themeStore';
import { runWhenIdle, cancelIdleTask } from './utils/perf/scheduling';
import { initLocalStorageLRU } from './utils/storage/localStorageLRU';
import { AppRoutes } from './router/AppRoutes';

const App: React.FC = () => {
  const { theme, updateEffectiveTheme } = useThemeStore();
  
  // 初始化主题
  useEffect(() => {
    updateEffectiveTheme();
  }, []);

  // ✅ 初始化 LocalStorage LRU 管理
  useEffect(() => {
    // 将非关键初始化延后到空闲时间，避免和首屏渲染抢主线程。
    const idleId = runWhenIdle(() => {
      import('./utils/auth/userManager').then(({ getUserId }) => {
        const userId = getUserId();
        initLocalStorageLRU(userId);
      });
    }, { timeout: 2000 });

    return () => {
      cancelIdleTask(idleId);
    };
  }, []);
  
  return (
    <div className="app">
      <AppRoutes />
    </div>
  );
};

export default App;

