/**
 * 统一的 JSON 提取工具模块
 * 用于从 AI 回复中提取结构化 JSON（支持多种格式容错）
 * 
 * 修复策略：
 * 1. 先尝试 jsonrepair 包（成熟的第三方库）
 * 2. 失败后使用自定义修复逻辑（备用方案）
 */

import { jsonrepair } from 'jsonrepair';

/**
 * 提取选项
 */
export interface ExtractOptions {
  /** 是否启用自动修复（默认 true） */
  autoFix?: boolean;
  /** 调试日志前缀（用于追踪调用来源） */
  logPrefix?: string;
  /** 允许的标签名（如 'tool_call', 'json', 'plan'） */
  tagName?: string;
  /** 是否启用指标日志（默认 true） */
  enableMetrics?: boolean;
  /** 调用来源标识（用于聚合统计） */
  source?: string;
}

/**
 * 提取结果（用于需要剩余文本的场景）
 */
export interface ExtractResult<T = any> {
  /** 提取出的 JSON 对象 */
  data: T;
  /** 去除提取部分后的剩余文本 */
  remainingText: string;
}

type RepairStage = 'raw' | 'jsonrepair' | 'custom' | 'none';

interface JSONExtractorMetricsEvent {
  event: 'json_extraction';
  source: string;
  success: boolean;
  autoFix: boolean;
  durationMs: number;
  strategy?: string;
  stage: RepairStage;
  rawParseAttempts: number;
  rawParseSuccess: number;
  jsonrepairAttempts: number;
  jsonrepairSuccess: number;
  customFixAttempts: number;
  customFixSuccess: number;
  finalError?: string;
}

function emitJSONExtractorMetrics(
  options: ExtractOptions,
  payload: JSONExtractorMetricsEvent
): void {
  if (options.enableMetrics === false) {
    return;
  }

  console.info(`[JSONExtractorMetrics] ${JSON.stringify(payload)}`);
}

/**
 * 核心方法：从文本中提取 JSON（多策略容错）
 * 
 * @example
 * // 从 Markdown 代码块提取
 * extractJSON('```json\n{"key":"value"}\n```')
 * 
 * // 从 XML 标签提取
 * extractJSON('<tool_call>{"name":"search"}</tool_call>')
 * 
 * // 从裸 JSON 提取
 * extractJSON('一些文字 {"result": true} 其他内容')
 */
