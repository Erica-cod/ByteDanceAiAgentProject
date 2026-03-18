/**
 * SSE 请求体构建
 */

import { isLongText } from '@/utils/text/textUtils';
import type { UploadPayload } from './types';

interface RequestBuildParams {
  uploadPayload: UploadPayload;
  modelType: string;
  userId: string;
  deviceId: string;
  conversationId: string | null;
  chatMode: string;
  userMessageId: string;
  assistantMessageId: string;
  queueToken: string | null;
  messageText: string;
  completedRounds: number;
}

export function buildSSERequestBody(params: RequestBuildParams): Record<string, unknown> {
  const {
    uploadPayload, modelType, userId, deviceId,
    conversationId, chatMode, userMessageId, assistantMessageId,
    queueToken, messageText, completedRounds,
  } = params;

  const longTextDetection = isLongText(messageText);
  const longTextMode = longTextDetection.level === 'hard' || longTextDetection.level === 'soft'
    ? 'plan_review'
    : 'off';

  return {
    ...uploadPayload,
    modelType,
    userId,
    deviceId: deviceId || undefined,
    conversationId,
    mode: chatMode,
    clientUserMessageId: userMessageId,
    clientAssistantMessageId: assistantMessageId,
    queueToken: queueToken || undefined,
    ...(chatMode === 'multi_agent' && completedRounds > 0
      ? { resumeFromRound: completedRounds + 1 }
      : {}),
    longTextMode,
    ...(longTextMode !== 'off' ? {
      longTextOptions: {
        preferChunking: true,
        maxChunks: 30,
        includeCitations: false,
      },
    } : {}),
  };
}
