/**
 * 为已有 messages 回填 memory_items。
 *
 * 用法：
 *   npm run memory:backfill
 *   npm run memory:backfill -- --conversation=<uuid> --limit=200
 */
import { getDatabase, closeDatabase } from '../../api/db/connection.js';
import type { Message } from '../../api/db/models.js';
import { MessageEntity } from '../../api/_clean/domain/entities/message.entity.js';
import { MongoMemoryRepository } from '../../api/_clean/infrastructure/repositories/memory.repository.js';
import { ConversationMemoryIndexer } from '../../api/_clean/application/services/conversation-memory-indexer.js';
import { embeddingService } from '../../api/_clean/infrastructure/llm/embedding.service.js';

function readArgument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find(argument => argument.startsWith(prefix))?.slice(
    prefix.length
  );
}

async function main(): Promise<void> {
  const conversationId = readArgument('conversation');
  const requestedLimit = Number(readArgument('limit') ?? 1_000);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, requestedLimit)
    : 1_000;
  const db = await getDatabase();
  const messages = db.collection<Message>('messages');
  const memoryItems = db.collection('memory_items');
  const repository = new MongoMemoryRepository(embeddingService);
  const indexer = new ConversationMemoryIndexer(repository, embeddingService);

  const filter = conversationId ? { conversationId } : {};
  const candidates = await messages
    .find(filter)
    .sort({ timestamp: 1 })
    .limit(limit)
    .toArray();
  let indexed = 0;
  let skipped = 0;

  for (const message of candidates) {
    const exists = await memoryItems.countDocuments(
      { messageId: message.messageId, status: 'active' },
      { limit: 1 }
    );
    if (exists > 0) {
      skipped += 1;
      continue;
    }

    await indexer.indexMessage(MessageEntity.fromPersistence(message));
    indexed += 1;
    if (indexed % 20 === 0) {
      console.log(`🧠 已回填 ${indexed} 条消息`);
    }
  }

  console.log(
    `✅ 记忆索引回填完成：新增 ${indexed}，跳过 ${skipped}，扫描 ${candidates.length}`
  );
}

main()
  .catch(error => {
    console.error('❌ 记忆索引回填失败:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