export function extractJSON<T = any>(
  text: string,
  options: ExtractOptions = {}
): T | null {
  const { autoFix = true, logPrefix = '🔍 [JSONExtractor]' } = options;
  const startTime = Date.now();
  const source = options.source ?? 'unknown';
  const metrics = {
    rawParseAttempts: 0,
    rawParseSuccess: 0,
    jsonrepairAttempts: 0,
    jsonrepairSuccess: 0,
    customFixAttempts: 0,
    customFixSuccess: 0,
  };

  const emitSuccessMetrics = (strategy: string, stage: RepairStage) => {
    emitJSONExtractorMetrics(options, {
      event: 'json_extraction',
      source,
      success: true,
      autoFix,
      durationMs: Date.now() - startTime,
      strategy,
      stage,
      ...metrics,
    });
  };

  const emitFailureMetrics = (finalError?: string) => {
    emitJSONExtractorMetrics(options, {
      event: 'json_extraction',
      source,
      success: false,
      autoFix,
      durationMs: Date.now() - startTime,
      stage: 'none',
      ...metrics,
      finalError,
    });
  };
  
  console.log(`${logPrefix} 开始提取 JSON...`);
  console.log(`${logPrefix} 文本长度: ${text.length} 字符`);
  
  // 策略列表（按优先级依次尝试）
  const strategies = [
    // 策略 1: 匹配 ```json ... ``` Markdown 代码块
    {
      name: '```json代码块',
      fn: () => {
        const regex = /```json\s*([\s\S]*?)\s*```/;
        const match = text.match(regex);
        if (match) {
          console.log(`${logPrefix} ✓ 策略1: 找到 \`\`\`json 代码块`);
          return match[1].trim();
        }
        return null;
      }
    },
    
    // 策略 2: 匹配 ``` ... ``` 代码块（可能忘记写 json 标记）
    {
      name: '```代码块（无json标记）',
      fn: () => {
        const regex = /```\s*([\s\S]*?)\s*```/;
        const match = text.match(regex);
        if (match && match[1].trim().startsWith('{')) {
          console.log(`${logPrefix} ✓ 策略2: 找到 \`\`\` 代码块（无json标记）`);
          return match[1].trim();
        }
        return null;
      }
    },
    
    // 策略 3: 匹配 <tag> ... </tag> XML 风格标签（如 <tool_call>, <json>, <plan>）
    {
      name: 'XML标签',
      fn: () => {
        // 尝试多种常见标签
        const tags = options.tagName 
          ? [options.tagName] 
          : ['tool_call', 'json', 'plan', 'result'];
        
        for (const tag of tags) {
          const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
          const match = text.match(regex);
          if (match) {
            console.log(`${logPrefix} ✓ 策略3: 找到 <${tag}> 标签`);
            return match[1].trim();
          }
        }
        return null;
      }
    },
    
    // 策略 4: 匹配未闭合的 <tag> 标签（流式输出场景）
    {
      name: '未闭合XML标签',
      fn: () => {
        const tags = options.tagName 
          ? [options.tagName] 
          : ['tool_call', 'json', 'plan'];
        
        for (const tag of tags) {
          const regex = new RegExp(`<${tag}>([\\s\\S]+)$`, 'i');
          const match = text.match(regex);
          if (match && !text.includes(`</${tag}>`)) {
            console.log(`${logPrefix} ⚠️  策略4: 找到未闭合的 <${tag}> 标签（可能还在流式输出）`);
            return match[1].trim();
          }
        }
        return null;
      }
    },
    
    // 策略 5: 直接提取 JSON 对象（通过括号匹配）
    {
      name: '直接提取JSON对象',
      fn: () => {
        const startIndex = text.indexOf('{');
        if (startIndex === -1) return null;
        
        let braceCount = 0;
        let jsonEndIndex = -1;
        let inString = false;
        let escapeNext = false;
        
        for (let i = startIndex; i < text.length; i++) {
          const char = text[i];
          
          if (escapeNext) {
            escapeNext = false;
            continue;
          }
          
          if (char === '\\') {
            escapeNext = true;
            continue;
          }
          
          if (char === '"') {
            inString = !inString;
            continue;
          }
          
          if (!inString) {
            if (char === '{') braceCount++;
            if (char === '}') {
              braceCount--;
              if (braceCount === 0) {
                jsonEndIndex = i + 1;
                break;
              }
            }
          }
        }
        
        if (jsonEndIndex !== -1) {
          console.log(`${logPrefix} ✓ 策略5: 直接提取 JSON 对象 (${jsonEndIndex - startIndex} 字符)`);
          return text.substring(startIndex, jsonEndIndex);
        }
        return null;
      }
    }
  ];
  
  // 依次尝试每个策略
  for (const strategy of strategies) {
    try {
      const jsonStr = strategy.fn();
      if (!jsonStr) continue;
      
      console.log(`${logPrefix} 📝 提取的 JSON 长度: ${jsonStr.length} 字符`);
      console.log(`${logPrefix} 📝 JSON 预览: ${jsonStr.substring(0, 100)}...`);
      
      // 尝试直接解析
      try {
        metrics.rawParseAttempts += 1;
        const result = JSON.parse(jsonStr);
        metrics.rawParseSuccess += 1;
        console.log(`${logPrefix} ✅ JSON 解析成功（策略: ${strategy.name}）`);
        emitSuccessMetrics(strategy.name, 'raw');
        return result;
      } catch (parseError: any) {
        // 如果失败且启用自动修复，尝试修复后再解析
        if (autoFix) {
          console.warn(`${logPrefix} ⚠️  JSON 解析失败: ${parseError.message}`);
          console.warn(`${logPrefix} 尝试自动修复...`);
          
          // 🔧 修复策略 1: 使用 jsonrepair 包（成熟的第三方库）
          try {
            metrics.jsonrepairAttempts += 1;
            const repairedJsonStr = jsonrepair(jsonStr);
            const result = JSON.parse(repairedJsonStr);
            metrics.jsonrepairSuccess += 1;
            console.log(`${logPrefix} ✅ JSON 修复成功（使用 jsonrepair 包，策略: ${strategy.name}）`);
            emitSuccessMetrics(strategy.name, 'jsonrepair');
            return result;
          } catch (repairError: any) {
            console.warn(`${logPrefix} ⚠️  jsonrepair 包修复失败: ${repairError.message}`);
            
            // 🔧 修复策略 2: 使用自定义修复逻辑（备用方案）
            try {
              metrics.customFixAttempts += 1;
              const fixedJsonStr = fixCommonJSONErrors(jsonStr);
              
              if (fixedJsonStr !== jsonStr) {
                console.log(`${logPrefix} 🔧 已应用自定义修复，修复后长度: ${fixedJsonStr.length}`);
              }
              
              const result = JSON.parse(fixedJsonStr);
              metrics.customFixSuccess += 1;
              console.log(`${logPrefix} ✅ JSON 修复成功（使用自定义逻辑，策略: ${strategy.name}）`);
              emitSuccessMetrics(strategy.name, 'custom');
              return result;
            } catch (fixError: any) {
              console.warn(`${logPrefix} ❌ 自定义修复也失败: ${fixError.message}`);
              // 继续尝试下一个策略
            }
          }
        }
      }
    } catch (error: any) {
      console.warn(`${logPrefix} ⚠️  策略 ${strategy.name} 执行失败: ${error.message}`);
    }
  }
  
  console.error(`${logPrefix} ❌ 所有策略均失败，无法提取 JSON`);
  emitFailureMetrics('all_strategies_failed');
  return null;
}

