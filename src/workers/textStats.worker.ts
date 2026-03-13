import { isLongText } from '../utils/text/textUtils';

interface TextStatsWorkerRequest {
  id: number;
  text: string;
}

interface TextStatsWorkerResponse {
  id: number;
  detection: ReturnType<typeof isLongText>;
}

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<TextStatsWorkerRequest>) => void) | null;
  postMessage: (data: TextStatsWorkerResponse) => void;
};

workerScope.onmessage = (event: MessageEvent<TextStatsWorkerRequest>) => {
  const { id, text } = event.data;
  const detection = isLongText(text);
  workerScope.postMessage({ id, detection });
};

