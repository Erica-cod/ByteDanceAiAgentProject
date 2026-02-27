/**
 * Markdown 容错处理工具
 * 
 * 功能：
 * 1. 检测并修复不完整的 Markdown 标记
 * 2. 处理流式传输时的格式截断问题
 * 3. 作为 react-markdown 的补充容错机制
 */

export interface MarkdownFixResult {
  /** 修复后的内容 */
  fixed: string;
  /** 是否发现需要修复的问题 */
  hasIssues: boolean;
  /** 检测到的问题列表 */
  issues: string[];
}

/**
 * 修复不完整的 Markdown 格式
 * 
 * 处理的情况：
 * 1. 未闭合的代码块（```）
 * 2. 未闭合的表格
 * 3. 未闭合的 HTML 标签
 * 4. 不完整的链接和图片标记
 */
export function fixIncompleteMarkdown(content: string): MarkdownFixResult {
  const issues: string[] = [];
  let fixed = content;

  // 1. 检测并修复未闭合的代码块
  const codeBlockFix = fixIncompleteCodeBlocks(fixed);
  if (codeBlockFix.hasIssues) {
    fixed = codeBlockFix.fixed;
    issues.push(...codeBlockFix.issues);
  }

  // 2. 检测并修复未闭合的 HTML 标签
  const htmlTagFix = fixIncompleteHtmlTags(fixed);
  if (htmlTagFix.hasIssues) {
    fixed = htmlTagFix.fixed;
    issues.push(...htmlTagFix.issues);
  }

  // 3. 检测并修复不完整的链接和图片
  const linkFix = fixIncompleteLinks(fixed);
  if (linkFix.hasIssues) {
    fixed = linkFix.fixed;
    issues.push(...linkFix.issues);
  }

  // 4. 修复不完整的表格
  const tableFix = fixIncompleteTables(fixed);
  if (tableFix.hasIssues) {
    fixed = tableFix.fixed;
    issues.push(...tableFix.issues);
  }

  return {
    fixed,
    hasIssues: issues.length > 0,
    issues,
  };
}

/**
 * 修复未闭合的代码块
 * 
 * 示例：
 * ```python
 * def hello():
 *     print("world")
 * # 缺少结尾的 ```
 */
function fixIncompleteCodeBlocks(content: string): MarkdownFixResult {
  const issues: string[] = [];
  let fixed = content;

  // 计算代码块标记的数量
  const codeBlockRegex = /```/g;
  const matches = content.match(codeBlockRegex);
  const codeBlockCount = matches ? matches.length : 0;

  // 如果代码块标记是奇数个，说明有未闭合的代码块
  if (codeBlockCount % 2 === 1) {
    // 检查最后一个 ``` 的位置
    const lastCodeBlockIndex = content.lastIndexOf('```');
    const afterLastBlock = content.substring(lastCodeBlockIndex + 3);
    
    // 如果后面还有内容，说明是未闭合的代码块
    if (afterLastBlock.trim().length > 0) {
      // 在末尾添加闭合标记
      fixed = content + '\n```';
      issues.push('检测到未闭合的代码块，已自动添加结束标记');
    }
  }

  return {
    fixed,
    hasIssues: issues.length > 0,
    issues,
  };
}

/**
 * 修复未闭合的 HTML 标签
 * 
 * 示例：
 * <div class="container">
 * 内容
 * # 缺少 </div>
 */