/**
 * 从文本中提取 JSON 并返回剩余文本（用于流式场景）
 * 
 * @example
 * const result = extractJSONWithRemainder(
 *   '这是一些说明文字 <tool_call>{"name":"search"}</tool_call> 后续内容'
 * );
 * // result.data = { name: 'search' }
 * // result.remainingText = '这是一些说明文字  后续内容'
 */
export function extractJSONWithRemainder<T = any>(
  text: string,
  options: ExtractOptions = {}
): ExtractResult<T> | null {
  const { tagName = 'tool_call' } = options;
  const startTime = Date.now();
  const source = options.source ?? 'unknown';
  const autoFix = options.autoFix !== false;
  const metrics = {
    rawParseAttempts: 0,
    rawParseSuccess: 0,
    jsonrepairAttempts: 0,
    jsonrepairSuccess: 0,
    customFixAttempts: 0,
    customFixSuccess: 0,
  };

  const emitMetrics = (success: boolean, stage: RepairStage, strategy?: string, finalError?: string) => {
    emitJSONExtractorMetrics(options, {
      event: 'json_extraction',
      source,
      success,
      autoFix,
      durationMs: Date.now() - startTime,
      strategy,
      stage,
      ...metrics,
      finalError,
    });
  };
  
  // 优先匹配完整的闭合标签
  const closedTagRegex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const closedMatch = text.match(closedTagRegex);
  
  if (closedMatch) {
    try {
      const jsonStr = closedMatch[1].trim();
      metrics.rawParseAttempts += 1;
      const data = JSON.parse(jsonStr);
      metrics.rawParseSuccess += 1;
      const remainingText = text.replace(closedTagRegex, '').trim();
      
      console.log(`🔍 [extractJSONWithRemainder] 找到完整的 <${tagName}> 标签`);
      emitMetrics(true, 'raw', 'closed_tag');
      return { data, remainingText };
    } catch (error: any) {
      // 尝试修复
      if (options.autoFix !== false) {
        // 先尝试 jsonrepair 包
        try {
          metrics.jsonrepairAttempts += 1;
          const repairedJsonStr = jsonrepair(closedMatch[1].trim());
          const data = JSON.parse(repairedJsonStr);
          metrics.jsonrepairSuccess += 1;
          const remainingText = text.replace(closedTagRegex, '').trim();
          console.log(`🔍 [extractJSONWithRemainder] JSON 修复成功（jsonrepair）`);
          emitMetrics(true, 'jsonrepair', 'closed_tag');
          return { data, remainingText };
        } catch {
          // 备用：自定义修复
          try {
            metrics.customFixAttempts += 1;
            const fixedJsonStr = fixCommonJSONErrors(closedMatch[1].trim());
            const data = JSON.parse(fixedJsonStr);
            metrics.customFixSuccess += 1;
            const remainingText = text.replace(closedTagRegex, '').trim();
            console.log(`🔍 [extractJSONWithRemainder] JSON 修复成功（自定义）`);
            emitMetrics(true, 'custom', 'closed_tag');
            return { data, remainingText };
          } catch {}
        }
      }
    }
  }
  
  // 尝试匹配未闭合标签（流式场景）
  const openTagRegex = new RegExp(`<${tagName}>([\\s\\S]+)$`, 'i');
  const openMatch = text.match(openTagRegex);
  
  if (openMatch && !text.includes(`</${tagName}>`)) {
    try {
      const jsonStr = openMatch[1].trim();
      metrics.rawParseAttempts += 1;
      const data = JSON.parse(jsonStr);
      metrics.rawParseSuccess += 1;
      const remainingText = text.substring(0, openMatch.index).trim();
      
      console.log(`🔍 [extractJSONWithRemainder] 找到未闭合的 <${tagName}> 标签（可能还在流式输出）`);
      emitMetrics(true, 'raw', 'open_tag');
      return { data, remainingText };
    } catch (error: any) {
      console.warn(`⚠️  [extractJSONWithRemainder] 未闭合标签 JSON 解析失败: ${error.message}`);
    }
  }
  
  // 如果标签模式失败，回退到通用提取
  const data = extractJSON<T>(text, options);
  if (data) {
    return { data, remainingText: text };
  }
  
  return null;
}

