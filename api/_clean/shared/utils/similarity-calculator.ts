/**
 * 相似度计算工具（共享模块）
 * 
 * 提供两种相似度计算方法：
 * 1. Embedding 向量余弦相似度（高精度）
 * 2. 简单文本相似度（Jaccard相似度，fallback）
 */

/**
 * 计算余弦相似度
 * 
 * @param vecA - 向量A
 * @param vecB - 向量B
 * @returns 相似度 (0-1)
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error(`向量维度不匹配: ${vecA.length} vs ${vecB.length}`);
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
 * 简化版文本相似度（Jaccard相似度，不依赖embedding）
 * 
 * @param textA - 文本A
 * @param textB - 文本B
 * @returns 相似度 (0-1)
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
 * 
 * @param texts - 文本数组
 * @returns 相似度分析结果
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

