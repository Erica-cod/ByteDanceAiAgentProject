/**
 * 内容提取工具
 * 从流式文本中提取 thinking 内容（支持自定义 XML 标签名）
 */

/**
 * 提取 thinking 内容
 * @param text 原始文本
 * @param tagName XML 标签名，默认 'think'（即 <think>...</think>）
 */
export function extractThinkingAndContent(text: string, tagName: string = 'think') {
  let thinking = '';
  let content = text;

  const openTag = `<${tagName}>`;
  const closeTag = `</${tagName}>`;

  const thinkRegex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'g');
  const stripRegex = new RegExp(`<\\/?${tagName}>`, 'g');
  const thinkMatches = text.match(thinkRegex);

  if (thinkMatches) {
    thinking = thinkMatches.map(match => {
      return match.replace(stripRegex, '').trim();
    }).join('\n\n');

    content = text.replace(thinkRegex, '').trim();
  } else if (text.includes(openTag)) {
    const thinkStartIndex = text.indexOf(openTag);
    const textBeforeThink = text.substring(0, thinkStartIndex).trim();

    const thinkingInProgress = text.substring(thinkStartIndex + openTag.length);

    thinking = thinkingInProgress.trim() || '正在开始思考...';
    content = textBeforeThink;
  }

  return { thinking, content };
}

