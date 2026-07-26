/**
 * 记忆仓储实现
 * 
 * 使用 MongoDB 直接访问消息数据
 */

import { connectToDatabase } from '../../../db/connection.js';
import type { Collection } from 'mongodb';
import type { MemoryItem, Message } from '../../../db/models.js';
import {
  IMemoryRepository,
  type HybridMemorySearchInput,
} from '../../application/interfaces/repositories/memory.repository.interface.js';
import { 
  HistoricalMessage,
  ConversationMemoryEntity 
} from '../../domain/entities/conversation-memory.entity.js';
import { embeddingService, type IEmbeddingService } from '../llm/embedding.service.js';
import {
  rankHybridMemoryItems,
  type RankableMemoryItem,
} from '../../domain/services/hybrid-memory-ranking.js';

/**
 * MongoDB 记忆仓储实现
 */
export class MongoMemoryRepository implements IMemoryRepository {
  constructor(
    private readonly embeddings: IEmbeddingService = embeddingService
  ) {}

  /**
   * 获取最近的消息（滑动窗口）
   */
  async getRecentMessages(
    conversationId: string,
    userId: string,
    limit: number
  ): Promise<HistoricalMessage[]> {
    const db = await connectToDatabase();
    const messagesCollection = db.collection<Message>('messages');

    // 查询最近的消息
    const messages = await messagesCollection
      .find({
        conversationId,
        userId,
      })
      .sort({ timestamp: -1 }) // 按时间倒序
      .limit(limit)
      .toArray();

    // 转换为 HistoricalMessage 格式并按时间正序排列
    return messages
      .reverse() // 反转为正序（从旧到新）
      .map(msg => this.toHistoricalMessage(msg));
  }

  /**
   * 查找相关消息（关键词匹配）
   */
  async findRelevantMessages(
    conversationId: string,
    userId: string,
    keywords: string[],
    excludeMessageIds: Set<string>,
    limit: number
  ): Promise<HistoricalMessage[]> {
    const db = await connectToDatabase();
    const messagesCollection = db.collection<Message>('messages');

    // 查询更多历史消息用于搜索（排除已有的）
    const allMessages = await messagesCollection
      .find({
        conversationId,
        userId,
        messageId: { $nin: Array.from(excludeMessageIds) },
      })
      .sort({ timestamp: -1 })
      .limit(100) // 搜索范围：最近 100 条
      .toArray();

    if (allMessages.length === 0) {
      return [];
    }

    // 计算每条消息的相关性分数
    const scored = allMessages.map(msg => ({
      message: msg,
      score: ConversationMemoryEntity.calculateKeywordScore(msg.content, keywords)
    }));

    // 按分数排序，取前 N 条
    const relevant = scored
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => this.toHistoricalMessage(item.message));

