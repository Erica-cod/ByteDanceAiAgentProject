/**
 * Markdown 内容中的 JSON metadata 过滤
 *
 * 从 StreamingMarkdown 中提取，以便 Worker 线程复用。
 */

export function removeJSONFromContent(content: string): string {
  const trimmedContent = content.trim();

  if (trimmedContent.startsWith('{')) {
    const lines = content.split('\n');
    let jsonEndLineIndex = -1;
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (escapeNext) { escapeNext = false; continue; }
        if (char === '\\') { escapeNext = true; continue; }
        if (char === '"') { inString = !inString; continue; }

        if (!inString) {
          if (char === '{') braceCount++;
          if (char === '}') {
            braceCount--;
            if (braceCount === 0) { jsonEndLineIndex = lineIdx; break; }
          }
        }
      }
      if (jsonEndLineIndex !== -1) break;
    }

    if (jsonEndLineIndex !== -1 && jsonEndLineIndex < lines.length - 1) {
      return lines.slice(jsonEndLineIndex + 1).join('\n').trim();
    }

    return '';
  }

  const startIndex = trimmedContent.indexOf('{');
  if (startIndex === -1) return content;

  let braceCount = 0;
  let jsonEndIndex = -1;
  let inString = false;
  let escapeNext = false;

  for (let i = startIndex; i < trimmedContent.length; i++) {
    const char = trimmedContent[i];

    if (escapeNext) { escapeNext = false; continue; }
    if (char === '\\') { escapeNext = true; continue; }
    if (char === '"') { inString = !inString; continue; }

    if (!inString) {
      if (char === '{') braceCount++;
      if (char === '}') {
        braceCount--;
        if (braceCount === 0) { jsonEndIndex = i + 1; break; }
      }
    }
  }

  if (jsonEndIndex !== -1) {
    return (trimmedContent.substring(0, startIndex) + trimmedContent.substring(jsonEndIndex)).trim();
  }

  return content;
}