/**
 * 快捷方法：提取 <tool_call> 标签中的 JSON
 * 
 * @example
 * const toolCall = extractToolCall('<tool_call>{"name":"search","args":{}}</tool_call>');
 * // toolCall = { name: 'search', args: {} }
 */
export function extractToolCall<T = any>(text: string, autoFix = true): T | null {
  return extractJSON<T>(text, { 
    tagName: 'tool_call', 
    autoFix,
    logPrefix: '🔧 [ToolCallExtractor]'
  });
}

/**
 * 快捷方法：提取工具调用并返回剩余文本
 */
export function extractToolCallWithRemainder<T = any>(
  text: string, 
  autoFix = true
): ExtractResult<T> | null {
  return extractJSONWithRemainder<T>(text, { 
    tagName: 'tool_call', 
    autoFix,
    logPrefix: '🔧 [ToolCallExtractor]'
  });
}

/**
 * 修复常见的 JSON 格式错误（自定义逻辑，作为 jsonrepair 的备用方案）
 * 
 * ⚠️  注意：此函数作为备用方案，优先使用 jsonrepair 包
 * 
 * 修复内容：
 * - 移除 BOM 和零宽字符
 * - 移除单行/多行注释
 * - 修复尾随逗号
 * - 修复未闭合的字符串
 * - 修复未闭合的对象/数组
 * - 转义未转义的引号
 * 
 * （从 baseAgent.ts 迁移而来，保留原有逻辑）
 */
