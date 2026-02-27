import { create } from 'zustand';
import { fetchWithCsrf } from '../utils/auth/fetchWithCsrf';

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
  beginLogin: (input?: { returnTo?: string; deviceIdHash?: string }) => void;
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

  beginLogin: (input) => {
    const returnTo = input?.returnTo || window.location.pathname;
    const deviceIdHash = input?.deviceIdHash;
    const qs = new URLSearchParams();
    qs.set('returnTo', returnTo);
    if (deviceIdHash) qs.set('deviceIdHash', deviceIdHash);
    window.location.href = `/api/auth/login?${qs.toString()}`;
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      const res = await fetchWithCsrf('/api/auth/logout', { method: 'POST' });
      const json = await res.json().catch(() => null);
      const idpLogoutUrl: string | null = json?.data?.idpLogoutUrl || null;

      //  完整登出：如果后端给了 IdP logout URL，则做整页跳转（清掉 IdP 自己的 session）
      if (idpLogoutUrl) {
        window.location.assign(idpLogoutUrl);
        return;
      }
    } finally {
      // 不论后端是否成功，都在前端清空状态（避免“假登录”）
      set({ loggedIn: false, user: null, canUseMultiAgent: false, isLoading: false });
    }
  },
}));