function fixIncompleteHtmlTags(content: string): MarkdownFixResult {
  const issues: string[] = [];
  let fixed = content;

  // 匹配所有 HTML 开始标签（排除自闭合标签）
  const openTagRegex = /<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  // 匹配所有 HTML 结束标签
  const closeTagRegex = /<\/([a-zA-Z][a-zA-Z0-9]*)>/g;

  const openTags: string[] = [];
  const closeTags: string[] = [];

  let match;
  while ((match = openTagRegex.exec(content)) !== null) {
    const tagName = match[1].toLowerCase();
    // 排除自闭合标签
    if (!['img', 'br', 'hr', 'input', 'meta', 'link'].includes(tagName)) {
      openTags.push(tagName);
    }
  }

  while ((match = closeTagRegex.exec(content)) !== null) {
    closeTags.push(match[1].toLowerCase());
  }

  // 使用栈来匹配标签
  const stack: string[] = [];
  let pointer = 0;

  for (const tag of openTags) {
    stack.push(tag);
    // 检查是否有对应的闭合标签
    if (pointer < closeTags.length && closeTags[pointer] === tag) {
      stack.pop();
      pointer++;
    }
  }

  // 如果栈中还有标签，说明有未闭合的标签
  if (stack.length > 0) {
    // 按照栈的顺序（后进先出）添加闭合标签
    while (stack.length > 0) {
      const tag = stack.pop()!;
      fixed += `</${tag}>`;
      issues.push(`检测到未闭合的 HTML 标签：<${tag}>，已自动添加闭合标签`);
    }
  }

  return {
    fixed,
    hasIssues: issues.length > 0,
    issues,
  };
}

/**
 * 修复不完整的链接和图片标记
 * 
 * 示例：
 * [链接文本](http://example.com
 * ![图片](http://example.com/image.png
 */
function fixIncompleteLinks(content: string): MarkdownFixResult {
  const issues: string[] = [];
  let fixed = content;

  // 检测不完整的链接：[text]( 但没有闭合的 )
  const incompleteLinkRegex = /\[([^\]]+)\]\(([^)]*?)$/gm;
  
  if (incompleteLinkRegex.test(content)) {
    // 在末尾添加闭合括号
    fixed = content + ')';
    issues.push('检测到不完整的链接标记，已自动添加闭合括号');
  }

  // 检测不完整的图片：![alt]( 但没有闭合的 )
  const incompleteImageRegex = /!\[([^\]]*)\]\(([^)]*?)$/gm;
  
  if (incompleteImageRegex.test(fixed)) {
    fixed = fixed + ')';
    issues.push('检测到不完整的图片标记，已自动添加闭合括号');
  }

  return {
    fixed,
    hasIssues: issues.length > 0,
    issues,
  };
}

/**
 * 修复不完整的表格
 * 
 * 示例：
 * | 列1 | 列2 |
 * |-----|-----|
 * | 内容1 | 
 */
function fixIncompleteTables(content: string): MarkdownFixResult {
  const issues: string[] = [];
  let fixed = content;

  const lines = content.split('\n');
  let inTable = false;
  let tableColumnCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // 检测表格行（以 | 开头或包含 |）
    if (line.startsWith('|') || (line.includes('|') && !inTable)) {
      if (!inTable) {
        // 进入表格模式
        inTable = true;
        // 计算列数
        tableColumnCount = (line.match(/\|/g) || []).length - 1;
      }

      // 检查当前行的列数
      const currentColumnCount = (line.match(/\|/g) || []).length - 1;
      
      // 如果是最后一行且列数不匹配
      if (i === lines.length - 1 && currentColumnCount < tableColumnCount) {
        // 补全缺失的列
        const missingColumns = tableColumnCount - currentColumnCount;
        let fixedLine = line;
        
        // 如果行没有以 | 结尾，先添加
        if (!fixedLine.endsWith('|')) {
          fixedLine += ' |';
        }
        
        // 添加缺失的空列
        for (let j = 0; j < missingColumns; j++) {
          fixedLine = fixedLine.slice(0, -1) + '  |';
        }
        
        lines[i] = fixedLine;
        issues.push(`检测到不完整的表格行，已自动补全 ${missingColumns} 列`);
      }
    } else if (inTable && line === '') {
      // 空行结束表格
      inTable = false;
      tableColumnCount = 0;
    }
  }

  if (issues.length > 0) {
    fixed = lines.join('\n');
  }

  return {
    fixed,
    hasIssues: issues.length > 0,
    issues,
  };
}

