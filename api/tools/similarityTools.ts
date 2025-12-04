/**
 * 相似度工具 - 用于多Agent协作中的立场比较
 * 
 * 功能：
 * - 文本向量化（使用火山引擎的embedding模型）
 * - 计算余弦相似度
 * - 生成相似度矩阵
 * - 检测最不相似的配对
 */

import fetch from 'node-fetch';

/**
 * 向量接口
 */
export interface Embedding {
  text: string;
  vector: number[];
}

/**
 * 相似度比较结果
 */
export interface SimilarityResult {
  embeddings: Embedding[];
  similarity_matrix: number[][];
  mean_similarity: number;
  most_different_pair: [number, number];
  most_different_similarity: number;
}

/**
 * 火山引擎 Embedding 服务
 */
class VolcengineEmbeddingService {
  private apiKey: string;
  private apiUrl: string;
  private model: string;

  constructor() {
    this.apiKey = process.env.ARK_API_KEY || '';
    // 火山引擎的embedding endpoint
    this.apiUrl = process.env.ARK_EMBEDDING_API_URL || 'https://ark.cn-beijing.volces.com/api/v3/embeddings';
    // 使用火山引擎的embedding模型
    this.model = process.env.ARK_EMBEDDING_MODEL || 'doubao-embedding';
  }

