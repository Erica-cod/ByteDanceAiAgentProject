/**
 * 消息高度估算器
 *
 * 根据消息内容长度和类型，估算虚拟列表中消息项的渲染高度。
 * 用于在 Virtuoso 首次渲染某消息前提供合理的 min-height，
 * 避免从底部向上滚动时因高度突变导致 CLS（Cumulative Layout Shift）。
 */

import type { Message } from '@/types/message';

const BASE_HEIGHT = 88;
const LINE_HEIGHT = 24;
const CHARS_PER_LINE = 55;

const THINKING_COLLAPSED_HEIGHT = 48;
const MULTI_AGENT_COLLAPSED_HEIGHT = 140;
const SOURCE_LINKS_HEIGHT = 60;

export function estimateMessageHeight(message: Message): number {
  if (message.role === 'user') {
    const contentLen = message.content?.length ?? 0;
    const lines = Math.max(1, Math.ceil(contentLen / CHARS_PER_LINE));
    return BASE_HEIGHT + lines * LINE_HEIGHT;
  }

  if (message.role === 'assistant') {
    let height = BASE_HEIGHT;

    if (message.multiAgentData) {
      return height + MULTI_AGENT_COLLAPSED_HEIGHT;
    }

    if (message.thinking) {
      height += THINKING_COLLAPSED_HEIGHT;
    }

    const contentLen = message.contentLength || message.content?.length || 0;
    const lines = Math.max(1, Math.ceil(contentLen / CHARS_PER_LINE));
    height += lines * LINE_HEIGHT;

    if (message.sources && message.sources.length > 0) {
      height += SOURCE_LINKS_HEIGHT;
    }

    return height;
  }

  return BASE_HEIGHT;
}
