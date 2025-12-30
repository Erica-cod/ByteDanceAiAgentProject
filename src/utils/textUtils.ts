/**
 * 文本处理工具函数
 */

/**
 * 超长文本检测阈值配置
 */
export const LONG_TEXT_THRESHOLDS = {
  // 软提示阈值（建议使用 chunking）
  SOFT: {
    chars: 5000,    // 约 5000 字符
    lines: 300,     // 约 300 行
  },
  // 强提示阈值（强烈建议使用 chunking）
  HARD: {
    chars: 12000,   // 约 12000 字符
    lines: 1000,    // 约 1000 行
  },
} as const;

/**
 * 文本统计信息
 */
export interface TextStats {
  chars: number;      // 字符数
  lines: number;      // 行数
  words: number;      // 单词数（英文）
  chineseChars: number; // 中文字符数
}

/**
 * 计算文本统计信息
 */
export function getTextStats(text: string): TextStats {
  const chars = text.length;
  const lines = text.split('\n').length;
  
  // 统计单词数（简单按空格分割）
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  
  // 统计中文字符数
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  
  return { chars, lines, words, chineseChars };
}

/**
 * 检测是否为超长文本
 */
export function isLongText(text: string): {
  isLong: boolean;
  level: 'none' | 'soft' | 'hard';
  stats: TextStats;
  reason?: string;
} {
  const stats = getTextStats(text);
  
  // 硬阈值检测
  if (stats.chars >= LONG_TEXT_THRESHOLDS.HARD.chars) {
    return {
      isLong: true,
      level: 'hard',
      stats,
      reason: `文本过长（${stats.chars} 字符），建议使用智能分段处理`,
    };
  }
  
  if (stats.lines >= LONG_TEXT_THRESHOLDS.HARD.lines) {
    return {
      isLong: true,
      level: 'hard',
      stats,
      reason: `文本行数过多（${stats.lines} 行），建议使用智能分段处理`,
    };
  }
  
  // 软阈值检测
  if (stats.chars >= LONG_TEXT_THRESHOLDS.SOFT.chars) {
    return {
      isLong: true,
      level: 'soft',
      stats,
      reason: `文本较长（${stats.chars} 字符），建议使用智能分段处理`,
    };
  }
  
  if (stats.lines >= LONG_TEXT_THRESHOLDS.SOFT.lines) {
    return {
      isLong: true,
      level: 'soft',
      stats,
      reason: `文本行数较多（${stats.lines} 行），建议使用智能分段处理`,
    };
  }
  
  return {
    isLong: false,
    level: 'none',
    stats,
  };
}

/**
 * 粗略估算 token 数（简单方法：中文 1 字 ≈ 1.5 token，英文 1 词 ≈ 1.3 token）
 */
export function estimateTokens(text: string): number {
  const stats = getTextStats(text);
  
  // 中文字符 token 估算
  const chineseTokens = stats.chineseChars * 1.5;
  
  // 英文单词 token 估算
  const englishWords = stats.words;
  const englishTokens = englishWords * 1.3;
  
  // 简化估算：取两者较大值，加上标点和空格的影响
  const estimatedTokens = Math.max(
    chineseTokens,
    englishTokens,
    stats.chars / 4  // 兜底：字符数 / 4
  );
  
  return Math.round(estimatedTokens);
}

/**
 * 格式化文本统计信息为可读字符串
 */
export function formatTextStats(stats: TextStats): string {
  const parts: string[] = [];
  
  parts.push(`${stats.chars} 字符`);
  parts.push(`${stats.lines} 行`);
  
  if (stats.words > 0) {
    parts.push(`${stats.words} 词`);
  }
  
  const estimatedTokens = estimateTokens(
    // 需要重新构造文本，这里简化处理
    'x'.repeat(stats.chars)
  );
  parts.push(`约 ${estimatedTokens} tokens`);
  
  return parts.join(' · ');
}

