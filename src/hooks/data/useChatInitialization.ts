/**
 * useChatInitialization - 聊天初始化 Hook
 *
 * 处理 userId、deviceId 初始化、登录态刷新、用户切换等启动流程，
 * 从 ChatInterface 中提取以减少主组件职责。
 */

import { useEffect } from 'react';
import { getUserId, initializeUser } from '@/utils/auth/userManager';
import { getPrivacyFirstDeviceId, showPrivacyNotice } from '@/utils/device/privacyFirstFingerprint';
import { useChatStore, useUIStore } from '@/stores';
import { useAuthStore } from '@/stores/authStore';
import { runWhenIdle, cancelIdleTask } from '@/utils/perf/scheduling';

export function useChatInitialization() {
  const userId = useChatStore((s) => s.userId);
  const setUserId = useChatStore((s) => s.setUserId);
  const setDeviceId = useChatStore((s) => s.setDeviceId);

  const chatMode = useUIStore((s) => s.chatMode);
  const setChatMode = useUIStore((s) => s.setChatMode);

  const authLoggedIn = useAuthStore((s) => s.loggedIn);
  const authUser = useAuthStore((s) => s.user);
  const canUseMultiAgent = useAuthStore((s) => s.canUseMultiAgent);
  const refreshMe = useAuthStore((s) => s.refreshMe);

  // 设备指纹异步初始化
  useEffect(() => {
    const idleId = runWhenIdle(() => {
      (async () => {
        const id = await getPrivacyFirstDeviceId();
        setDeviceId(id);
        showPrivacyNotice();
        console.log('🔐 设备 ID（Hash）已生成:', id);
      })();
    }, { timeout: 1200 });
    return () => { cancelIdleTask(idleId); };
  }, [setDeviceId]);

  // 用户初始化
  useEffect(() => {
    initializeUser(userId);
  }, [userId]);

  // 登录态刷新（演示版）
  useEffect(() => {
    const idleId = runWhenIdle(() => {
      refreshMe().catch(() => {});
    }, { timeout: 1500 });
    return () => { cancelIdleTask(idleId); };
  }, [refreshMe]);

  // 登录用户切换时同步 userId
  useEffect(() => {
    const nextUserId = authLoggedIn && authUser?.userId
      ? authUser.userId
      : getUserId();
    if (nextUserId === userId) return;

    setUserId(nextUserId);
    useChatStore.setState({
      conversationId: null,
      messages: [],
      firstItemIndex: 0,
      hasMoreMessages: false,
      totalMessages: 0,
    });
  }, [authLoggedIn, authUser, userId, setUserId]);

  // 未登录时强制回退到单 Agent
  useEffect(() => {
    if (!canUseMultiAgent && chatMode === 'multi_agent') {
      setChatMode('single');
    }
  }, [canUseMultiAgent, chatMode, setChatMode]);
}
