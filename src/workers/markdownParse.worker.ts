/**
 * Markdown 预处理 Worker
 *
 * 在后台线程执行 JSON 过滤 + Markdown 容错修复，
 * 避免大文本字符串处理阻塞主线程。
 *
 * 复用项目已有 Worker 通信模式（序列号去重）。
 */

import { safeFixMarkdown } from '../utils/markdown/markdownFixer';
import { removeJSONFromContent } from '../utils/markdown/jsonFilter';

export interface MarkdownPreprocessRequest {
  id: number;
  text: string;
  isFirstChunk?: boolean;
}

export interface MarkdownPreprocessResponse {
  id: number;
  processedText: string;
  shouldRenderAsPlainText: boolean;
}

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<MarkdownPreprocessRequest>) => void) | null;
  postMessage: (data: MarkdownPreprocessResponse) => void;
};

scope.onmessage = (event: MessageEvent<MarkdownPreprocessRequest>) => {
  const { id, text, isFirstChunk } = event.data;

  let cleaned = text;
  if (isFirstChunk) {
    cleaned = removeJSONFromContent(text);
  }

  const { content: processedText, shouldRenderAsPlainText } = safeFixMarkdown(cleaned);
  scope.postMessage({ id, processedText, shouldRenderAsPlainText });
};
