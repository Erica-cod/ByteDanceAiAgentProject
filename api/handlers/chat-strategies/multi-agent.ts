/**
 * 多 Agent 模式策略
 *
 * 负责鉴权检查和分发到 multiAgentHandler
 */

import { handleMultiAgentMode } from '../multiAgentHandler.js';
import { getBffSessionFromHeaders } from '../../lambda/_utils/bffOidcAuth.js';
import { errorResponseWithStatus } from '../../lambda/_utils/response.js';

export async function handleMultiAgent(opts: {
  message: string;
  userId: string;
  conversationId: string;
  clientAssistantMessageId?: string;
  release: () => void;
  resumeFromRound?: number;
  headers?: Record<string, string>;
  requestOrigin?: string;
}): Promise<Response> {
  const {
    message, userId, conversationId,
    clientAssistantMessageId, release,
    resumeFromRound, headers, requestOrigin,
  } = opts;

  const testBypass =
    process.env.NODE_ENV === 'test' &&
    (headers?.['x-test-auth'] === '1' || headers?.['X-Test-Auth'] === '1');

  if (!testBypass) {
    const session = await getBffSessionFromHeaders(headers);
    if (!session) {
      return errorResponseWithStatus(
        '请先登录后再使用多 Agent 模式（演示版限制）',
        403,
        requestOrigin
      );
    }
  }

  console.log('🤖 [MultiAgent] 启动多Agent协作模式...');
  return handleMultiAgentMode(
    message, userId, conversationId,
    clientAssistantMessageId, release,
    resumeFromRound
  );
}
