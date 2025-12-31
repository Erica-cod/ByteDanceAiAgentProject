/**
 * 自适应流式响应控制器
 * 
 * 功能：
 * 1. 统一的打字机效果速率控制（本地/远程模型）
 * 2. 背压检测（Backpressure Detection）
 * 3. 自适应切换字符/块推送模式
 * 4. 防止服务器内存溢出
 * 5. 与 SSEStreamWriter 无缝集成
 */

import type { SSEStreamWriter } from '../../../utils/sseStreamWriter.js';

/**
 * 流式控制配置
 */
export interface StreamControlConfig {
  /**
   * 打字机效果：每个字符的延迟（毫秒）
   * 
   * @default 30 - 适中速度，模拟真实打字
   * 
   * 推荐值：
   * - 快速：10-20ms
   * - 适中：30-50ms
   * - 慢速：80-100ms
   */
  typewriterDelay?: number;

  /**
   * 块模式：每块的大小（字符数）
   * 
   * @default 50 - 平衡响应速度和流畅度
   */
  chunkSize?: number;

  /**
   * 背压阈值：缓冲区最大字符数
   * 超过此值将切换到块模式
   * 
   * @default 500 - 约500字符，防止内存积压
   */
  backpressureThreshold?: number;

  /**
   * 是否启用自适应模式
   * 
   * @default true - 自动根据网络状况切换
   */
  adaptive?: boolean;

  /**
   * 强制使用块模式（忽略自适应）
   * 
   * @default false
   */
  forceChunkMode?: boolean;
}

/**
 * 流式推送模式
 */
export enum StreamMode {
  /** 逐字推送（默认） */
  CHARACTER = 'character',
  /** 按块推送（网络差时） */
  CHUNK = 'chunk',
}

/**
 * 流式推送统计
 */
export interface StreamStats {
  /** 当前模式 */
  mode: StreamMode;
  /** 已推送字符数 */
  sentChars: number;
  /** 缓冲区字符数 */
  bufferedChars: number;
  /** 模式切换次数 */
  modeSwitches: number;
  /** 平均推送延迟（毫秒） */
  avgDelay: number;
}

/**
 * 自适应流式控制器
 */
export class AdaptiveStreamController {
  private config: Required<StreamControlConfig>;
  private buffer: string[] = [];
  private mode: StreamMode = StreamMode.CHARACTER;
  private stats: StreamStats;
  private lastPushTime: number = Date.now();
  private delays: number[] = [];

  constructor(config: StreamControlConfig = {}) {
    // 合并默认配置
    this.config = {
      typewriterDelay: config.typewriterDelay ?? 30,
      chunkSize: config.chunkSize ?? 50,
      backpressureThreshold: config.backpressureThreshold ?? 500,
      adaptive: config.adaptive ?? true,
      forceChunkMode: config.forceChunkMode ?? false,
    };

    // 初始化统计
    this.stats = {
      mode: this.mode,
      sentChars: 0,
      bufferedChars: 0,
      modeSwitches: 0,
      avgDelay: 0,
    };

    // 如果强制块模式，直接切换
    if (this.config.forceChunkMode) {
      this.mode = StreamMode.CHUNK;
      this.stats.mode = StreamMode.CHUNK;
    }
  }

  /**
   * 添加内容到缓冲区
   */
  push(content: string): void {
    this.buffer.push(content);
    this.stats.bufferedChars += content.length;

    // 检测背压
    if (this.config.adaptive && !this.config.forceChunkMode) {
      this.detectBackpressure();
    }
  }

  /**
   * 检测背压并自适应切换模式
   */
  private detectBackpressure(): void {
    const oldMode = this.mode;

    // 缓冲区过大 -> 切换到块模式
    if (this.stats.bufferedChars > this.config.backpressureThreshold) {
      this.mode = StreamMode.CHUNK;
      console.warn(
        `⚠️  [Stream] 检测到背压 (${this.stats.bufferedChars} chars)，切换到块模式`
      );
    }
    // 缓冲区正常 -> 恢复字符模式
    else if (this.stats.bufferedChars < this.config.backpressureThreshold / 2) {
      this.mode = StreamMode.CHARACTER;
    }

    // 记录模式切换
    if (oldMode !== this.mode) {
      this.stats.modeSwitches++;
      this.stats.mode = this.mode;
      console.log(`🔄 [Stream] 模式切换: ${oldMode} -> ${this.mode}`);
    }
  }

  /**
   * 流式推送到客户端（与 SSEStreamWriter 集成）
   * 
   * @param writer - SSE Writer 对象
   * @param content - 要推送的内容
   * @param metadata - SSE 事件的额外数据（thinking, toolCall等）
   */
  async pushContent(
    writer: SSEStreamWriter,
    content: string,
    metadata?: {
      thinking?: string;
      toolCall?: any;
      sources?: any[];
    }
  ): Promise<void> {
    // 添加到缓冲区
    this.push(content);

    // 立即推送（根据模式决定如何推送）
    const textToPush = this.buffer.shift()!;
    
    if (this.mode === StreamMode.CHARACTER) {
      // 逐字推送
      await this.streamCharactersToSSE(writer, textToPush, metadata);
    } else {
      // 按块推送
      await this.streamChunksToSSE(writer, textToPush, metadata);
    }

    // 更新统计
    this.stats.bufferedChars -= textToPush.length;
    this.stats.sentChars += textToPush.length;
  }

