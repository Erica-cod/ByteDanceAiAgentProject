/**
 * usePerfMock - 性能测试 Mock 数据 Hook
 *
 * 仅在开发环境 + ?perfMock=1 时启用，
 * 注入 Multi-Agent 大量消息用于性能压测。
 */

import { useEffect, useRef } from 'react';
import { startTransition } from 'react';
import { useChatStore, useUIStore } from '@/stores';
import { buildMultiAgentPerfMock } from '@/dev/fixtures/multiAgentPerfFixture';
import { runWhenIdle, cancelIdleTask } from '@/utils/perf/scheduling';

export function usePerfMockEnabled(): boolean {
  return (
    typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('perfMock') === '1'
    && (
      process.env.NODE_ENV === 'development'
      || window.location.hostname === 'localhost'
      || window.location.hostname === '127.0.0.1'
    )
  );
}

export function usePerfMock(enabled: boolean) {
  const setLoading = useUIStore((s) => s.setLoading);
  const initializedRef = useRef(false);
  const hydrationTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (initializedRef.current) return;
    initializedRef.current = true;

    const { conversationId: mockConversationId, messages: mockMessages } = buildMultiAgentPerfMock();
    const latestMultiAgentMessage = [...mockMessages].reverse().find((item) => Boolean(item.multiAgentData));
    const eagerMessages = latestMultiAgentMessage
      ? [...mockMessages.slice(0, 5), latestMultiAgentMessage]
      : mockMessages.slice(0, 6);

    useChatStore.setState({
      conversationId: mockConversationId,
      messages: eagerMessages,
      firstItemIndex: 0,
      hasMoreMessages: false,
      totalMessages: mockMessages.length,
      isLoadingMore: false,
    });

    const idleId = runWhenIdle(() => {
      hydrationTimerRef.current = window.setTimeout(() => {
        startTransition(() => {
          useChatStore.setState({
            conversationId: mockConversationId,
            messages: mockMessages,
            firstItemIndex: 0,
            hasMoreMessages: false,
            totalMessages: mockMessages.length,
            isLoadingMore: false,
          });
        });
      }, 400);
    }, { timeout: 2500 });

    setLoading(false);
    console.log(
      `[PerfMock] 首屏先注入 ${eagerMessages.length} 条轻量消息，空闲时补齐到 ${mockMessages.length} 条。`,
    );

    return () => {
      cancelIdleTask(idleId);
      if (hydrationTimerRef.current !== null) {
        window.clearTimeout(hydrationTimerRef.current);
        hydrationTimerRef.current = null;
      }
    };
  }, [enabled, setLoading]);
}
