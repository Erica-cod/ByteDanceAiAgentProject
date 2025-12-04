/**
 * 时间工具 - 用于多Agent协作中的时间计算和日期处理
 * 
 * 功能：
 * - 获取当前时间
 * - 日期计算（加减天数、周数、月数）
 * - 日期格式化
 * - 工作日计算
 */

/**
 * 当前时间信息
 */
export interface CurrentTimeInfo {
  now: string;           // ISO 8601格式: "2025-12-04T10:00:00"
  timezone: string;      // 时区: "Asia/Shanghai"
  weekday: string;       // 星期: "Wednesday"
  date: string;          // 日期: "2025-12-04"
  time: string;          // 时间: "10:00:00"
  timestamp: number;     // Unix时间戳（毫秒）
}

/**
 * 日期偏移量
 */
export interface DateOffset {
  years?: number;
  months?: number;
  weeks?: number;
  days?: number;
  hours?: number;
  minutes?: number;
}

/**
 * 日期计算结果
 */
export interface CalculatedDate {
  result_date: string;   // "2025-12-21"
  weekday: string;       // "Saturday"
  iso_string: string;    // "2025-12-21T00:00:00Z"
  timestamp: number;     // Unix时间戳（毫秒）
}

/**
 * 获取当前时间信息
 * 
 * @param timezone - 时区（默认 Asia/Shanghai）
 * @returns 当前时间信息
 */
export function getNow(timezone: string = 'Asia/Shanghai'): CurrentTimeInfo {
  const now = new Date();
  
  // 使用 Intl API 获取本地化信息
  const weekdayFormatter = new Intl.DateTimeFormat('en-US', { 
    weekday: 'long',
    timeZone: timezone 
  });
  
  const weekday = weekdayFormatter.format(now);
  
  // ISO 8601 格式
  const isoString = now.toISOString();
  
  // 分离日期和时间
  const date = isoString.split('T')[0];
  const time = isoString.split('T')[1].split('.')[0];
  
  return {
    now: isoString.replace('.000Z', ''),
    timezone,
    weekday,
    date,
    time,
    timestamp: now.getTime(),
  };
}

/**
 * 计算日期（基于偏移量）
 * 
 * @param baseDate - 基准日期（ISO格式字符串或Date对象）
 * @param offset - 偏移量
 * @returns 计算后的日期
 */
export function calculateDate(
  baseDate: string | Date,
  offset: DateOffset
): CalculatedDate {
  // 解析基准日期
  const base = typeof baseDate === 'string' ? new Date(baseDate) : baseDate;
  
  if (isNaN(base.getTime())) {
    throw new Error(`无效的基准日期: ${baseDate}`);
  }
  
  // 创建新日期对象（避免修改原对象）
  const result = new Date(base);
  
  // 应用偏移量
  if (offset.years) {
    result.setFullYear(result.getFullYear() + offset.years);
  }
  if (offset.months) {
    result.setMonth(result.getMonth() + offset.months);
  }
  if (offset.weeks) {
    result.setDate(result.getDate() + offset.weeks * 7);
  }
  if (offset.days) {
    result.setDate(result.getDate() + offset.days);
  }
  if (offset.hours) {
    result.setHours(result.getHours() + offset.hours);
  }
  if (offset.minutes) {
    result.setMinutes(result.getMinutes() + offset.minutes);
  }
  
  // 获取星期
  const weekdayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'long' });
  const weekday = weekdayFormatter.format(result);
  
  // 格式化日期
  const resultDate = result.toISOString().split('T')[0];
  
  return {
    result_date: resultDate,
    weekday,
    iso_string: result.toISOString(),
    timestamp: result.getTime(),
  };
}

/**
 * 解析自然语言日期描述
 * 
 * @param description - 自然语言描述，如 "下周一"、"3天后"、"下个月15号"
 * @param baseDate - 基准日期（默认当前日期）
 * @returns 计算后的日期
 */
