/**
 * 内容提取工具
 * 提取 thinking 内容、工具调用等
 */

/**
 * 提取 thinking 内容（处理 <think> 标签）
 */
export function extractThinkingAndContent(text: string) {
  let thinking = '';
  let content = text;

  // 检查是否有完整的 thinking 标签对
  const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
  const thinkMatches = text.match(thinkRegex);
  
  if (thinkMatches) {
    // 有完整的闭合标签，提取 thinking 内容
    thinking = thinkMatches.map(match => {
      return match.replace(/<\/?think>/g, '').trim();
    }).join('\n\n');
    
    // 移除 thinking 标签，保留纯内容
    content = text.replace(thinkRegex, '').trim();
  } else if (text.includes('<think>')) {
    // 有开始标签但没有结束标签（流式输出中）
    const thinkStartIndex = text.indexOf('<think>');
    const textBeforeThink = text.substring(0, thinkStartIndex).trim();
    
    // 提取 <think> 之后的内容作为实时 thinking
    const thinkingInProgress = text.substring(thinkStartIndex + 7); // 7 是 '<think>' 的长度
    
    // 实时显示思考过程
    thinking = thinkingInProgress.trim() || '正在开始思考...';
    
    // content 显示 <think> 之前的内容
    content = textBeforeThink;
  }

  return { thinking, content };
}
