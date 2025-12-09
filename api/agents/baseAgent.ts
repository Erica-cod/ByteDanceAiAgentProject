/**
 * Agent 基类 - 所有Agent的抽象基类
 * 
 * 定义了Agent的基本接口和通用功能
 */

import { volcengineService, type VolcengineMessage } from '../services/volcengineService.js';

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
   * @returns AI回复内容
   */
  protected async callModel(messages: VolcengineMessage[]): Promise<string> {
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
   * 修复常见的JSON格式错误
   */
  protected fixCommonJSONErrors(jsonStr: string): string {
    let fixed = jsonStr;
    
    // 1. 移除末尾多余的逗号
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
    
    // 2. 修复单引号为双引号
    fixed = fixed.replace(/'/g, '"');
    
    // 3. 修复未闭合的字符串（尝试在末尾添加引号）
    const lines = fixed.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // 简单检查：如果行中有奇数个引号，可能需要补全
      const quoteCount = (line.match(/"/g) || []).length;
      if (quoteCount % 2 !== 0 && !line.trim().endsWith(',') && !line.trim().endsWith('}') && !line.trim().endsWith(']')) {
        lines[i] = line + '"';
      }
    }
    fixed = lines.join('\n');
    
    // 4. 尝试补全未闭合的括号
    const openBraces = (fixed.match(/{/g) || []).length;
    const closeBraces = (fixed.match(/}/g) || []).length;
    if (openBraces > closeBraces) {
      fixed += '}'.repeat(openBraces - closeBraces);
    }
    
    const openBrackets = (fixed.match(/\[/g) || []).length;
    const closeBrackets = (fixed.match(/\]/g) || []).length;
    if (openBrackets > closeBrackets) {
      fixed += ']'.repeat(openBrackets - closeBrackets);
    }
    
    return fixed;
  }

  /**
   * 从AI回复中提取JSON（通用方法，增强容错）
   */
  protected extractJSON(text: string): any | null {
    // 尝试多种提取策略
    const strategies = [
      // 策略1: 匹配 ```json ... ``` 代码块
      () => {
        const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/;
        const jsonBlockMatch = text.match(jsonBlockRegex);
        if (jsonBlockMatch) {
          return jsonBlockMatch[1].trim();
        }
        return null;
      },
      
      // 策略2: 匹配 ``` ... ``` 代码块（可能忘记写json）
      () => {
        const codeBlockRegex = /```\s*([\s\S]*?)\s*```/;
        const codeBlockMatch = text.match(codeBlockRegex);
        if (codeBlockMatch && codeBlockMatch[1].trim().startsWith('{')) {
          return codeBlockMatch[1].trim();
        }
        return null;
      },
      
      // 策略3: 直接提取JSON对象
      () => {
        const startIndex = text.indexOf('{');
        if (startIndex === -1) return null;
        
        let braceCount = 0;
        let jsonEndIndex = -1;
        let inString = false;
        let escapeNext = false;

        for (let i = startIndex; i < text.length; i++) {
          const char = text[i];

          if (escapeNext) {
            escapeNext = false;
            continue;
          }

          if (char === '\\') {
            escapeNext = true;
            continue;
          }

          if (char === '"') {
            inString = !inString;
            continue;
          }

          if (!inString) {
            if (char === '{') braceCount++;
            if (char === '}') {
              braceCount--;
              if (braceCount === 0) {
                jsonEndIndex = i + 1;
                break;
              }
            }
          }
        }

        if (jsonEndIndex !== -1) {
          return text.substring(startIndex, jsonEndIndex);
        }
        return null;
      }
    ];

    // 依次尝试每个策略
    for (const strategy of strategies) {
      try {
        const jsonStr = strategy();
        if (!jsonStr) continue;
        
        // 尝试直接解析
        try {
          return JSON.parse(jsonStr);
        } catch (parseError) {
          // 如果失败，尝试修复常见错误后再解析
          console.warn(`⚠️  [${this.agentId}] JSON解析失败，尝试修复...`);
          const fixedJsonStr = this.fixCommonJSONErrors(jsonStr);
          try {
            const result = JSON.parse(fixedJsonStr);
            console.log(`✅ [${this.agentId}] JSON修复成功`);
            return result;
          } catch (fixError) {
            console.warn(`⚠️  [${this.agentId}] JSON修复失败，继续尝试下一个策略`);
            continue;
          }
        }
      } catch (error) {
        continue;
      }
    }

    console.error(`❌ [${this.agentId}] 所有JSON提取策略失败`);
    return null;
  }
}