  /**
   * 获取文本的embedding向量
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
      console.error('❌ 获取embedding失败:', error);
      throw error;
    }
  }

  /**
   * 批量获取embedding（提高效率）
   */
  async getBatchEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      throw new Error('ARK_API_KEY 未配置，无法使用embedding功能');
    }

    try {
      console.log(`🔍 批量获取 ${texts.length} 个文本的embedding...`);
      
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: texts,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Embedding API 错误 (${response.status}): ${errorText}`);
      }

      const data: any = await response.json();
      
      // 火山引擎批量返回格式: { data: [{ embedding: [...] }, { embedding: [...] }] }
      if (data.data && Array.isArray(data.data)) {
        const embeddings = data.data.map((item: any) => item.embedding);
        console.log(`✅ 成功获取 ${embeddings.length} 个embedding向量`);
        return embeddings;
      }

      throw new Error('Embedding API 返回格式错误');
    } catch (error: any) {
      console.error('❌ 批量获取embedding失败:', error);
      throw error;
    }
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }
}

// 导出单例
const embeddingService = new VolcengineEmbeddingService();

/**
 * 计算余弦相似度
 * 
 * @param vecA - 向量A
 * @param vecB - 向量B
 * @returns 相似度 (0-1)
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('向量维度不匹配');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

/**
 * 计算相似度矩阵
 * 
 * @param embeddings - embedding向量数组
 * @returns 相似度矩阵（对称矩阵）
 */
export function calculateSimilarityMatrix(embeddings: number[][]): number[][] {
  const n = embeddings.length;
  const matrix: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 1.0; // 自己和自己的相似度为1
      } else {
        const similarity = cosineSimilarity(embeddings[i], embeddings[j]);
        matrix[i][j] = similarity;
        matrix[j][i] = similarity; // 对称矩阵
      }
    }
  }

  return matrix;
}

/**
 * 比较多个立场的相似度
 * 
 * @param texts - 立场文本数组（每个文本是一个Agent的立场摘要）
 * @returns 相似度分析结果
 */
export async function comparePositions(texts: string[]): Promise<SimilarityResult> {
  if (!embeddingService.isConfigured()) {
    throw new Error('Embedding服务未配置，请设置 ARK_API_KEY');
  }

  if (texts.length < 2) {
    throw new Error('至少需要2个文本才能比较相似度');
  }

  console.log(`🔍 开始比较 ${texts.length} 个立场的相似度...`);

  try {
    // 1. 获取所有文本的embedding
    const vectors = await embeddingService.getBatchEmbeddings(texts);

    const embeddings: Embedding[] = texts.map((text, i) => ({
      text,
      vector: vectors[i],
    }));

    // 2. 计算相似度矩阵
    const similarity_matrix = calculateSimilarityMatrix(vectors);

    // 3. 计算平均相似度（排除对角线）
    let sum = 0;
    let count = 0;
    for (let i = 0; i < similarity_matrix.length; i++) {
      for (let j = i + 1; j < similarity_matrix.length; j++) {
        sum += similarity_matrix[i][j];
        count++;
      }
    }
    const mean_similarity = count > 0 ? sum / count : 0;

    // 4. 找出最不相似的配对
    let minSimilarity = 1.0;
    let most_different_pair: [number, number] = [0, 1];

    for (let i = 0; i < similarity_matrix.length; i++) {
      for (let j = i + 1; j < similarity_matrix.length; j++) {
        if (similarity_matrix[i][j] < minSimilarity) {
          minSimilarity = similarity_matrix[i][j];
          most_different_pair = [i, j];
        }
      }
    }

    console.log(`✅ 相似度分析完成:`);
    console.log(`   平均相似度: ${mean_similarity.toFixed(3)}`);
    console.log(`   最不相似配对: [${most_different_pair[0]}, ${most_different_pair[1]}], 相似度: ${minSimilarity.toFixed(3)}`);

    return {
      embeddings,
      similarity_matrix,
      mean_similarity,
      most_different_pair,
      most_different_similarity: minSimilarity,
    };
  } catch (error: any) {
    console.error('❌ 相似度比较失败:', error);
    throw new Error(`相似度比较失败: ${error.message}`);
  }
}

/**
 * 计算单个文本与历史文本的相似度（用于检测顽固Agent）
 * 
 * @param currentText - 当前文本
 * @param previousText - 之前的文本
 * @returns 相似度 (0-1)
 */
export async function compareSelfSimilarity(
  currentText: string,
  previousText: string
): Promise<number> {
  if (!embeddingService.isConfigured()) {
    throw new Error('Embedding服务未配置，请设置 ARK_API_KEY');
  }

  try {
    const vectors = await embeddingService.getBatchEmbeddings([currentText, previousText]);
    const similarity = cosineSimilarity(vectors[0], vectors[1]);
    
    console.log(`🔍 自相似度: ${similarity.toFixed(3)}`);
    return similarity;
  } catch (error: any) {
    console.error('❌ 自相似度计算失败:', error);
    throw new Error(`自相似度计算失败: ${error.message}`);
  }
}

/**
 * 简化版相似度比较（用于规则判断，不依赖embedding）
 * 基于关键词重叠度
 */
export function simpleTextSimilarity(textA: string, textB: string): number {
  // 分词（简单按空格和标点分割）
  const tokensA = new Set(
    textA.toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1)
  );
  
  const tokensB = new Set(
    textB.toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1)
  );

  // 计算交集
  const intersection = new Set([...tokensA].filter(x => tokensB.has(x)));
  
  // Jaccard相似度
  const union = new Set([...tokensA, ...tokensB]);
  const similarity = union.size > 0 ? intersection.size / union.size : 0;

  return similarity;
}

/**
 * 简化版批量相似度比较（fallback方案）
 */
export function simpleComparePositions(texts: string[]): {
  similarity_matrix: number[][];
  mean_similarity: number;
  most_different_pair: [number, number];
} {
  const n = texts.length;
  const matrix: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));

  // 计算相似度矩阵
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 1.0;
      } else {
        const similarity = simpleTextSimilarity(texts[i], texts[j]);
        matrix[i][j] = similarity;
        matrix[j][i] = similarity;
      }
    }
  }

  // 计算平均相似度
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      sum += matrix[i][j];
      count++;
    }
  }
  const mean_similarity = count > 0 ? sum / count : 0;

  // 找最不相似配对
  let minSimilarity = 1.0;
  let most_different_pair: [number, number] = [0, 1];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (matrix[i][j] < minSimilarity) {
        minSimilarity = matrix[i][j];
        most_different_pair = [i, j];
      }
    }
  }

  return {
    similarity_matrix: matrix,
    mean_similarity,
    most_different_pair,
  };
}