    return relevant;
  }

  /**
   * BM25/全文 + 向量混合召回。
   *
   * - 配置 Atlas 索引时，先由 Atlas 缩小候选集。
   * - 本地 MongoDB 7 没有 Search/Vector Search 时，读取有限候选集，
   *   在应用层执行 BM25、余弦相似度、RRF 和最终重排。
   * - Embedding 不可用时只走全文分支，不影响聊天主流程。
   */
  async findHybridRelevantMessages(
    input: HybridMemorySearchInput
  ): Promise<HistoricalMessage[]> {
    const db = await connectToDatabase();
    const collection = db.collection<MemoryItem>('memory_items');

    let queryEmbedding: number[] | undefined;
    if (this.embeddings.isConfigured()) {
      try {
        queryEmbedding = await this.embeddings.getEmbedding(input.query);
      } catch (error) {
        console.warn('⚠️ [Memory] 查询Embedding失败，降级为全文检索:', error);
      }
    }

    const scopedFilter = {
      userId: input.userId,
      conversationId: input.conversationId,
      status: 'active' as const,
      messageId: { $nin: [...input.excludeMessageIds] },
    };

    const candidateMap = new Map<string, MemoryItem>();
    const addCandidates = (items: MemoryItem[]) => {
      for (const item of items) {
        if (!input.excludeMessageIds.has(item.messageId)) {
          candidateMap.set(item.memoryId, item);
        }
      }
    };

    const [atlasLexical, atlasVector] = await Promise.all([
      this.findAtlasLexicalCandidates(collection, input),
      queryEmbedding
        ? this.findAtlasVectorCandidates(collection, input, queryEmbedding)
        : Promise.resolve([]),
    ]);
    addCandidates(atlasLexical);
    addCandidates(atlasVector);

    // 没有配置 Atlas，或 Atlas 暂时不可用时的有界降级。
    const configuredFallbackLimit = Number(
      process.env.MEMORY_FALLBACK_CANDIDATE_LIMIT ?? 500
    );
    const needsFallbackCandidates =
      candidateMap.size === 0 ||
      !process.env.MEMORY_TEXT_SEARCH_INDEX ||
      (Boolean(queryEmbedding) && !process.env.MEMORY_VECTOR_SEARCH_INDEX);
    if (needsFallbackCandidates) {
      const fallbackLimit = Math.max(
        Number.isFinite(configuredFallbackLimit)
          ? configuredFallbackLimit
          : 500,
        input.lexicalCandidateCount,
        input.vectorCandidateCount
      );
      addCandidates(
        await collection
          .find(scopedFilter)
          .sort({ occurredAt: -1 })
          .limit(fallbackLimit)
          .toArray()
      );
    }

    const rankableItems: RankableMemoryItem[] = [...candidateMap.values()].map(
      item => ({
        memoryId: item.memoryId,
        messageId: item.messageId,
        text: item.text,
        importance: item.importance,
        occurredAt: new Date(item.occurredAt),
        embedding: item.embedding,
      })
    );
    const ranked = rankHybridMemoryItems(input.query, queryEmbedding, rankableItems, {
      limit: input.limit,
      lexicalCandidateCount: input.lexicalCandidateCount,
      vectorCandidateCount: input.vectorCandidateCount,
      recencyHalfLifeDays: input.recencyHalfLifeDays,
      weights: input.weights,
    });

    const itemById = new Map(
      [...candidateMap.values()].map(item => [item.memoryId, item])
    );
    return ranked.map(item => {
      const source = itemById.get(item.memoryId)!;
      return {
        messageId: source.messageId,
        role: source.role === 'system' ? 'assistant' : source.role,
        content: source.text,
        timestamp: new Date(source.occurredAt),
      };
    });
  }

  async replaceMemoryItemsForMessage(
    messageId: string,
    userId: string,
    items: MemoryItem[]
  ): Promise<void> {
    const db = await connectToDatabase();
    const collection = db.collection<MemoryItem>('memory_items');

    await collection.updateMany(
      { messageId, userId },
      { $set: { status: 'deleted', updatedAt: new Date() } }
    );
    if (items.length === 0) return;

    await collection.bulkWrite(
      items.map(item => {
        const { createdAt, ...mutableFields } = item;
        return {
          updateOne: {
            filter: { memoryId: item.memoryId, userId: item.userId },
            update: {
              $set: mutableFields,
              $setOnInsert: { createdAt },
            },
            upsert: true,
          },
        };
      }),
      { ordered: false }
    );
  }

  /**
   * 获取对话的总消息数
   */
  async getTotalMessageCount(
    conversationId: string,
    userId: string
  ): Promise<number> {
    const db = await connectToDatabase();
    const messagesCollection = db.collection<Message>('messages');

    return await messagesCollection.countDocuments({
      conversationId,
      userId,
    });
  }

  /**
   * 将 MongoDB Message 转换为 HistoricalMessage
   */
  private toHistoricalMessage(msg: Message): HistoricalMessage {
    return {
      messageId: msg.messageId,
      role: msg.role === 'system' ? 'assistant' : msg.role,
      content: msg.content,
      timestamp: new Date(msg.timestamp),
    };
  }

  private async findAtlasLexicalCandidates(
    collection: Collection<MemoryItem>,
    input: HybridMemorySearchInput
  ): Promise<MemoryItem[]> {
    const index = process.env.MEMORY_TEXT_SEARCH_INDEX;
    if (!index) return [];

    try {
      return await collection
        .aggregate<MemoryItem>([
          {
            $search: {
              index,
              compound: {
                must: [{ text: { query: input.query, path: 'text' } }],
                filter: [
                  { equals: { path: 'userId', value: input.userId } },
                  {
                    equals: {
                      path: 'conversationId',
                      value: input.conversationId,
                    },
                  },
                  { equals: { path: 'status', value: 'active' } },
                ],
              },
            },
          },
          { $limit: input.lexicalCandidateCount },
        ])
        .toArray();
    } catch (error) {
      console.warn('⚠️ [Memory] Atlas全文检索不可用，使用本地BM25:', error);
      return [];
    }
  }

  private async findAtlasVectorCandidates(
    collection: Collection<MemoryItem>,
    input: HybridMemorySearchInput,
    queryEmbedding: number[]
  ): Promise<MemoryItem[]> {
    const index = process.env.MEMORY_VECTOR_SEARCH_INDEX;
    if (!index) return [];

    try {
      return await collection
        .aggregate<MemoryItem>([
          {
            $vectorSearch: {
              index,
              path: 'embedding',
              queryVector: queryEmbedding,
              numCandidates: Math.max(input.vectorCandidateCount * 10, 100),
              limit: input.vectorCandidateCount,
              filter: {
                userId: input.userId,
                conversationId: input.conversationId,
                status: 'active',
              },
            },
          },
        ])
        .toArray();
    } catch (error) {
      console.warn('⚠️ [Memory] Atlas向量检索不可用，使用有界余弦检索:', error);
      return [];
    }
  }
}