  /**
   * 逐字推送到 SSE（带打字机效果）
   */
  private async streamCharactersToSSE(
    writer: SSEStreamWriter,
    content: string,
    metadata?: {
      thinking?: string;
      toolCall?: any;
      sources?: any[];
    }
  ): Promise<void> {
    // 累积内容，用于显示完整的上下文
    let accumulatedContent = '';
    
    for (const char of content) {
      // 检查连接
      if (writer.isClosed()) {
        console.warn('⚠️  [Stream] 客户端已断开');
        break;
      }

      accumulatedContent += char;

      // 发送累积的内容
      try {
        await writer.sendEvent({
          content: accumulatedContent,
          ...metadata,
        });
      } catch (error) {
        console.error('❌ [Stream] SSE 写入失败:', error);
        break;
      }

      // 打字机延迟
      if (this.config.typewriterDelay > 0) {
        await this.delay(this.config.typewriterDelay);
      }

      // 记录延迟
      this.recordDelay();
    }
  }

  /**
   * 按块推送到 SSE（无延迟，快速传输）
   */
  private async streamChunksToSSE(
    writer: SSEStreamWriter,
    content: string,
    metadata?: {
      thinking?: string;
      toolCall?: any;
      sources?: any[];
    }
  ): Promise<void> {
    // 在块模式下，直接推送整个内容（不分块，因为内容通常不大）
    // 分块是为了避免一次性传输太多数据
    
    try {
      if (writer.isClosed()) {
        console.warn('⚠️  [Stream] 客户端已断开');
        return;
      }

      await writer.sendEvent({
        content,
        ...metadata,
      });

      // 小延迟避免客户端解析压力
      await this.delay(5);
      
      this.recordDelay();
    } catch (error) {
      console.error('❌ [Stream] SSE 块写入失败:', error);
    }
  }

  /**
   * 将字符串分割成块
   */
  private splitIntoChunks(text: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * 延迟
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 记录推送延迟
   */
  private recordDelay(): void {
    const now = Date.now();
    const delay = now - this.lastPushTime;
    this.delays.push(delay);
    
    // 只保留最近100次的延迟记录
    if (this.delays.length > 100) {
      this.delays.shift();
    }

    // 计算平均延迟
    this.stats.avgDelay = 
      this.delays.reduce((sum, d) => sum + d, 0) / this.delays.length;

    this.lastPushTime = now;
  }

  /**
   * 获取统计信息
   */
  getStats(): StreamStats {
    return { ...this.stats };
  }

  /**
   * 输出最终统计
   */
  logStats(): void {
    console.log('📊 [Stream] 推送完成统计:');
    console.log(`   总字符数: ${this.stats.sentChars}`);
    console.log(`   模式切换: ${this.stats.modeSwitches} 次`);
    console.log(`   平均延迟: ${this.stats.avgDelay.toFixed(2)} ms`);
    console.log(`   最终模式: ${this.stats.mode}`);
  }

  /**
   * 手动切换模式
   */
  setMode(mode: StreamMode): void {
    if (this.mode !== mode) {
      const oldMode = this.mode;
      this.mode = mode;
      this.stats.mode = mode;
      this.stats.modeSwitches++;
      console.log(`🔄 [Stream] 手动切换: ${oldMode} -> ${mode}`);
    }
  }

  /**
   * 获取当前模式
   */
  getMode(): StreamMode {
    return this.mode;
  }

  /**
   * 重置控制器
   */
  reset(): void {
    this.buffer = [];
    this.mode = this.config.forceChunkMode ? StreamMode.CHUNK : StreamMode.CHARACTER;
    this.stats = {
      mode: this.mode,
      sentChars: 0,
      bufferedChars: 0,
      modeSwitches: 0,
      avgDelay: 0,
    };
    this.delays = [];
    this.lastPushTime = Date.now();
  }
}

/**
 * 创建默认的流式控制器（本地模型 - 快速）
 */
export function createLocalStreamController(): AdaptiveStreamController {
  return new AdaptiveStreamController({
    typewriterDelay: 20, // 本地模型快一些
    chunkSize: 50,
    backpressureThreshold: 500,
    adaptive: true,
  });
}

/**
 * 创建默认的流式控制器（远程模型 - 适中）
 */
export function createRemoteStreamController(): AdaptiveStreamController {
  return new AdaptiveStreamController({
    typewriterDelay: 40, // 远程模型慢一些，更接近真实AI速度
    chunkSize: 50,
    backpressureThreshold: 500,
    adaptive: true,
  });
}

/**
 * 创建无延迟的流式控制器（紧急模式）
 */
export function createFastStreamController(): AdaptiveStreamController {
  return new AdaptiveStreamController({
    typewriterDelay: 0,
    chunkSize: 100,
    backpressureThreshold: 1000,
    adaptive: true,
  });
}

