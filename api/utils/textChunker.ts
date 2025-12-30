/**
 * 文本切分工具
 * 用于将超长文本智能切分成多个 chunk，适合计划文本/清单/分点内容
 */

export interface ChunkOptions {
  targetChunkSize?: number;    // 目标 chunk 大小（字符数），默认 6000
  maxChunkSize?: number;        // 最大 chunk 大小（字符数），默认 8000
  overlapSize?: number;         // 重叠大小（字符数），默认 300
  maxChunks?: number;           // 最大 chunk 数量，默认 30
}

export interface TextChunk {
  index: number;                // chunk 索引（从 0 开始）
  content: string;              // chunk 内容
  startChar: number;            // 在原文中的起始字符位置
  endChar: number;              // 在原文中的结束字符位置
  hasOverlap: boolean;          // 是否包含重叠内容
}

/**
 * 默认配置
 */
const DEFAULT_OPTIONS: Required<ChunkOptions> = {
  targetChunkSize: 6000,
  maxChunkSize: 8000,
  overlapSize: 300,
  maxChunks: 30,
};

/**
 * 智能切分文本
 * 
 * 策略：
 * 1. 按空行/标题分割（识别 Markdown 标题、列表、数字序号等）
 * 2. 将段落拼装成 chunk，直到接近目标大小
 * 3. 单段超长则按句号/分号/换行硬切
 * 4. 添加 overlap（每个 chunk 末尾的一部分拼到下一个 chunk 开头）
 */
export function splitTextIntoChunks(text: string, options: ChunkOptions = {}): TextChunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // 1. 预处理：统一换行符
  const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // 2. 按结构化分隔符切分段落
  const paragraphs = splitIntoParagraphs(normalizedText);
  
  console.log(`📄 [TextChunker] 原文 ${normalizedText.length} 字符，切分为 ${paragraphs.length} 个段落`);
  
  // 3. 组装 chunks
  const chunks: TextChunk[] = [];
  let currentChunk: string[] = [];
  let currentSize = 0;
  let currentStartChar = 0;
  
  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const paraSize = para.length;
    
    // 如果单个段落就超过最大大小，需要硬切
    if (paraSize > opts.maxChunkSize) {
      // 先保存当前 chunk（如果有内容）
      if (currentChunk.length > 0) {
        chunks.push(createChunk(currentChunk, chunks.length, currentStartChar, false));
        currentChunk = [];
        currentSize = 0;
        currentStartChar += currentChunk.join('\n\n').length + 2; // +2 for \n\n
      }
      
      // 硬切超长段落
      const subChunks = hardSplitParagraph(para, opts.maxChunkSize);
      for (const subChunk of subChunks) {
        chunks.push({
          index: chunks.length,
          content: subChunk,
          startChar: currentStartChar,
          endChar: currentStartChar + subChunk.length,
          hasOverlap: false,
        });
        currentStartChar += subChunk.length;
      }
      continue;
    }
    
    // 如果加上当前段落会超过目标大小，保存当前 chunk
    if (currentSize + paraSize > opts.targetChunkSize && currentChunk.length > 0) {
      chunks.push(createChunk(currentChunk, chunks.length, currentStartChar, false));
      
      // 准备下一个 chunk，添加 overlap
      const overlapContent = getOverlapContent(currentChunk, opts.overlapSize);
      currentChunk = overlapContent ? [overlapContent] : [];
      currentSize = overlapContent ? overlapContent.length : 0;
      currentStartChar += currentChunk.join('\n\n').length;
    }
    
    // 添加当前段落
    currentChunk.push(para);
    currentSize += paraSize;
    
    // 检查是否达到最大 chunk 数量
    if (chunks.length >= opts.maxChunks - 1) {
      // 将剩余所有段落合并到最后一个 chunk
      const remaining = paragraphs.slice(i + 1);
      currentChunk.push(...remaining);
      break;
    }
  }
  
  // 保存最后一个 chunk
  if (currentChunk.length > 0) {
    chunks.push(createChunk(currentChunk, chunks.length, currentStartChar, false));
  }
  
  console.log(`✅ [TextChunker] 生成 ${chunks.length} 个 chunks`);
  
  return chunks;
}

/**
 * 按结构化分隔符切分段落
 * 识别：空行、Markdown 标题、列表、数字序号等
 */
function splitIntoParagraphs(text: string): string[] {
  const paragraphs: string[] = [];
  
  // 按双换行符分割（空行）
  const blocks = text.split(/\n\n+/);
  
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    
    // 检查是否是列表或多行结构
    const lines = trimmed.split('\n');
    
    // 如果是列表项（每行都以 -、*、数字. 开头），保持在一起
    const isListBlock = lines.every(line => 
      /^[\s]*[-*•]\s/.test(line) || 
      /^[\s]*\d+\.\s/.test(line) ||
      /^[\s]*[a-zA-Z]\.\s/.test(line)
    );
    
    if (isListBlock) {
      paragraphs.push(trimmed);
    } else {
      // 否则，按单换行符进一步分割
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine) {
          paragraphs.push(trimmedLine);
        }
      }
    }
  }
  
  return paragraphs;
}

/**
 * 硬切超长段落（按句号、分号、换行）
 */
function hardSplitParagraph(para: string, maxSize: number): string[] {
  const chunks: string[] = [];
  let current = '';
  
  // 按句子分割
  const sentences = para.split(/([。！？；.!?;])/);
  
  for (let i = 0; i < sentences.length; i++) {
    const part = sentences[i];
    
    if (current.length + part.length > maxSize) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      
      // 如果单个句子就超长，按字符硬切
      if (part.length > maxSize) {
        for (let j = 0; j < part.length; j += maxSize) {
          chunks.push(part.slice(j, j + maxSize));
        }
      } else {
        current = part;
      }
    } else {
      current += part;
    }
  }
  
  if (current) {
    chunks.push(current);
  }
  
  return chunks;
}

/**
 * 获取 overlap 内容（从当前 chunk 末尾提取）
 */
function getOverlapContent(paragraphs: string[], overlapSize: number): string | null {
  if (paragraphs.length === 0) return null;
  
  const fullContent = paragraphs.join('\n\n');
  if (fullContent.length <= overlapSize) {
    return fullContent;
  }
  
  // 从末尾提取 overlapSize 字符
  return fullContent.slice(-overlapSize);
}

/**
 * 创建 chunk 对象
 */
function createChunk(
  paragraphs: string[], 
  index: number, 
  startChar: number,
  hasOverlap: boolean
): TextChunk {
  const content = paragraphs.join('\n\n');
  return {
    index,
    content,
    startChar,
    endChar: startChar + content.length,
    hasOverlap,
  };
}

/**
 * 估算文本的 token 数（粗略）
 */
export function estimateTokens(text: string): number {
  // 简单估算：中文 1 字 ≈ 1.5 token，英文 1 词 ≈ 1.3 token
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const words = text.trim().split(/\s+/).length;
  
  return Math.round(Math.max(
    chineseChars * 1.5,
    words * 1.3,
    text.length / 4
  ));
}

