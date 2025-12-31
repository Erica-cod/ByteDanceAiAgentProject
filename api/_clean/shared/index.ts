/**
 * 共享模块导出
 * 
 * 统一导出所有共享的工具和服务
 */

// Embedding 服务
export { 
  embeddingService,
  VolcengineEmbeddingService,
  type IEmbeddingService 
} from '../infrastructure/llm/embedding.service.js';

// 相似度计算工具
export {
  cosineSimilarity,
  calculateSimilarityMatrix,
  simpleTextSimilarity,
  simpleComparePositions
} from './utils/similarity-calculator.js';

// 内容提取工具
export {
  extractThinkingAndContent
} from './utils/content-extractor.js';

// JSON 提取工具
export {
  extractToolCall,
  extractToolCallWithRemainder
} from './utils/json-extractor.js';

