/**
 * 相似度工具 - 用于多Agent协作中的立场比较
 * 
 * 功能：
 * - 文本向量化（使用火山引擎的embedding模型）
 * - 计算余弦相似度
 * - 生成相似度矩阵
 * - 检测最不相似的配对
 * 
 * ✅ 已重构：使用共享的 embedding 服务和相似度计算工具
 */

import { embeddingService } from '../_clean/infrastructure/llm/embedding.service.js';
import { 
  cosineSimilarity, 
  calculateSimilarityMatrix,
  simpleTextSimilarity,
  simpleComparePositions
} from '../_clean/shared/utils/similarity-calculator.js';

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

// ✅ 导出共享工具函数（保持向后兼容）
export { cosineSimilarity, calculateSimilarityMatrix, simpleTextSimilarity, simpleComparePositions };

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

