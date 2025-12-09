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
    
    // 1. 替换中文引号为英文引号
    fixed = fixed.replace(/"/g, '"').replace(/"/g, '"');
    
    // 2. 移除末尾多余的逗号
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
    
    // 3. 修复单引号为双引号（但要避免所有格's）
    fixed = fixed.replace(/(?<!\\)'/g, '"');
    
    // 4. 修复常见的无引号键名
    fixed = fixed.replace(/(\n\s*)(\w+)(\s*:)/g, '$1"$2"$3');
    
    // 5. 尝试补全未闭合的括号
    const openBraces = (fixed.match(/{/g) || []).length;
    const closeBraces = (fixed.match(/}/g) || []).length;
    if (openBraces > closeBraces) {
      console.log(`   🔧 补全 ${openBraces - closeBraces} 个未闭合的 }`);
      fixed += '}'.repeat(openBraces - closeBraces);
    }
    
    const openBrackets = (fixed.match(/\[/g) || []).length;
    const closeBrackets = (fixed.match(/\]/g) || []).length;
    if (openBrackets > closeBrackets) {
      console.log(`   🔧 补全 ${openBrackets - closeBrackets} 个未闭合的 ]`);
      fixed += ']'.repeat(openBrackets - closeBrackets);
    }
    
    return fixed;
  }

  /**
   * 从AI回复中提取JSON（通用方法，增强容错）
   */
  protected extractJSON(text: string): any | null {
    console.log(`\n🔍 [${this.agentId}] 开始提取JSON...`);
    console.log(`   原始文本长度: ${text.length} 字符`);
    
    // 尝试多种提取策略
    const strategies = [
      // 策略1: 匹配 ```json ... ``` 代码块
      { name: '```json代码块', fn: () => {
        const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/;
        const jsonBlockMatch = text.match(jsonBlockRegex);
        if (jsonBlockMatch) {
          console.log(`   ✓ 策略1: 找到 \`\`\`json 代码块`);
          return jsonBlockMatch[1].trim();
        }
        return null;
      }},
      
      // 策略2: 匹配 ``` ... ``` 代码块（可能忘记写json）
      { name: '```代码块', fn: () => {
        const codeBlockRegex = /```\s*([\s\S]*?)\s*```/;
        const codeBlockMatch = text.match(codeBlockRegex);
        if (codeBlockMatch && codeBlockMatch[1].trim().startsWith('{')) {
          console.log(`   ✓ 策略2: 找到 \`\`\` 代码块（无json标记）`);
          return codeBlockMatch[1].trim();
        }
        return null;
      }},
      
      // 策略3: 直接提取JSON对象
      { name: '直接提取', fn: () => {
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
          console.log(`   ✓ 策略3: 直接提取JSON对象 (${jsonEndIndex - startIndex} 字符)`);
          return text.substring(startIndex, jsonEndIndex);
        }
        return null;
      }}
    ];

    // 依次尝试每个策略
    for (const strategy of strategies) {
      try {
        const jsonStr = strategy.fn();
        if (!jsonStr) continue;
        
        console.log(`   📝 提取的JSON长度: ${jsonStr.length} 字符`);
        console.log(`   📝 JSON预览: ${jsonStr.substring(0, 100)}...`);
        
        // 尝试直接解析
        try {
          const result = JSON.parse(jsonStr);
          console.log(`✅ [${this.agentId}] JSON解析成功（策略: ${strategy.name}）`);
          return result;
        } catch (parseError: any) {
          // 如果失败，尝试修复常见错误后再解析
          console.warn(`⚠️  [${this.agentId}] JSON解析失败: ${parseError.message}`);
          console.warn(`   尝试自动修复...`);
          
          const fixedJsonStr = this.fixCommonJSONErrors(jsonStr);
          
          // 如果修复后有变化，显示修复信息
          if (fixedJsonStr !== jsonStr) {
            console.log(`   🔧 已应用修复，修复后长度: ${fixedJsonStr.length}`);
          }
          
          try {
            const result = JSON.parse(fixedJsonStr);
            console.log(`✅ [${this.agentId}] JSON修复并解析成功（策略: ${strategy.name}）`);
            return result;
          } catch (fixError: any) {
            console.warn(`❌ [${this.agentId}] 修复失败: ${fixError.message}`);
            console.warn(`   错误位置: ${fixError.message.match(/position (\d+)/)?.[1] || '未知'}`);
            
            // 显示错误位置附近的内容
            const posMatch = fixError.message.match(/position (\d+)/);
            if (posMatch) {
              const pos = parseInt(posMatch[1]);
              const start = Math.max(0, pos - 50);
              const end = Math.min(fixedJsonStr.length, pos + 50);
              console.warn(`   错误附近内容: ...${fixedJsonStr.substring(start, end)}...`);
            }
            
            continue;
          }
        }
      } catch (error) {
        continue;
      }
    }

    console.error(`❌ [${this.agentId}] 所有JSON提取策略失败`);
    console.error(`   建议: 检查AI输出是否包含有效的JSON格式`);
    return null;
  }
}

