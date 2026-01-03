/**
 * 火山引擎豆包大模型服务
 * 
 * 文档: https://www.volcengine.com/docs/82379/1263512
 */

import fetch from 'node-fetch';

/**
 * 聊天消息接口
 */
export interface VolcengineMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * 火山引擎 API 请求参数
 */
export interface VolcengineRequest {
  model: string;
  messages: VolcengineMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
}

/**
 * 火山引擎 API 响应（流式）
 */
export interface VolcengineStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: string | null;
  }>;
}

/**
 * 火山引擎服务配置
 */
export class VolcengineService {
  private apiKey: string;
  private apiUrl: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.ARK_API_KEY || '';
    this.apiUrl = process.env.ARK_API_URL || 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
    this.model = process.env.ARK_MODEL || 'doubao-1-5-thinking-pro-250415';

    if (!this.apiKey) {
      console.warn('⚠️ ARK_API_KEY 未配置');
    }
  }

  /**
   * 调用火山引擎大模型（流式）
   * 
   * @param messages - 对话消息列表
   * @param options - 可选参数
   * @returns 流式响应
   */
  async chat(
    messages: VolcengineMessage[], 
    options?: {
      temperature?: number;
      maxTokens?: number;
      topP?: number;
      signal?: AbortSignal; // ✅ 新增：支持中断信号
      tools?: any[]; // ✅ V2: 支持工具定义
      tool_choice?: string; // ✅ V2: 工具选择策略
    }
  ): Promise<NodeJS.ReadableStream> {
    if (!this.apiKey) {
      throw new Error('ARK_API_KEY 未配置，请设置环境变量');
    }

    const requestBody: any = {
      model: this.model,
      messages: messages,
      stream: true,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 2000,
      top_p: options?.topP ?? 0.95,
    };

    // ✅ V2: 如果提供了工具定义，添加到请求体
    if (options?.tools && options.tools.length > 0) {
      requestBody.tools = options.tools;
      requestBody.tool_choice = options.tool_choice || 'auto';
    }

    console.log('🔥 调用火山引擎大模型:', {
      url: this.apiUrl,
      model: this.model,
      messagesCount: messages.length,
      options,
      hasApiKey: !!this.apiKey,
    });

    console.log('📡 发送请求到火山引擎:', {
      url: this.apiUrl,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey.substring(0, 10)}...`,
      },
    });

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: options?.signal as any, // ✅ 传递中断信号
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ 火山引擎 API 错误:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      throw new Error(`火山引擎 API 错误 (${response.status}): ${errorText}`);
    }

    console.log('✅ 火山引擎 API 响应成功');
    return response.body as NodeJS.ReadableStream;
  }

  /**
   * 解析流式响应数据
   * 
   * @param line - SSE 数据行
   * @returns 解析后的内容，如果没有内容返回 null
   */
  parseStreamLine(line: string): string | null {
    // 跳过空行
    if (!line.trim()) {
      return null;
    }

    // 火山引擎使用 SSE 格式: data: {...}
    if (line.startsWith('data: ')) {
      const jsonStr = line.slice(6); // 移除 "data: " 前缀
      
      // 跳过 [DONE] 标记
      if (jsonStr.trim() === '[DONE]') {
        return null;
      }

      try {
        const data: VolcengineStreamChunk = JSON.parse(jsonStr);
        
        // 提取内容
        if (data.choices && data.choices.length > 0) {
          const choice = data.choices[0];
          if (choice.delta && choice.delta.content) {
            const content = choice.delta.content;
            console.log('📨 火山引擎增量内容:', content);
            return content;
          }
        }
      } catch (error) {
        console.error('解析火山引擎流式数据失败:', error, 'Line:', line);
      }
    }

    return null;
  }

  /**
   * 获取模型名称
   */
  getModel(): string {
    return this.model;
  }

  /**
   * 检查服务是否配置正确
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }
}

// 导出单例
export const volcengineService = new VolcengineService();

