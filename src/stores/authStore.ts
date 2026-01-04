import { create } from 'zustand';

export type AuthUser = {
  userId: string;
  username: string;
};

type MeResponse = {
  loggedIn: boolean;
  user: AuthUser | null;
  canUseMultiAgent: boolean;
};

interface AuthState {
  isLoading: boolean;
  loggedIn: boolean;
  user: AuthUser | null;
  canUseMultiAgent: boolean;

  refreshMe: () => Promise<void>;
  demoLogin: (username?: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isLoading: false,
  loggedIn: false,
  user: null,
  canUseMultiAgent: false,

  refreshMe: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch('/api/auth/me');
      const json = await res.json();
      const data = (json?.data || { loggedIn: false, user: null, canUseMultiAgent: false }) as MeResponse;
      set({
        loggedIn: !!data.loggedIn,
        user: data.user ?? null,
        canUseMultiAgent: !!data.canUseMultiAgent,
      });
    } catch (e) {
      // 网络/服务异常时，默认按未登录处理，避免误放开权限
      set({ loggedIn: false, user: null, canUseMultiAgent: false });
    } finally {
      set({ isLoading: false });
    }
  },

  demoLogin: async (username?: string) => {
    set({ isLoading: true });
    try {
      const res = await fetch('/api/auth/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username || 'demo' }),
      });
      const json = await res.json();
      const data = (json?.data || { loggedIn: false, user: null, canUseMultiAgent: false }) as MeResponse;
      set({
        loggedIn: !!data.loggedIn,
        user: data.user ?? null,
        canUseMultiAgent: !!data.canUseMultiAgent,
      });
    } catch (e) {
      set({ loggedIn: false, user: null, canUseMultiAgent: false });
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      // 不论后端是否成功，都在前端清空状态（避免“假登录”）
      set({ loggedIn: false, user: null, canUseMultiAgent: false, isLoading: false });
    }
  },
}));


