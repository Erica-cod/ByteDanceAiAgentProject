import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createEventManager } from '../utils/eventManager';

export type Theme = 'light' | 'dark' | 'auto';

interface ThemeState {
  theme: Theme;
  effectiveTheme: 'light' | 'dark'; // 实际应用的主题
  setTheme: (theme: Theme) => void;
  updateEffectiveTheme: () => void;
}

// 获取系统主题偏好
const getSystemTheme = (): 'light' | 'dark' => {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

// 计算有效主题
const calculateEffectiveTheme = (theme: Theme): 'light' | 'dark' => {
  if (theme === 'auto') {
    return getSystemTheme();
  }
  return theme;
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      effectiveTheme: 'light',
      
      setTheme: (theme: Theme) => {
        const effectiveTheme = calculateEffectiveTheme(theme);
        set({ theme, effectiveTheme });
        
        // 应用主题到 DOM
        document.documentElement.setAttribute('data-theme', effectiveTheme);
        document.documentElement.classList.remove('light-theme', 'dark-theme');
        document.documentElement.classList.add(`${effectiveTheme}-theme`);
      },
      
      updateEffectiveTheme: () => {
        const { theme } = get();
        const effectiveTheme = calculateEffectiveTheme(theme);
        set({ effectiveTheme });
        
        // 应用主题到 DOM
        document.documentElement.setAttribute('data-theme', effectiveTheme);
        document.documentElement.classList.remove('light-theme', 'dark-theme');
        document.documentElement.classList.add(`${effectiveTheme}-theme`);
      }
    }),
    {
      name: 'theme-storage',
      onRehydrateStorage: () => (state) => {
        if (state) {
          // 恢复时应用主题
          const effectiveTheme = calculateEffectiveTheme(state.theme);
          state.effectiveTheme = effectiveTheme;
          document.documentElement.setAttribute('data-theme', effectiveTheme);
          document.documentElement.classList.remove('light-theme', 'dark-theme');
          document.documentElement.classList.add(`${effectiveTheme}-theme`);
        }
      }
    }
  )
);

// ✅ 使用事件管理器监听系统主题变化
const themeEventManager = createEventManager();

if (typeof window !== 'undefined') {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  
  const handleThemeChange = () => {
    const store = useThemeStore.getState();
    if (store.theme === 'auto') {
      store.updateEffectiveTheme();
    }
  };
  
  // 使用事件管理器注册监听器（自动管理清理）
  themeEventManager.addEventListener(mediaQuery, 'change', handleThemeChange);
}

// 导出事件管理器（用于测试或手动清理）
export { themeEventManager };

