import { useEffect, useRef, useState } from 'react';
import { isLongText } from '../../utils/text/textUtils';

interface WorkerMessage {
  id: number;
  detection: ReturnType<typeof isLongText>;
}

const WORKER_TEXT_THRESHOLD = 2000;
const WORKER_DEBOUNCE_MS = 120;

export function useLongTextDetection(text: string) {
  const [detection, setDetection] = useState<ReturnType<typeof isLongText>>(() => isLongText(text));
  const [isComputing, setIsComputing] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const seqRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setDetection(isLongText(text));
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (!text) {
      setIsComputing(false);
      setDetection(isLongText(''));
      return;
    }

    // 小文本直接同步计算，减少 worker 通信开销
    if (text.length < WORKER_TEXT_THRESHOLD || typeof Worker === 'undefined') {
      setIsComputing(false);
      setDetection(isLongText(text));
      return;
    }

    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL('../../workers/textStats.worker.ts', import.meta.url),
        { type: 'module' }
      );
    }

    const activeWorker = workerRef.current;
    const currentSeq = ++seqRef.current;

    const handleMessage = (event: MessageEvent<WorkerMessage>) => {
      if (event.data.id !== currentSeq) return;
      setDetection(event.data.detection);
      setIsComputing(false);
    };

    const handleError = () => {
      if (seqRef.current !== currentSeq) return;
      setDetection(isLongText(text));
      setIsComputing(false);
    };

    activeWorker.addEventListener('message', handleMessage);
    activeWorker.addEventListener('error', handleError);
    setIsComputing(true);

    debounceTimerRef.current = setTimeout(() => {
      activeWorker.postMessage({ id: currentSeq, text });
    }, WORKER_DEBOUNCE_MS);

    return () => {
      activeWorker.removeEventListener('message', handleMessage);
      activeWorker.removeEventListener('error', handleError);
    };
  }, [text]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  return { detection, isComputing };
}

