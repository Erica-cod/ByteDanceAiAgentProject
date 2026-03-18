/**
 * 时间工具插件集
 * 
 * 包含 4 个时间相关工具：
 * - get_current_time: 获取当前时间
 * - calculate_date: 日期计算
 * - parse_natural_date: 解析自然语言日期
 * - format_relative_time: 格式化相对时间
 */

import {
  getNow,
  calculateDate,
  parseNaturalDate,
  formatRelativeTime,
  formatDateChinese,
  daysBetween,
  isWeekday,
  addWorkdays,
  type DateOffset,
} from './timeTools.js';
import type { ToolPlugin } from '../core/types.js';

// ============ 获取当前时间工具 ============
export const getCurrentTimePlugin: ToolPlugin = {
  metadata: {
    name: 'get_current_time',
    description: '获取当前日期和时间信息',
    version: '1.0.0',
    author: 'AI Agent Team',
    tags: ['time', 'utility', 'date'],
    enabled: true,
  },

  schema: {
    name: 'get_current_time',
    description: '获取当前的日期、时间、星期等信息。适用于需要知道当前时间或日期的场景。',
    parameters: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description: '时区，如 "Asia/Shanghai", "America/New_York"',
          default: 'Asia/Shanghai',
        },
        format: {
          type: 'string',
          enum: ['iso', 'chinese', 'both'],
          description: '返回格式：iso（ISO 8601）、chinese（中文）、both（两种都返回）',
          default: 'both',
        },
      },
    },
  },

  rateLimit: {
    maxConcurrent: 200,
    maxPerMinute: 2000,
    timeout: 1000, // 1秒足够
  },

  cache: {
    enabled: true,
    ttl: 10, // 缓存10秒（时间变化频繁）
    keyStrategy: 'params',
  },

  circuitBreaker: {
    enabled: false, // 本地计算，不需要熔断
    failureThreshold: 0,
    resetTimeout: 0,
  },

  validate: async (params) => {
    const errors: string[] = [];

    if (params.format && !['iso', 'chinese', 'both'].includes(params.format)) {
      errors.push('format 必须是 "iso"、"chinese" 或 "both"');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  },

  execute: async (params, context) => {
    const { timezone = 'Asia/Shanghai', format = 'both' } = params;

    try {
      console.log(`🕐 [GetCurrentTime] 获取当前时间`);
      console.log(`   时区: ${timezone}`);
      console.log(`   格式: ${format}`);

      const timeInfo = getNow(timezone);
      const now = new Date();
      const chineseFormat = formatDateChinese(now);

      let displayText = '';
      if (format === 'iso' || format === 'both') {
        displayText += `📅 ${timeInfo.date} ${timeInfo.weekday}\n⏰ ${timeInfo.time}`;
      }
      if (format === 'both') {
        displayText += `\n中文格式: ${chineseFormat}`;
      }
      if (format === 'chinese') {
        displayText = chineseFormat;
      }

      console.log(`   ✅ 当前时间: ${timeInfo.date} ${timeInfo.time}`);

      return {
        success: true,
        data: {
          ...timeInfo,
          chinese: chineseFormat,
          display: displayText,
        },
        message: `当前时间: ${displayText}`,
      };
    } catch (error: any) {
      console.error(`   ❌ 获取时间失败:`, error);
      return {
        success: false,
        error: error.message || '获取时间失败',
      };
    }
  },

  onInit: async () => {
    console.log('🕐 [GetCurrentTime] 插件已初始化');
  },
};

