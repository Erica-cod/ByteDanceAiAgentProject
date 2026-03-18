/**
 * useWorkerMarkdownParse - Worker 线程 Markdown 预处理 Hook
 *
 * 复用 useLongTextDetection 的通信模式：
 * - 短文本主线程同步处理
 * - 长文本投递到 Worker
 * - 序列号去重 + 错误降级
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { safeFixMarkdown } from '@/utils/markdown/markdownFixer';
import { removeJSONFromContent } from '@/utils/markdown/jsonFilter';
import type {
  MarkdownPreprocessRequest,
  MarkdownPreprocessResponse,
} from '@/workers/markdownParse.worker';

const WORKER_THRESHOLD = 2000;

interface PreprocessResult {
  processedText: string;
  shouldRenderAsPlainText: boolean;
}

function syncPreprocess(text: string, isFirstChunk: boolean): PreprocessResult {
  let cleaned = text;
  if (isFirstChunk) {
    cleaned = removeJSONFromContent(text);
  }
  const { content: processedText, shouldRenderAsPlainText } = safeFixMarkdown(cleaned);
  return { processedText, shouldRenderAsPlainText };
}

export function useWorkerMarkdownParse(text: string, isFirstChunk: boolean = false) {
  const [result, setResult] = useState<PreprocessResult>(() => syncPreprocess(text, isFirstChunk));
  const [isProcessing, setIsProcessing] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const seqRef = useRef(0);

  const getWorker = useCallback(() => {
    if (!workerRef.current && typeof Worker !== 'undefined') {
      workerRef.current = new Worker(
        new URL('../../workers/markdownParse.worker.ts', import.meta.url),
        { type: 'module' },
      );
    }
    return workerRef.current;
  }, []);

  useEffect(() => {
    if (!text) {
      setResult({ processedText: '', shouldRenderAsPlainText: false });
      setIsProcessing(false);
      return;
    }

    if (text.length < WORKER_THRESHOLD || typeof Worker === 'undefined') {
      setResult(syncPreprocess(text, isFirstChunk));
      setIsProcessing(false);
      return;
    }

    const worker = getWorker();
    if (!worker) {
      setResult(syncPreprocess(text, isFirstChunk));
      return;
    }

    const currentSeq = ++seqRef.current;

    const handleMessage = (e: MessageEvent<MarkdownPreprocessResponse>) => {
      if (e.data.id !== currentSeq) return;
      setResult({
        processedText: e.data.processedText,
        shouldRenderAsPlainText: e.data.shouldRenderAsPlainText,
      });
      setIsProcessing(false);
    };

    const handleError = () => {
      if (seqRef.current !== currentSeq) return;
      setResult(syncPreprocess(text, isFirstChunk));
      setIsProcessing(false);
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);
    setIsProcessing(true);

    const msg: MarkdownPreprocessRequest = { id: currentSeq, text, isFirstChunk };
    worker.postMessage(msg);

    return () => {
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
    };
  }, [text, isFirstChunk, getWorker]);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  return { ...result, isProcessing };
}
