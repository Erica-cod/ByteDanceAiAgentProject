/**
 * SSE 流式写入工具类
 * 
 * 复用自 sseHandler.ts 的通用逻辑：
 * - 安全写入（处理客户端断开）
 * - 心跳机制
 * - 错误处理
 */

export class SSEStreamWriter {
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private encoder: InstanceType<typeof TextEncoder>;
  private isStreamClosed: boolean = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  
  constructor(writer: WritableStreamDefaultWriter<Uint8Array>) {
    this.writer = writer;
    this.encoder = new TextEncoder();
  }
  
  /**
   * 安全写入数据（处理客户端断开）
   */
  async safeWrite(data: string): Promise<boolean> {
    if (this.isStreamClosed) {
      console.warn('⚠️  [SSE] 流已关闭，跳过写入');
      return false;
    }
    
    try {
      await this.writer.write(this.encoder.encode(data));
      return true;
    } catch (error: any) {
      if (error.name === 'AbortError' || error.code === 'ABORT_ERR') {
        console.warn('⚠️  [SSE] 客户端关闭了连接');
        this.isStreamClosed = true;
        return false;
      }
      throw error;
    }
  }
  
  /**
   * 发送 SSE 事件
   */
  async sendEvent(event: any): Promise<boolean> {
    const sseData = JSON.stringify(event);
    return await this.safeWrite(`data: ${sseData}\n\n`);
  }
  
  /**
   * 启动心跳
   */
  startHeartbeat(intervalMs: number = 15000): void {
    this.heartbeatTimer = setInterval(() => {
      void this.safeWrite(`: keep-alive\n\n`);
    }, intervalMs);
  }
  
  /**
   * 停止心跳
   */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
  
  /**
   * 检查流是否关闭
   */
  isClosed(): boolean {
    return this.isStreamClosed;
  }
  
  /**
   * 关闭流
   */
  async close(): Promise<void> {
    this.stopHeartbeat();
    
    if (!this.isStreamClosed) {
      try {
        await this.safeWrite('data: [DONE]\n\n');
        await this.writer.close();
      } catch (error) {
        // 忽略关闭错误
      }
    }
  }
}

