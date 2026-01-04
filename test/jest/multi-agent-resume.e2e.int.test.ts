/**
 * Multi-Agent 断点续流（E2E，可选）
 *
 * 覆盖点：
 * - multi_agent 模式流式输出中断后，Redis 保存 multi_agent:{conversationId}:{assistantMessageId}
 * - 通过 resumeFromRound 继续生成（至少进入下一轮）
 *
 * 开关：
 * - RUN_MULTI_AGENT_RESUME_TEST=1 才会执行（默认跳过，避免消耗外部 LLM 配额）
 *
 * 依赖：
 * - 本地服务已启动（默认 http://localhost:8080）
 * - 火山/模型配置可用（否则跳过）
 */

import { jest } from '@jest/globals';

function getBaseUrl() {
  return process.env.API_URL || process.env.BASE_URL || 'http://localhost:8080';
}

async function canReachServer(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/chat`, { method: 'OPTIONS' });
    return res.status >= 200 && res.status < 600;
  } catch {
    return false;
  }
}

async function readSSEUntil(
  res: Response,
  onEvent: (evt: any) => void,
  opts: { timeoutMs: number; stopWhen: () => boolean }
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buf = '';

  const start = Date.now();
  while (Date.now() - start < opts.timeoutMs) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    const lines = buf.split('\n');
    buf = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (!data) continue;
      if (data === '[DONE]') return;
      try {
        const parsed = JSON.parse(data);
        onEvent(parsed);
      } catch {
        // ignore
      }
    }

    if (opts.stopWhen()) return;
  }
}

describe('multi-agent resume (optional e2e)', () => {
  jest.setTimeout(240_000);

  test('interrupt -> redis state -> resume', async () => {
    if (process.env.RUN_MULTI_AGENT_RESUME_TEST !== '1') {
      // eslint-disable-next-line no-console
      console.warn('未设置 RUN_MULTI_AGENT_RESUME_TEST=1，跳过 multi-agent resume E2E');
      return;
    }

    // 必要配置检查（避免白跑）
    if (!process.env.ARK_API_KEY) {
      // eslint-disable-next-line no-console
      console.warn('未配置 ARK_API_KEY，跳过 multi-agent resume E2E');
      return;
    }

    const baseUrl = getBaseUrl();
    const reachable = await canReachServer(baseUrl);
    if (!reachable) {
      // eslint-disable-next-line no-console
      console.warn(`服务不可达，跳过 multi-agent resume E2E：${baseUrl}`);
      return;
    }

    const userId = `jest_user_ma_${Date.now()}`;
    const deviceId = `jest_device_ma_${Date.now()}`;
    const assistantMessageId = `jest_asst_${Date.now()}`;

    // 1) 启动 multi-agent，会在第 2 轮完成后中断
    let conversationId: string | null = null;
    let completedRounds = 0;

    const ac1 = new AbortController();
    const r1 = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: '什么是量子计算？请简要解释原理和应用。',
        modelType: 'volcano',
        userId,
        deviceId,
        mode: 'multi_agent',
        clientUserMessageId: `jest_user_msg_${Date.now()}`,
        clientAssistantMessageId: assistantMessageId,
      }),
      signal: ac1.signal,
    });

    expect([200, 429]).toContain(r1.status);
    if (r1.status !== 200) {
      // eslint-disable-next-line no-console
      console.warn('触发了队列/限流（非 200），跳过本次 E2E');
      return;
    }

    await readSSEUntil(
      r1,
      (evt) => {
        if (evt?.type === 'init' && evt.conversationId) {
          conversationId = evt.conversationId;
        }
        if (evt?.type === 'round_complete' && typeof evt.round === 'number') {
          completedRounds = Math.max(completedRounds, evt.round);
          if (completedRounds >= 2) {
            ac1.abort();
          }
        }
      },
      {
        timeoutMs: 120_000,
        stopWhen: () => completedRounds >= 2,
      }
    );

    expect(conversationId).toBeTruthy();
    expect(completedRounds).toBeGreaterThanOrEqual(2);

    // 2) 验证 Redis 状态存在（multi_agent:{conversationId}:{assistantMessageId}）
    const {
      isRedisAvailable,
      getRedisClient,
      closeRedisClient,
      loadMultiAgentState,
    } = await import('../../api/_clean/infrastructure/cache/redis-client.js');

    const redisOk = await isRedisAvailable();
    if (!redisOk) {
      // eslint-disable-next-line no-console
      console.warn('Redis 不可用，跳过后续验证');
      return;
    }

    const redis = getRedisClient();
    // 给后端一点时间异步写入
    await new Promise((r) => setTimeout(r, 1000));

    const state = await loadMultiAgentState(redis, conversationId!, assistantMessageId, {
      renewTTL: true,
      maxRounds: 5,
    });
    expect(state).toBeTruthy();
    if (state) {
      expect(state.completedRounds).toBeGreaterThanOrEqual(2);
      expect(state.userId).toBe(userId);
    }

    // 3) resumeFromRound 继续生成（至少出现 > completedRounds 的 round_complete 或 agent_output）
    let resumedToRound = completedRounds;
    const ac2 = new AbortController();
    const r2 = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: '继续。',
        modelType: 'volcano',
        userId,
        deviceId,
        conversationId: conversationId!,
        mode: 'multi_agent',
        clientUserMessageId: `jest_user_msg_${Date.now()}`,
        clientAssistantMessageId: assistantMessageId,
        resumeFromRound: completedRounds,
      }),
      signal: ac2.signal,
    });

    expect([200, 429]).toContain(r2.status);
    if (r2.status !== 200) {
      // eslint-disable-next-line no-console
      console.warn('resume 请求触发队列/限流（非 200），跳过断言');
      await closeRedisClient();
      return;
    }

    await readSSEUntil(
      r2,
      (evt) => {
        if (evt?.type === 'round_complete' && typeof evt.round === 'number') {
          resumedToRound = Math.max(resumedToRound, evt.round);
          if (resumedToRound > completedRounds) {
            ac2.abort();
          }
        }
        if (evt?.type === 'agent_output' && typeof evt.round === 'number') {
          resumedToRound = Math.max(resumedToRound, evt.round);
          if (resumedToRound > completedRounds) {
            ac2.abort();
          }
        }
      },
      {
        timeoutMs: 120_000,
        stopWhen: () => resumedToRound > completedRounds,
      }
    );

    expect(resumedToRound).toBeGreaterThan(completedRounds);

    await closeRedisClient();
  });
});


