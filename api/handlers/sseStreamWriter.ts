/**
 * SSE 流写入工具
 * 提供 SSE 流的基础写入功能和心跳机制
 */

/**
 * 创建安全的 SSE 写入器
 * 防止在客户端断开后继续写入导致错误
 */
export function createSafeSSEWriter(writer: WritableStreamDefaultWriter, encoder: TextEncoder) {
  let isStreamClosed = false;

  const safeWrite = async (data: string): Promise<boolean> => {
    if (isStreamClosed) {
      return false;
    }

    try {
      await writer.write(encoder.encode(data));
      return true;
    } catch (error: any) {
      if (
        error.name === 'AbortError' ||
        error.code === 'ABORT_ERR' ||
        error.code === 'ERR_STREAM_PREMATURE_CLOSE'
      ) {
        console.log('⚠️  [SSE] 客户端已关闭连接');
        isStreamClosed = true;
        return false;
      }
      throw error;
    }
  };

  const checkClosed = () => isStreamClosed;
  const markClosed = () => {
    isStreamClosed = true;
  };

  return { safeWrite, checkClosed, markClosed };
}

/**
 * 创建 SSE 心跳定时器
 * 用于避免反向代理/负载均衡因"空闲超时"断开连接
 */
export function createHeartbeat(
  safeWrite: (data: string) => Promise<boolean>
): ReturnType<typeof setInterval> {
  const HEARTBEAT_MS = (() => {
    const n = Number.parseInt(String(process.env.SSE_HEARTBEAT_MS ?? ''), 10);
    return Number.isFinite(n) && n > 0 ? n : 15000;
  })();

  return setInterval(() => {
    void safeWrite(`: keep-alive\n\n`);
  }, HEARTBEAT_MS);
}

/**
 * 发送 SSE 初始化数据
 */
export async function sendInitData(
  safeWrite: (data: string) => Promise<boolean>,
  conversationId: string,
  additionalData?: Record<string, any>
): Promise<boolean> {
  const initData = JSON.stringify({
    conversationId,
    type: 'init',
    ...additionalData,
  });
  return await safeWrite(`data: ${initData}\n\n`);
}

/**
 * 发送 SSE 完成信号
 */
export async function sendDoneSignal(
  safeWrite: (data: string) => Promise<boolean>,
  writer: WritableStreamDefaultWriter,
  isStreamClosed: boolean
): Promise<void> {
  if (!isStreamClosed) {
    await safeWrite('data: [DONE]\n\n');
    await writer.close();
  }
}