// ============ 日期计算工具 ============
export const calculateDatePlugin: ToolPlugin = {
  metadata: {
    name: 'calculate_date',
    description: '计算指定日期的偏移日期',
    version: '1.0.0',
    author: 'AI Agent Team',
    tags: ['time', 'utility', 'date', 'calculation'],
    enabled: true,
  },

  schema: {
    name: 'calculate_date',
    description: '根据基准日期和偏移量计算新日期。可以加减年、月、周、日、小时、分钟。',
    parameters: {
      type: 'object',
      properties: {
        base_date: {
          type: 'string',
          description: '基准日期（ISO格式，如 "2025-01-02" 或 "2025-01-02T10:00:00"）。留空则使用当前时间。',
        },
        years: {
          type: 'number',
          description: '年数偏移（正数为未来，负数为过去）',
        },
        months: {
          type: 'number',
          description: '月数偏移',
        },
        weeks: {
          type: 'number',
          description: '周数偏移',
        },
        days: {
          type: 'number',
          description: '天数偏移',
        },
        hours: {
          type: 'number',
          description: '小时偏移',
        },
        minutes: {
          type: 'number',
          description: '分钟偏移',
        },
        workdays: {
          type: 'number',
          description: '工作日偏移（只计算周一到周五）',
        },
      },
    },
  },

  rateLimit: {
    maxConcurrent: 200,
    maxPerMinute: 2000,
    timeout: 1000,
  },

  cache: {
    enabled: true,
    ttl: 300, // 缓存5分钟
    keyStrategy: 'params',
  },

  circuitBreaker: {
    enabled: false,
    failureThreshold: 0,
    resetTimeout: 0,
  },

  validate: async (params) => {
    const errors: string[] = [];

    if (params.base_date) {
      const date = new Date(params.base_date);
      if (isNaN(date.getTime())) {
        errors.push('base_date 格式无效，请使用 ISO 格式（如 "2025-01-02"）');
      }
    }

    // 至少需要一个偏移量
    const hasOffset = ['years', 'months', 'weeks', 'days', 'hours', 'minutes', 'workdays']
      .some(key => params[key] !== undefined);
    
    if (!hasOffset) {
      errors.push('至少需要提供一个偏移量参数（years/months/weeks/days/hours/minutes/workdays）');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  },

  execute: async (params, context) => {
    const {
      base_date,
      years,
      months,
      weeks,
      days,
      hours,
      minutes,
      workdays,
    } = params;

    try {
      const baseDate = base_date ? new Date(base_date) : new Date();
      
      console.log(`📅 [CalculateDate] 计算日期`);
      console.log(`   基准日期: ${baseDate.toISOString().split('T')[0]}`);
      console.log(`   偏移量:`, { years, months, weeks, days, hours, minutes, workdays });

      let result;

      // 如果是工作日计算
      if (workdays !== undefined) {
        result = addWorkdays(baseDate, workdays);
      } else {
        // 普通日期计算
        const offset: DateOffset = {
          years,
          months,
          weeks,
          days,
          hours,
          minutes,
        };
        result = calculateDate(baseDate, offset);
      }

      const chineseFormat = formatDateChinese(result.result_date);
      const relativeTime = formatRelativeTime(result.result_date);
      const isWorkday = isWeekday(result.result_date);

      console.log(`   ✅ 结果: ${result.result_date} (${result.weekday})`);

      return {
        success: true,
        data: {
          ...result,
          chinese: chineseFormat,
          relative: relativeTime,
          is_workday: isWorkday,
        },
        message: `计算结果: ${chineseFormat} (${relativeTime})`,
      };
    } catch (error: any) {
      console.error(`   ❌ 日期计算失败:`, error);
      return {
        success: false,
        error: error.message || '日期计算失败',
      };
    }
  },

  onInit: async () => {
    console.log('📅 [CalculateDate] 插件已初始化');
  },
};

// ============ 自然语言日期解析工具 ============
export const parseNaturalDatePlugin: ToolPlugin = {
  metadata: {
    name: 'parse_natural_date',
    description: '解析自然语言日期描述',
    version: '1.0.0',
    author: 'AI Agent Team',
    tags: ['time', 'utility', 'nlp', 'date'],
    enabled: true,
  },

  schema: {
    name: 'parse_natural_date',
    description: '将自然语言描述（如"明天"、"下周一"、"3天后"）解析为具体日期',
    parameters: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: '自然语言描述，如：今天、明天、后天、昨天、3天后、下周一、下个月等',
        },
        base_date: {
          type: 'string',
          description: '基准日期（可选，默认为当前日期）',
        },
      },
      required: ['description'],
    },
  },

  rateLimit: {
    maxConcurrent: 200,
    maxPerMinute: 2000,
    timeout: 1000,
  },

  cache: {
    enabled: true,
    ttl: 60, // 缓存1分钟
    keyStrategy: 'params',
  },

  circuitBreaker: {
    enabled: false,
    failureThreshold: 0,
    resetTimeout: 0,
  },

  validate: async (params) => {
    const errors: string[] = [];

    if (!params.description || typeof params.description !== 'string') {
      errors.push('description 必须是非空字符串');
    }

    if (params.base_date) {
      const date = new Date(params.base_date);
      if (isNaN(date.getTime())) {
        errors.push('base_date 格式无效');
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  },

  execute: async (params, context) => {
    const { description, base_date } = params;

    try {
      const baseDate = base_date ? new Date(base_date) : undefined;

      console.log(`🗣️  [ParseNaturalDate] 解析自然语言日期`);
      console.log(`   描述: "${description}"`);

      const result = parseNaturalDate(description, baseDate);

      if (!result) {
        console.warn(`   ⚠️  无法解析: "${description}"`);
        return {
          success: false,
          error: `无法解析自然语言描述 "${description}"，支持的格式：今天、明天、后天、N天后、下周、下周一等`,
        };
      }

      const chineseFormat = formatDateChinese(result.result_date);
      const relativeTime = formatRelativeTime(result.result_date);
      const isWorkday = isWeekday(result.result_date);

      console.log(`   ✅ 解析结果: ${result.result_date} (${result.weekday})`);

      return {
        success: true,
        data: {
          ...result,
          chinese: chineseFormat,
          relative: relativeTime,
          is_workday: isWorkday,
          original_description: description,
        },
        message: `"${description}" = ${chineseFormat} (${relativeTime})`,
      };
    } catch (error: any) {
      console.error(`   ❌ 解析失败:`, error);
      return {
        success: false,
        error: error.message || '解析自然语言日期失败',
      };
    }
  },

  onInit: async () => {
    console.log('🗣️  [ParseNaturalDate] 插件已初始化');
  },
};

// ============ 日期比较工具 ============
export const compareDatesPlugin: ToolPlugin = {
  metadata: {
    name: 'compare_dates',
    description: '比较两个日期',
    version: '1.0.0',
    author: 'AI Agent Team',
    tags: ['time', 'utility', 'date', 'comparison'],
    enabled: true,
  },

  schema: {
    name: 'compare_dates',
    description: '计算两个日期之间的天数差、判断日期关系',
    parameters: {
      type: 'object',
      properties: {
        date1: {
          type: 'string',
          description: '第一个日期（ISO格式）',
        },
        date2: {
          type: 'string',
          description: '第二个日期（ISO格式）。留空则使用当前日期。',
        },
      },
      required: ['date1'],
    },
  },

  rateLimit: {
    maxConcurrent: 200,
    maxPerMinute: 2000,
    timeout: 1000,
  },

  cache: {
    enabled: true,
    ttl: 300,
    keyStrategy: 'params',
  },

  circuitBreaker: {
    enabled: false,
    failureThreshold: 0,
    resetTimeout: 0,
  },

  validate: async (params) => {
    const errors: string[] = [];

    if (!params.date1) {
      errors.push('date1 是必需的');
    } else {
      const d1 = new Date(params.date1);
      if (isNaN(d1.getTime())) {
        errors.push('date1 格式无效');
      }
    }

    if (params.date2) {
      const d2 = new Date(params.date2);
      if (isNaN(d2.getTime())) {
        errors.push('date2 格式无效');
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  },

  execute: async (params, context) => {
    const { date1, date2 } = params;

    try {
      const d1 = new Date(date1);
      const d2 = date2 ? new Date(date2) : new Date();

      console.log(`📊 [CompareDates] 比较日期`);
      console.log(`   日期1: ${d1.toISOString().split('T')[0]}`);
      console.log(`   日期2: ${d2.toISOString().split('T')[0]}`);

      const daysDiff = daysBetween(d1, d2);
      const absDays = Math.abs(daysDiff);
      
      let comparison: string;
      if (daysDiff > 0) {
        comparison = `date2 在 date1 之后 ${daysDiff} 天`;
      } else if (daysDiff < 0) {
        comparison = `date2 在 date1 之前 ${absDays} 天`;
      } else {
        comparison = '两个日期相同';
      }

      const weeks = Math.floor(absDays / 7);
      const months = Math.floor(absDays / 30);

      console.log(`   ✅ 相差 ${absDays} 天`);

      return {
        success: true,
        data: {
          date1: d1.toISOString().split('T')[0],
          date2: d2.toISOString().split('T')[0],
          days_between: daysDiff,
          abs_days: absDays,
          weeks: weeks,
          months: months,
          comparison,
        },
        message: `${comparison}（约 ${weeks} 周或 ${months} 个月）`,
      };
    } catch (error: any) {
      console.error(`   ❌ 日期比较失败:`, error);
      return {
        success: false,
        error: error.message || '日期比较失败',
      };
    }
  },

  onInit: async () => {
    console.log('📊 [CompareDates] 插件已初始化');
  },
};

