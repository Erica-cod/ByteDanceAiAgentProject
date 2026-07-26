/**
 * 在 MongoDB Atlas 上创建 memory_items 的全文与向量搜索索引。
 * 本地 MongoDB 7 不支持时请继续使用应用层有界降级。
 */
import { getDatabase, closeDatabase } from '../../api/db/connection.js';
import { embeddingService } from '../../api/_clean/infrastructure/llm/embedding.service.js';

const textIndexName =
  process.env.MEMORY_TEXT_SEARCH_INDEX || 'memory_text_v1';
const vectorIndexName =
  process.env.MEMORY_VECTOR_SEARCH_INDEX || 'memory_vector_v1';

async function main(): Promise<void> {
  if (!embeddingService.isConfigured()) {
    throw new Error('需要先配置 ARK_API_KEY，才能探测Embedding维度');
  }

  const probeEmbedding = await embeddingService.getEmbedding(
    'memory index dimension probe'
  );
  const db = await getDatabase();
  const collection = db.collection('memory_items');

  await collection.createSearchIndex({
    name: textIndexName,
    type: 'search',
    definition: {
      mappings: {
        dynamic: false,
        fields: {
          text: { type: 'string', analyzer: 'lucene.cjk' },
          userId: { type: 'token', normalizer: 'none' },
          conversationId: { type: 'token', normalizer: 'none' },
          status: { type: 'token', normalizer: 'none' },
        },
      },
    },
  } as any);

  await collection.createSearchIndex({
    name: vectorIndexName,
    type: 'vectorSearch',
    definition: {
      fields: [
        {
          type: 'vector',
          path: 'embedding',
          numDimensions: probeEmbedding.length,
          similarity: 'cosine',
        },
        { type: 'filter', path: 'userId' },
        { type: 'filter', path: 'conversationId' },
        { type: 'filter', path: 'status' },
      ],
    },
  } as any);

  console.log(`✅ Atlas全文索引: ${textIndexName}`);
  console.log(
    `✅ Atlas向量索引: ${vectorIndexName} (${probeEmbedding.length}维)`
  );
  console.log('请把以上两个名称写入对应环境变量后重启应用。');
}

main()
  .catch(error => {
    console.error('❌ 创建Atlas Search索引失败:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
