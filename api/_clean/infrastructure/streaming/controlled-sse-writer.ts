/**
 * 受控 SSE Writer
 * 
 * 在 SSEStreamWriter 基础上添加流式控制功能
 */

import type { SSEStreamWriter } from '../../../utils/sseStreamWriter.js';

/**
 * 流式控制配置
 */
export interface StreamControlConfig {
  /**
   * 打字机延迟（毫秒/字符）
   * @default 30
   */
  typewriterDelay?: number;

  /**
   * 背压阈值（缓冲区最大字符数）
   * @default 500
   */
  backpressureThreshold?: number;

  /**
   * 是否启用自适应
   * @default true
   */
  adaptive?: boolean;
}

/**
 * 受控 SSE Writer（带打字机效果和背压检测）
 */
export class ControlledSSEWriter {
  private config: Required<StreamControlConfig>;
  private lastContent: string = '';
  private pendingChars: number = 0;
  private sentChars: number = 0;
  private lastPushTime: number = Date.now();
  private isChunkMode: boolean = false;

  constructor(
    private writer: SSEStreamWriter,
    config?: StreamControlConfig
  ) {
    this.config = {
      typewriterDelay: config?.typewriterDelay ?? 30,
      backpressureThreshold: config?.backpressureThreshold ?? 500,
      adaptive: config?.adaptive ?? true,
    };
  }

  /**
   * 发送内容（带打字机效果和背压控制）
   * 
   * @param fullContent - 完整的累积内容
   * @param metadata - 额外的元数据
   */
  async sendEvent(
    fullContent: string,
    metadata?: {
      thinking?: string;
      toolCall?: any;
      sources?: any[];
    }
  ): Promise<void> {
    // 检查连接
    if (this.writer.isClosed()) {
      return;
    }

    // 计算新增内容长度
    const delta = fullContent.length - this.lastContent.length;
    
    if (delta <= 0) {
      return; // 没有新内容
    }

    // 更新待发送字符数
    this.pendingChars += delta;

    // 检测背压
    if (this.config.adaptive && this.pendingChars > this.config.backpressureThreshold) {
      if (!this.isChunkMode) {
        this.isChunkMode = true;
        console.warn(
          `⚠️  [Stream] 检测到背压 (${this.pendingChars} chars)，切换到快速模式`
        );
      }
    } else if (this.isChunkMode && this.pendingChars < this.config.backpressureThreshold / 2) {
      this.isChunkMode = false;
      console.log(`✅ [Stream] 背压恢复，切换回正常模式`);
    }

    // 计算延迟
    const delay = this.isChunkMode ? 0 : this.config.typewriterDelay;

    // 应用延迟
    if (delay > 0) {
      const timeSinceLastPush = Date.now() - this.lastPushTime;
      const targetDelay = delay * delta; // 按新增字符数计算延迟
      const actualDelay = Math.max(0, targetDelay - timeSinceLastPush);
      
      if (actualDelay > 0) {
        await this.sleep(actualDelay);
      }
    }

    // 发送事件
    try {
      await this.writer.sendEvent({
        content: fullContent,
        ...metadata,
      });

      // 更新状态
      this.lastContent = fullContent;
      this.sentChars += delta;
      this.pendingChars = Math.max(0, this.pendingChars - delta);
      this.lastPushTime = Date.now();
    } catch (error) {
      console.error('❌ [Controlled SSE] 发送失败:', error);
    }
  }

  /**
   * 直接发送（不经过控制，用于工具调用通知）
   */
  async sendDirect(data: any): Promise<void> {
    await this.writer.sendEvent(data);
  }

  /**
   * 检查连接是否关闭
   */
  isClosed(): boolean {
    return this.writer.isClosed();
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      sentChars: this.sentChars,
      pendingChars: this.pendingChars,
      isChunkMode: this.isChunkMode,
    };
  }

  /**
   * 输出统计信息
   */
  logStats(): void {
    console.log('📊 [Controlled SSE] 推送统计:');
    console.log(`   总字符数: ${this.sentChars}`);
    console.log(`   待发送: ${this.pendingChars}`);
    console.log(`   模式: ${this.isChunkMode ? '快速模式' : '正常模式'}`);
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.lastContent = '';
    this.pendingChars = 0;
    this.sentChars = 0;
    this.isChunkMode = false;
    this.lastPushTime = Date.now();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 创建本地模型的受控 SSE Writer（快速打字机）
 */
export function createLocalControlledWriter(writer: SSEStreamWriter): ControlledSSEWriter {
  return new ControlledSSEWriter(writer, {
    typewriterDelay: 20, // 本地模型：快速
    backpressureThreshold: 500,
    adaptive: true,
  });
}

/**
 * 创建远程模型的受控 SSE Writer（适中打字机）
 */
export function createRemoteControlledWriter(writer: SSEStreamWriter): ControlledSSEWriter {
  return new ControlledSSEWriter(writer, {
    typewriterDelay: 40, // 远程模型：适中（模拟真实AI速度）
    backpressureThreshold: 500,
    adaptive: true,
  });
}

/**
 * 创建快速模式的受控 SSE Writer（无延迟）
 */
export function createFastControlledWriter(writer: SSEStreamWriter): ControlledSSEWriter {
  return new ControlledSSEWriter(writer, {
    typewriterDelay: 0,
    backpressureThreshold: 1000,
    adaptive: true,
  });
}

