/**
 * 对话上下文压缩器
 *
 * 将较早的对话历史压缩为摘要，减少发送给远程模型的 token 数。
 * 使用本地模型做摘要生成，不消耗远程 token。
 *
 * 策略：
 *   最近 2 轮（4 条消息）：保持原文
 *   第 3~N 轮（更早的历史）：压缩为一段摘要文本
 */

import { callLocalModel } from './model-service.js';
import type { ChatMessage } from '../../../types/chat.js';

const SUMMARY_PROMPT = `请将以下对话历史浓缩为一段关键信息摘要。要求：
1. 保留重要的事实、结论和用户偏好
2. 保留关键的技术细节、数字、名称
3. 去掉寒暄、重复和冗余表述
4. 用简洁的第三人称描述
5. 控制在 200 字以内

对话历史：
`;

// 摘要缓存（进程内，按 conversationId + 消息数范围 缓存）
const summaryCache = new Map<string, { summary: string; expiresAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 分钟

function getCacheKey(conversationId: string, messageCount: number): string {
  return `${conversationId}:${messageCount}`;
}

/**
 * 压缩对话历史中较早的部分。
 *
 * @param messages - 完整的历史消息列表（不含 system prompt 和当前消息）
 * @param recentKeepCount - 保留最近多少条消息不做压缩（默认 4，即最近 2 轮）
 * @param conversationId - 对话 ID，用于摘要缓存
 * @returns 压缩后的消息列表：[摘要消息(可选), ...最近N条原始消息]
 */
export async function compressContext(
  messages: ChatMessage[],
  recentKeepCount: number = 4,
  conversationId?: string,
): Promise<ChatMessage[]> {
  if (messages.length <= recentKeepCount) {
    return messages; // 消息不多，无需压缩
  }

  const olderMessages = messages.slice(0, -recentKeepCount);
  const recentMessages = messages.slice(-recentKeepCount);

  if (olderMessages.length < 2) {
    return messages; // 需要压缩的消息太少
  }

  // 检查缓存
  if (conversationId) {
    const cacheKey = getCacheKey(conversationId, olderMessages.length);
    const cached = summaryCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      console.log(`📦 [ContextCompressor] 使用缓存的摘要 (key=${cacheKey})`);
      return [
        { role: 'system', content: `[前序对话摘要] ${cached.summary}` },
        ...recentMessages,
      ];
    }
  }

  // 构建待摘要的文本
  const historyText = olderMessages
    .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content.slice(0, 500)}`)
    .join('\n');

  // 如果待压缩内容本身就很短，没必要压缩
  if (historyText.length < 300) {
    return messages;
  }

  console.log(`📦 [ContextCompressor] 压缩 ${olderMessages.length} 条早期消息 (${historyText.length} chars)`);

  try {
    const summaryMessages: ChatMessage[] = [
      { role: 'system', content: SUMMARY_PROMPT + historyText },
      { role: 'user', content: '请输出摘要：' },
    ];

    const stream = await callLocalModel(summaryMessages, {});

    let summary = '';
    for await (const chunk of stream) {
      const text = chunk.toString();
      const lines = text.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          if (json.message?.content) {
            summary += json.message.content;
          }
        } catch {
          // 忽略非 JSON 行
        }
      }
    }

    summary = summary.trim();
    if (summary.length < 20) {
      console.warn('⚠️  [ContextCompressor] 摘要生成内容太短，保留原始消息');
      return messages;
    }

    console.log(`✅ [ContextCompressor] 摘要生成成功 (${summary.length} chars), 原始 ${historyText.length} chars → 压缩率 ${((1 - summary.length / historyText.length) * 100).toFixed(0)}%`);

    // 写入缓存
    if (conversationId) {
      const cacheKey = getCacheKey(conversationId, olderMessages.length);
      summaryCache.set(cacheKey, { summary, expiresAt: Date.now() + CACHE_TTL_MS });

      // 限制缓存大小
      if (summaryCache.size > 200) {
        const oldest = summaryCache.keys().next().value;
        if (oldest) summaryCache.delete(oldest);
      }
    }

    return [
      { role: 'system', content: `[前序对话摘要] ${summary}` },
      ...recentMessages,
    ];
  } catch (err) {
    console.warn('⚠️  [ContextCompressor] 摘要生成失败，保留原始消息:', err);
    return messages;
  }
}
