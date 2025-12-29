import { useMemo } from 'react';

/**
 * 日期格式化 Hook
 * 将日期字符串格式化为相对时间或绝对时间
 * 
 * @param dateString - 日期字符串
 * @param options - 格式化选项
 * @returns 格式化后的日期字符串
 * 
 * @example
 * ```tsx
 * const formattedDate = useDateFormat('2024-01-01T12:00:00Z');
 * // 输出: "2小时前" 或 "昨天" 或 "1月1日"
 * ```
 */
export function useDateFormat(
  dateString: string | Date,
  options: {
    relative?: boolean; // 是否使用相对时间（默认 true）
    locale?: string; // 语言环境（默认 'zh-CN'）
  } = {}
): string {
  const { relative = true, locale = 'zh-CN' } = options;

  return useMemo(() => {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInHours = diffInMs / (1000 * 60 * 60);

    if (relative) {
      // 相对时间
      if (diffInHours < 1) {
        const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
        if (diffInMinutes < 1) return '刚刚';
        return `${diffInMinutes}分钟前`;
      } else if (diffInHours < 24) {
        return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
      } else if (diffInHours < 48) {
        return '昨天';
      } else if (diffInHours < 168) {
        return `${Math.floor(diffInHours / 24)}天前`;
      } else {
        return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
      }
    }

    // 绝对时间
    return date.toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [dateString, relative, locale]);
}