/**
 * 检查内容是否可能正在流式传输中
 * 
 * 用于判断是否应该应用容错处理
 */
export function isLikelyStreaming(content: string): boolean {
  if (!content) return false;

  // 检查是否以不完整的标记结尾
  const streamingIndicators = [
    /```[a-z]*$/,             // 代码块开始但没有内容
    /\[$/,                     // 链接或图片的开始 [
    /!\[[^\]]*$/,              // 图片的开始 ![xxx 但没有闭合
    /\[[^\]]+\]\([^)]*$/,      // 链接未完成 [text](url 但没有闭合的 )
    /\|\s*$/,                 // 表格行未完成
    /<[a-z]+[^>]*$/i,         // HTML 标签未完成
  ];

  return streamingIndicators.some(regex => regex.test(content.trim()));
}

/**
 * 检测是否存在严重的格式错误（无法修复，应该降级为纯文本）
 * 
 * 严重错误包括：
 * 1. HTML 标签语法错误（如 <div class="test" 缺少闭合 >）
 * 2. 大量不配对的特殊字符
 * 3. 其他无法通过简单修复恢复的格式错误
 */
export function hasSevereFormatError(content: string): boolean {
  if (!content || content.trim() === '') {
    return false;
  }

  const trimmed = content.trim();
  
  // 1. 检测未闭合的 HTML 标签开始符号（< 后面没有对应的 >）
  // 例如：<div class="test" 或 <span id="
  const unclosedTagStart = /<[a-z]+[^>]*$/i.test(trimmed);
  if (unclosedTagStart) {
    return true;
  }

  // 2. 检测标签开始但语法严重错误（< 后面紧跟着特殊字符或空格）
  // 例如：< div 或 <  或 <@
  const malformedTagStart = /<[\s@#$%^&*()+=\[\]{}|\\;:'",<>?/]/.test(content);
  if (malformedTagStart) {
    return true;
  }

  // 3. 检测大量连续的特殊字符（可能是乱码或严重损坏）
  // 例如：<<<>>> 或 [[[[[[ 或 ]]]]]]
  const tooManySpecialChars = /([<>[\]{}*_~`#])\1{5,}/.test(content);
  if (tooManySpecialChars) {
    return true;
  }

  // 4. 检测严重不平衡的括号（差异超过3）
  const openBrackets = (content.match(/\[/g) || []).length;
  const closeBrackets = (content.match(/\]/g) || []).length;
  const bracketDiff = Math.abs(openBrackets - closeBrackets);
  if (bracketDiff > 3 && (openBrackets > 5 || closeBrackets > 5)) {
    return true;
  }

  return false;
}

/**
 * 安全地修复 Markdown（只在检测到流式传输时应用）
 * 
 * 返回值：
 * - { shouldRenderAsPlainText: true, content } - 应该降级为纯文本
 * - { shouldRenderAsPlainText: false, content } - 可以正常渲染 Markdown
 */
export function safeFixMarkdown(content: string): { 
  shouldRenderAsPlainText: boolean; 
  content: string 
} {
  // 先检测是否有严重错误
  if (hasSevereFormatError(content)) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Markdown Fixer] 检测到严重格式错误，降级为纯文本输出');
    }
    return {
      shouldRenderAsPlainText: true,
      content: content, // 返回原始内容
    };
  }

  // 如果内容看起来不像正在流式传输，直接返回原内容
  if (!isLikelyStreaming(content)) {
    return {
      shouldRenderAsPlainText: false,
      content: content,
    };
  }

  // 应用修复
  const result = fixIncompleteMarkdown(content);
  
  // 输出调试信息（仅在开发环境）
  if (process.env.NODE_ENV === 'development' && result.hasIssues) {
    console.log('[Markdown Fixer] 检测到问题:', result.issues);
  }

  return {
    shouldRenderAsPlainText: false,
    content: result.fixed,
  };
}

