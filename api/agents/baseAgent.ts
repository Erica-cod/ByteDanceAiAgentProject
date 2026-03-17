/**
 * Agent 基类 - 所有Agent的抽象基类
 * 
 * 定义了Agent的基本接口和通用功能
 */

import { volcengineService, type VolcengineMessage } from '../_clean/infrastructure/llm/volcengine-service.js';
import { extractJSON } from '../_clean/shared/utils/json-extractor.js';

/**
 * 位置摘要 - 用于相似度比较
 */
export interface PositionSummary {
  conclusion: string;           // 一句话结论
  key_reasons: string[];        // 关键理由
  assumptions: string[];        // 假设条件
  confidence: number;           // 置信度 (0-1)
  changes_from_last_round?: {   // 与上一轮的变化
    conclusion_changed: boolean;
    reasons_added: string[];
    confidence_delta: number;
  };
}

/**
 * Agent 输出基础结构
 */
export interface AgentOutput {
  agent_id: string;             // Agent标识
  round: number;                // 当前轮次
  output_type: string;          // 输出类型
  content: string;              // 主要输出内容（用户可见）
  metadata: any;                // 元数据（结构化信息）
  timestamp: string;            // 时间戳
}

/**
 * Agent 配置
 */
export interface AgentConfig {
  agentId: string;              // Agent唯一标识
  temperature?: number;         // 温度参数
  maxTokens?: number;           // 最大token数
  systemPrompt?: string;        // 自定义系统提示
}

/**
 * Agent 基类
 */
export abstract class BaseAgent {
  protected agentId: string;
  protected temperature: number;
  protected maxTokens: number;
  protected systemPrompt: string;
  
  // 历史记录
  protected history: AgentOutput[] = [];
  protected lastPosition?: PositionSummary;

  constructor(config: AgentConfig) {
    this.agentId = config.agentId;
    this.temperature = config.temperature || 0.7;
    this.maxTokens = config.maxTokens || 3000;
    this.systemPrompt = config.systemPrompt || this.getDefaultSystemPrompt();
  }

  /**
   * 获取默认系统提示（子类必须实现）
   */
  protected abstract getDefaultSystemPrompt(): string;

  /**
   * 生成输出（子类必须实现）
   * 
   * @param userQuery - 用户查询
   * @param context - 上下文信息（其他Agent的输出等）
   * @param round - 当前轮次
   * @returns Agent输出
   */
  abstract generate(
    userQuery: string,
    context: any,
    round: number
  ): Promise<AgentOutput>;

  /**
   * 提取位置摘要（子类可以重写）
   * 
   * @param content - Agent输出内容
   * @returns 位置摘要
   */
  protected abstract extractPosition(content: string, metadata: any): PositionSummary;

  /**
   * 调用火山引擎模型
   * 
   * @param messages - 消息列表
   * @param onChunk - 可选的流式回调（每个chunk调用一次）
   * @returns AI回复内容
   */
  protected async callModel(
    messages: VolcengineMessage[],
    onChunk?: (chunk: string) => void | Promise<void>
  ): Promise<string> {
    try {
      console.log(`🤖 [${this.agentId}] 调用火山引擎模型...`);
      
      const stream = await volcengineService.chat(messages, {
        temperature: this.temperature,
        maxTokens: this.maxTokens,
      });

      // 收集流式响应
      let fullResponse = '';
      let buffer = '';

      for await (const chunk of stream) {
        const chunkStr = chunk.toString();
        buffer += chunkStr;

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            const content = volcengineService.parseStreamLine(line);
            if (content) {
              fullResponse += content;
              
              // ✅ 实时回调
              if (onChunk) {
                await onChunk(content);
              }
            }
          }
        }
      }

      console.log(`✅ [${this.agentId}] 模型回复完成，长度: ${fullResponse.length}`);
      return fullResponse;
    } catch (error: any) {
      console.error(`❌ [${this.agentId}] 模型调用失败:`, error);
      throw new Error(`模型调用失败: ${error.message}`);
    }
  }

  /**
   * 构建消息列表
   * 
   * @param userMessage - 用户消息
   * @param contextMessages - 上下文消息
   * @returns 消息列表
   */
  protected buildMessages(
    userMessage: string,
    contextMessages: string[] = []
  ): VolcengineMessage[] {
    const messages: VolcengineMessage[] = [
      { role: 'system', content: this.systemPrompt },
    ];

    // 添加上下文消息
    for (const msg of contextMessages) {
      messages.push({ role: 'user', content: msg });
    }

    // 添加当前用户消息
    messages.push({ role: 'user', content: userMessage });

    return messages;
  }

  /**
   * 保存输出到历史
   */
  protected saveToHistory(output: AgentOutput): void {
    this.history.push(output);
    
    // 更新最后的位置摘要
    if (output.metadata && output.metadata.position) {
      this.lastPosition = output.metadata.position;
    }
  }

  /**
   * 获取历史输出
   */
  getHistory(): AgentOutput[] {
    return this.history;
  }

  /**
   * 获取最后的位置摘要
   */
  getLastPosition(): PositionSummary | undefined {
    return this.lastPosition;
  }

  /**
   * 获取Agent ID
   */
  getAgentId(): string {
    return this.agentId;
  }

  /**
   * 重置Agent状态
   */
  reset(): void {
    this.history = [];
    this.lastPosition = undefined;
  }

  /**
   * 生成位置摘要的文本表示（用于相似度比较）
   */
  protected positionToText(position: PositionSummary): string {
    return `结论: ${position.conclusion}\n关键理由: ${position.key_reasons.join('; ')}\n假设: ${position.assumptions.join('; ')}`;
  }

  /**
   * 从AI回复中提取JSON（委托给统一的提取工具）
   * @deprecated 已迁移到 api/utils/jsonExtractor.ts，建议直接使用
   */
  protected extractJSON(text: string): any | null {
    // 委托给统一的提取工具，保持接口兼容
    return extractJSON(text, {
      autoFix: true,
      logPrefix: `🔍 [${this.agentId}]`,
      source: this.agentId,
    });
  }
}