export function parseNaturalDate(
  description: string,
  baseDate?: Date
): CalculatedDate | null {
  const base = baseDate || new Date();
  const lowerDesc = description.toLowerCase().trim();
  
  try {
    // "今天"
    if (lowerDesc === '今天' || lowerDesc === 'today') {
      return calculateDate(base, {});
    }
    
    // "明天"
    if (lowerDesc === '明天' || lowerDesc === 'tomorrow') {
      return calculateDate(base, { days: 1 });
    }
    
    // "后天"
    if (lowerDesc === '后天') {
      return calculateDate(base, { days: 2 });
    }
    
    // "昨天"
    if (lowerDesc === '昨天' || lowerDesc === 'yesterday') {
      return calculateDate(base, { days: -1 });
    }
    
    // "N天后" 或 "N天前"
    const daysMatch = lowerDesc.match(/(\d+)\s*天\s*(后|前)/);
    if (daysMatch) {
      const days = parseInt(daysMatch[1]);
      const direction = daysMatch[2] === '后' ? 1 : -1;
      return calculateDate(base, { days: days * direction });
    }
    
    // "N周后" 或 "N周前"
    const weeksMatch = lowerDesc.match(/(\d+)\s*周\s*(后|前)/);
    if (weeksMatch) {
      const weeks = parseInt(weeksMatch[1]);
      const direction = weeksMatch[2] === '后' ? 1 : -1;
      return calculateDate(base, { weeks: weeks * direction });
    }
    
    // "N个月后" 或 "N个月前"
    const monthsMatch = lowerDesc.match(/(\d+)\s*个?月\s*(后|前)/);
    if (monthsMatch) {
      const months = parseInt(monthsMatch[1]);
      const direction = monthsMatch[2] === '后' ? 1 : -1;
      return calculateDate(base, { months: months * direction });
    }
    
    // "下周" / "下个月" / "明年"
    if (lowerDesc.includes('下周') || lowerDesc === 'next week') {
      return calculateDate(base, { weeks: 1 });
    }
    if (lowerDesc.includes('下个月') || lowerDesc === 'next month') {
      return calculateDate(base, { months: 1 });
    }
    if (lowerDesc.includes('明年') || lowerDesc === 'next year') {
      return calculateDate(base, { years: 1 });
    }
    
    // "下周一" / "下周五" 等
    const nextWeekdayMatch = lowerDesc.match(/下周([一二三四五六日天])/);
    if (nextWeekdayMatch) {
      const weekdayMap: Record<string, number> = {
        '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0
      };
      const targetWeekday = weekdayMap[nextWeekdayMatch[1]];
      const currentWeekday = base.getDay();
      
      // 计算到下周目标星期几需要的天数
      let daysToAdd = (7 - currentWeekday + targetWeekday) % 7;
      if (daysToAdd === 0) daysToAdd = 7; // 如果是同一天，跳到下周
      daysToAdd += 7; // 确保是"下周"
      
      return calculateDate(base, { days: daysToAdd });
    }
    
    return null;
  } catch (error) {
    console.error('解析自然语言日期失败:', error);
    return null;
  }
}

/**
 * 计算两个日期之间的天数差
 * 
 * @param date1 - 日期1
 * @param date2 - 日期2
 * @returns 天数差（date2 - date1）
 */
export function daysBetween(date1: string | Date, date2: string | Date): number {
  const d1 = typeof date1 === 'string' ? new Date(date1) : date1;
  const d2 = typeof date2 === 'string' ? new Date(date2) : date2;
  
  const diffMs = d2.getTime() - d1.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

/**
 * 判断是否是工作日（周一到周五）
 * 
 * @param date - 日期
 * @returns 是否是工作日
 */
export function isWeekday(date: string | Date): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  const day = d.getDay();
  return day >= 1 && day <= 5;
}

/**
 * 计算N个工作日后的日期
 * 
 * @param baseDate - 基准日期
 * @param workdays - 工作日数量
 * @returns 计算后的日期
 */
export function addWorkdays(
  baseDate: string | Date,
  workdays: number
): CalculatedDate {
  const base = typeof baseDate === 'string' ? new Date(baseDate) : baseDate;
  const result = new Date(base);
  
  let daysAdded = 0;
  let workdaysAdded = 0;
  
  while (workdaysAdded < workdays) {
    daysAdded++;
    result.setDate(result.getDate() + 1);
    
    if (isWeekday(result)) {
      workdaysAdded++;
    }
  }
  
  const weekdayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'long' });
  const weekday = weekdayFormatter.format(result);
  const resultDate = result.toISOString().split('T')[0];
  
  return {
    result_date: resultDate,
    weekday,
    iso_string: result.toISOString(),
    timestamp: result.getTime(),
  };
}

/**
 * 格式化日期为中文
 * 
 * @param date - 日期
 * @returns 中文格式，如 "2025年12月4日 星期三"
 */
export function formatDateChinese(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  
  const weekdayMap = ['日', '一', '二', '三', '四', '五', '六'];
  const weekday = weekdayMap[d.getDay()];
  
  return `${year}年${month}月${day}日 星期${weekday}`;
}

/**
 * 格式化时间段（相对时间）
 * 
 * @param date - 日期
 * @param baseDate - 基准日期（默认当前时间）
 * @returns 相对时间描述，如 "3天后"、"2周前"
 */
export function formatRelativeTime(date: string | Date, baseDate?: Date): string {
  const target = typeof date === 'string' ? new Date(date) : date;
  const base = baseDate || new Date();
  
  const diffMs = target.getTime() - base.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '明天';
  if (diffDays === -1) return '昨天';
  if (diffDays === 2) return '后天';
  
  if (diffDays > 0) {
    if (diffDays < 7) return `${diffDays}天后`;
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks}周后`;
    }
    if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return `${months}个月后`;
    }
    const years = Math.floor(diffDays / 365);
    return `${years}年后`;
  } else {
    const absDays = Math.abs(diffDays);
    if (absDays < 7) return `${absDays}天前`;
    if (absDays < 30) {
      const weeks = Math.floor(absDays / 7);
      return `${weeks}周前`;
    }
    if (absDays < 365) {
      const months = Math.floor(absDays / 30);
      return `${months}个月前`;
    }
    const years = Math.floor(absDays / 365);
    return `${years}年前`;
  }
}