export function fixCommonJSONErrors(jsonStr: string): string {
  let fixed = jsonStr;
  
  // 1. 移除 BOM 和零宽字符
  fixed = fixed.replace(/^\uFEFF/, '');
  fixed = fixed.replace(/[\u200B-\u200D\uFEFF]/g, '');
  
  // 2. 修复常见的尾随逗号问题
  fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
  
  // 3. 修复属性名没有引号的情况（简单场景）
  fixed = fixed.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
  
  // 4. 修复单引号（JSON 标准只支持双引号）
  // 注意：这个规则可能误伤字符串内容中的单引号，需要谨慎
  // 这里只处理明显的键值对场景
  fixed = fixed.replace(/'([^']*)'(\s*:\s*)/g, '"$1"$2');
  fixed = fixed.replace(/:\s*'([^']*)'/g, ': "$1"');

  // 4.1 修复缺失 key 结束引号的场景
  // 例：{"suggested_diff_hunk: null, "approve_pr": false}
  // 仅在对象 key 位置修复（前面必须是 { 或 ,）
  fixed = fixed.replace(/([,{]\s*)"([^"\r\n:]+):\s*/g, '$1"$2": ');

  // 4.2 修复双引号成对转义的字符串化 JSON（常见于 C#/批处理风格）
  // 例："{""name"":""Alice""}" -> {"name":"Alice"}
  const trimmed = fixed.trim();
  if (
    trimmed.startsWith('"{') &&
    trimmed.endsWith('}"') &&
    trimmed.includes('""')
  ) {
    fixed = trimmed.slice(1, -1).replace(/""/g, '"');
  }

  // 4.3 修复多个顶层 JSON 粘连
  // 例：{"a":1} {"b":2} 或 {"a":1}{"b":2} -> [{"a":1},{"b":2}]
  fixed = normalizeConcatenatedTopLevelJSON(fixed);
  
  // 5. 修复不平衡的括号/花括号（尝试补全）
  const openBraces = (fixed.match(/{/g) || []).length;
  const closeBraces = (fixed.match(/}/g) || []).length;
  
  if (openBraces > closeBraces) {
    fixed += '}'.repeat(openBraces - closeBraces);
    console.log(`   🔧 补全了 ${openBraces - closeBraces} 个缺失的 '}'`);
  }
  
  const openBrackets = (fixed.match(/\[/g) || []).length;
  const closeBrackets = (fixed.match(/\]/g) || []).length;
  
  if (openBrackets > closeBrackets) {
    fixed += ']'.repeat(openBrackets - closeBrackets);
    console.log(`   🔧 补全了 ${openBrackets - closeBrackets} 个缺失的 ']'`);
  }
  
  // 6. 修复不平衡的引号（简单策略：计数是否为偶数）
  const quotes = (fixed.match(/"/g) || []).length;
  if (quotes % 2 !== 0) {
    console.warn(`   ⚠️  检测到奇数个引号 (${quotes})，尝试在末尾补全`);
    // 找到最后一个未闭合的引号位置，在合理位置补上
    // 这是一个简化策略，不一定总是正确
    fixed += '"';
  }
  
  return fixed;
}

/**
 * 将多个顶层 JSON 片段拼接为合法数组
 * - 只在检测到“多个完整顶层片段”时生效
 * - 保留原有文本，不做语义重写
 */
function normalizeConcatenatedTopLevelJSON(input: string): string {
  const text = input.trim();
  if (!text) return input;

  const topStart = text[0];
  if (topStart !== '{' && topStart !== '[') {
    return input;
  }

  const segments: string[] = [];
  let inString = false;
  let escapeNext = false;
  let objDepth = 0;
  let arrDepth = 0;
  let segmentStart = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{') objDepth++;
    if (char === '}') objDepth--;
    if (char === '[') arrDepth++;
    if (char === ']') arrDepth--;

    if (objDepth === 0 && arrDepth === 0) {
      const piece = text.slice(segmentStart, i + 1).trim();
      if (piece) {
        segments.push(piece);
      }

      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) {
        j++;
      }

      if (j < text.length && (text[j] === '{' || text[j] === '[')) {
        segmentStart = j;
        i = j - 1;
      }
    }
  }

  if (segments.length >= 2) {
    return `[${segments.join(',')}]`;
  }

  return input;
}

/**
 * 验证 JSON 对象是否符合预期的 schema（简单验证）
 * 
 * @example
 * validateJSONSchema({ name: 'search', args: {} }, ['name', 'args'])
 * // 返回 true
 */
export function validateJSONSchema(
  obj: any, 
  requiredFields: string[]
): boolean {
  if (!obj || typeof obj !== 'object') {
    return false;
  }
  
  for (const field of requiredFields) {
    if (!(field in obj)) {
      console.warn(`⚠️  缺少必需字段: ${field}`);
      return false;
    }
  }
  
  return true;
}

