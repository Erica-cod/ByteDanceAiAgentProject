/**
 * 火山引擎 Embedding 服务（共享模块）
 * 
 * 用于：
 * 1. 多 Agent 协作中的立场相似度计算
 * 2. 请求缓存中的语义相似度匹配
 * 3. 其他需要文本向量化的场景
 */

import fetch from 'node-fetch';

/**
 * Embedding 服务接口
 */
export interface IEmbeddingService {
  /**
   * 获取单个文本的 embedding 向量
   */
  getEmbedding(text: string): Promise<number[]>;
  
  /**
   * 批量获取多个文本的 embedding 向量
   */
  getBatchEmbeddings(texts: string[]): Promise<number[][]>;
  
  /**
   * 检查服务是否已配置
   */
  isConfigured(): boolean;
  
  /**
   * 获取模型名称
   */
  getModel(): string;
}

/**
 * 火山引擎 Embedding 服务实现
 */
export class VolcengineEmbeddingService implements IEmbeddingService {
  private apiKey: string;
  private apiUrl: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.ARK_API_KEY || '';
    this.apiUrl = process.env.ARK_EMBEDDING_API_URL || 'https://ark.cn-beijing.volces.com/api/v3/embeddings';
    this.model = process.env.ARK_EMBEDDING_MODEL || 'doubao-embedding-text-240715';
    
    if (!this.apiKey) {
      console.warn('⚠️  [Embedding] ARK_API_KEY 未配置，embedding功能将不可用');
      console.warn('⚠️  [Embedding] 系统将自动使用简单文本相似度作为fallback');
    } else {
      console.log(`✅ [Embedding] 配置完成: ${this.model}`);
      console.log(`   API URL: ${this.apiUrl}`);
    }
  }

  /**
   * 获取单个文本的 embedding 向量
   */
  async getEmbedding(text: string): Promise<number[]> {
    if (!this.apiKey) {
      throw new Error('ARK_API_KEY 未配置，无法使用embedding功能');
    }

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: text,
          encoding_format: 'float',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Embedding API 错误 (${response.status}): ${errorText}`);
      }

      const data: any = await response.json();
      
      // 火山引擎返回格式: { data: [{ embedding: [...] }] }
      if (data.data && data.data[0] && data.data[0].embedding) {
        return data.data[0].embedding;
      }

      throw new Error('Embedding API 返回格式错误');
    } catch (error: any) {
      console.error('❌ [Embedding] 获取失败:', error);
      throw error;
    }
  }

  /**
   * 批量获取多个文本的 embedding 向量（提高效率）
   */
  async getBatchEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error('ARK_API_KEY 未配置，无法使用embedding功能');
    }

    try {
      console.log(`🔍 [Embedding] 批量获取 ${texts.length} 个文本的embedding...`);
      console.log(`   模型: ${this.model}`);
      console.log(`   端点: ${this.apiUrl}`);
      
      const requestBody = {
        model: this.model,
        input: texts,
        encoding_format: 'float',
      };
      
      console.log(`   请求体预览: ${JSON.stringify({
        ...requestBody,
        input: texts.map(t => t.substring(0, 50) + '...')
      })}`);
      
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ [Embedding] API返回错误 (${response.status})`);
        console.error(`   错误详情: ${errorText}`);
        
        // 解析错误信息，提供有用的提示
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error?.code === 'InvalidEndpointOrModel.NotFound') {
            throw new Error(
              `模型 "${this.model}" 不存在或无权限访问。\n` +
              `请检查：\n` +
              `1. 在火山引擎控制台确认模型名称\n` +
              `2. 确保API Key有权限访问embedding模型\n` +
              `3. 或设置 ARK_EMBEDDING_MODEL 环境变量为正确的模型名`
            );
          }
        } catch (parseError) {
          // 如果不是JSON，直接抛出原始错误
        }
        
        throw new Error(`Embedding API 错误 (${response.status}): ${errorText}`);
      }

      const data: any = await response.json();
      
      // 火山引擎批量返回格式: { data: [{ embedding: [...] }, { embedding: [...] }] }
      if (data.data && Array.isArray(data.data)) {
        const embeddings = data.data.map((item: any) => item.embedding);
        console.log(`✅ [Embedding] 成功获取 ${embeddings.length} 个向量 (维度: ${embeddings[0]?.length || 'unknown'})`);
        return embeddings;
      }

      console.error(`❌ [Embedding] API返回格式错误:`, JSON.stringify(data).substring(0, 200));
      throw new Error('Embedding API 返回格式错误');
    } catch (error: any) {
      console.error('❌ [Embedding] 批量获取失败:', error.message);
      throw error;
    }
  }

  /**
   * 检查服务是否已配置
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * 获取模型名称
   */
  getModel(): string {
    return this.model;
  }
}

// 导出单例
export const embeddingService = new VolcengineEmbeddingService();

