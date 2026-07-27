/**
 * 记忆仓储实现
 * 
 * 使用 MongoDB 直接访问消息数据
 */

import { connectToDatabase } from '../../../db/connection.js';
import type { Collection, UpdateFilter } from 'mongodb';
import type {
  ConversationTokenState,
  MemoryItem,
  MemorySummary,
  Message,
} from '../../../db/models.js';
import {
  IMemoryRepository,
  type HybridMemorySearchInput,
  type UnifiedMemorySearchInput,
} from '../../application/interfaces/repositories/memory.repository.interface.js';
import { 
  HistoricalMessage,
  ConversationMemoryEntity 
} from '../../domain/entities/conversation-memory.entity.js';
import { embeddingService, type IEmbeddingService } from '../llm/embedding.service.js';
import {
  rankHybridMemoryItems,
  tokenizeForMemorySearch,
  type RankableMemoryItem,
} from '../../domain/services/hybrid-memory-ranking.js';
import { estimateTextTokens } from '../../domain/services/token-budget.js';
import {
  scoreUnifiedCandidates,
  type MemoryScoringCandidate,
} from '../../domain/services/memory-candidate-scoring.js';

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
    const { items, queryEmbedding } =
      await this.collectHybridCandidates(collection, input);

    const rankableItems: RankableMemoryItem[] = items.map(
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
      items.map(item => [item.memoryId, item])
    );
    return ranked.map(item => {
      const source = itemById.get(item.memoryId)!;
      return {
        messageId: source.messageId,
        role: source.role === 'system' ? 'assistant' : source.role,
        content: source.text,
        timestamp: new Date(source.occurredAt),
        source: 'memory_chunk' as const,
        relevanceScore: item.finalScore,
        estimatedTokens: estimateTextTokens(source.text),
        sourceMessageIds: [source.messageId],
      };
    });
  }

  /**
   * 统一候选池：原文切片和长期摘要共享一次 query embedding、
   * 同一 BM25 + Embedding + RRF 相关性空间和同一效用公式。
   */
  async findUnifiedRelevantMemories(
    input: UnifiedMemorySearchInput
  ): Promise<HistoricalMessage[]> {
    const db = await connectToDatabase();
    const rawCollection = db.collection<MemoryItem>('memory_items');
    const summaryCollection =
      db.collection<MemorySummary>('memory_summaries');
    const [{ items, queryEmbedding }, summaries] = await Promise.all([
      this.collectHybridCandidates(rawCollection, input),
      summaryCollection
        .find({
          conversationId: input.conversationId,
          userId: input.userId,
          status: 'active',
        })
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray(),
    ]);

    const messageByCandidateId =
      new Map<string, HistoricalMessage>();
    const candidates: MemoryScoringCandidate[] = [];

    for (const item of items) {
      const candidateId = `raw:${item.memoryId}`;
      const sourceMessage: HistoricalMessage = {
        messageId: candidateId,
        role: item.role === 'system' ? 'assistant' : item.role,
        content: item.text,
        timestamp: new Date(item.occurredAt),
        source: 'memory_chunk',
        estimatedTokens: estimateTextTokens(item.text),
        sourceMessageIds: [item.messageId],
      };
      messageByCandidateId.set(candidateId, sourceMessage);
      candidates.push({
        id: candidateId,
        kind: 'raw',
        content: item.text,
        occurredAt: new Date(item.occurredAt),
        importance: item.importance,
        sourceMessageIds: [item.messageId],
        embedding: item.embedding,
        estimatedTokens: sourceMessage.estimatedTokens,
      });
    }

    for (const summary of summaries) {
      // A summary fully covered by the recent window would duplicate a
      // mandatory item. Partially overlapping summaries remain eligible and
      // are penalized later through sourceMessageIds.
      if (
        summary.sourceMessageIds.length > 0 &&
        summary.sourceMessageIds.every(messageId =>
          input.excludeMessageIds.has(messageId)
        )
      ) {
        continue;
      }
      const candidateId = `summary:${summary.summaryId}`;
      const content = formatMemorySummary(summary);
      const sourceMessage: HistoricalMessage = {
        messageId: candidateId,
        role: 'assistant',
        content,
        timestamp: new Date(summary.createdAt),
        source: 'summary',
        estimatedTokens:
          summary.summaryTokenCount || estimateTextTokens(content),
        sourceMessageIds: summary.sourceMessageIds,
      };
      messageByCandidateId.set(candidateId, sourceMessage);
      candidates.push({
        id: candidateId,
        kind: 'summary',
        content,
        occurredAt: new Date(summary.createdAt),
        importance:
          summary.importance ?? calculateSummaryImportance(summary),
        sourceMessageIds: summary.sourceMessageIds,
        embedding: summary.embedding,
        estimatedTokens: sourceMessage.estimatedTokens,
      });
    }

    return scoreUnifiedCandidates(
      input.query,
      queryEmbedding,
      candidates,
      new Date(),
      {
        recencyHalfLifeDays: input.recencyHalfLifeDays,
        weights: input.weights,
      }
    )
      .filter(candidate => candidate.utility > 0)
      .sort(
        (left, right) =>
          right.packingScore - left.packingScore ||
          right.utility - left.utility
      )
      .slice(0, Math.max(0, input.combinedCandidateLimit))
      .map(candidate => ({
        ...messageByCandidateId.get(candidate.id)!,
        relevanceScore: candidate.utility,
        estimatedTokens: candidate.estimatedTokens,
      }));
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

  async getConversationTokenState(
    conversationId: string,
    userId: string
  ): Promise<ConversationTokenState | null> {
    const db = await connectToDatabase();
    return await db
      .collection<ConversationTokenState>('conversation_token_states')
      .findOne({ conversationId, userId });
  }

  async recordConversationTokenUsage(input: {
    conversationId: string;
    userId: string;
    inputTokens: number;
    totalTokens: number;
    unsummarizedTokenDelta: number;
    source: 'provider' | 'estimated';
  }): Promise<ConversationTokenState> {
    const db = await connectToDatabase();
    const collection = db.collection<ConversationTokenState>(
      'conversation_token_states'
    );
    const now = new Date();

    await collection.updateOne(
      {
        conversationId: input.conversationId,
        userId: input.userId,
      },
      {
        $set: {
          lastInputTokens: Math.max(0, input.inputTokens),
          lastUsageSource: input.source,
          updatedAt: now,
        },
        $inc: {
          lifetimeBillableTokens: Math.max(0, input.totalTokens),
          unsummarizedTokens: Math.max(0, input.unsummarizedTokenDelta),
        },
        $setOnInsert: {
          compressionStatus: 'idle',
          compressionFailureCount: 0,
          createdAt: now,
        },
      },
      { upsert: true }
    );

    const state = await collection.findOne({
      conversationId: input.conversationId,
      userId: input.userId,
    });
    if (!state) {
      throw new Error('记录会话 token 状态后未能重新读取');
    }
    return state;
  }

  async claimConversationCompression(
    conversationId: string,
    userId: string,
    now: Date
  ): Promise<boolean> {
    const db = await connectToDatabase();
    const collection = db.collection<ConversationTokenState>(
      'conversation_token_states'
    );
    const claimed = await collection.findOneAndUpdate(
      {
        conversationId,
        userId,
        $and: [
          {
            $or: [
              { compressionStatus: { $ne: 'running' } },
              {
                compressionStartedAt: {
                  $lte: new Date(now.getTime() - 10 * 60 * 1_000),
                },
              },
            ],
          },
          {
            $or: [
              { compressionRetryAt: { $exists: false } },
              { compressionRetryAt: { $lte: now } },
            ],
          },
        ],
      },
      {
        $set: {
          compressionStatus: 'running',
          compressionStartedAt: now,
          updatedAt: now,
        },
        $unset: {
          lastCompressionError: '',
          compressionRetryAt: '',
        },
      },
      { returnDocument: 'after' }
    );
    return Boolean(claimed);
  }

  async completeConversationCompression(
    conversationId: string,
    userId: string,
    processedTokens: number,
    summarizedThroughMessageId: string
  ): Promise<void> {
    const db = await connectToDatabase();
    const collection = db.collection<ConversationTokenState>(
      'conversation_token_states'
    );
    const now = new Date();

    await collection.updateOne(
      { conversationId, userId },
      [
        {
          $set: {
            unsummarizedTokens: {
              $max: [
                0,
                {
                  $subtract: [
                    '$unsummarizedTokens',
                    Math.max(0, processedTokens),
                  ],
                },
              ],
            },
            summarizedThroughMessageId,
            compressionStatus: 'idle',
            compressionFailureCount: 0,
            updatedAt: now,
          },
        },
        {
          $unset: [
            'compressionStartedAt',
            'compressionRetryAt',
            'lastCompressionError',
          ],
        },
      ]
    );
  }

  async failConversationCompression(
    conversationId: string,
    userId: string,
    error: string,
    retryAt: Date
  ): Promise<void> {
    const db = await connectToDatabase();
    await db
      .collection<ConversationTokenState>('conversation_token_states')
      .updateOne(
        { conversationId, userId },
        {
          $set: {
            compressionStatus: 'failed',
            compressionRetryAt: retryAt,
            lastCompressionError: error.slice(0, 500),
            updatedAt: new Date(),
          },
          $inc: { compressionFailureCount: 1 },
          $unset: { compressionStartedAt: '' },
        }
      );
  }

  async releaseConversationCompression(
    conversationId: string,
    userId: string
  ): Promise<void> {
    const db = await connectToDatabase();
    await db
      .collection<ConversationTokenState>('conversation_token_states')
      .updateOne(
        { conversationId, userId },
        {
          $set: {
            compressionStatus: 'idle',
            updatedAt: new Date(),
          },
          $unset: { compressionStartedAt: '' },
        }
      );
  }

  async getMessagesForSummary(
    conversationId: string,
    userId: string,
    afterMessageId: string | undefined,
    keepRecentCount: number,
    maxMessages: number
  ): Promise<HistoricalMessage[]> {
    const db = await connectToDatabase();
    const collection = db.collection<Message>('messages');
    const filter: Record<string, any> = { conversationId, userId };

    if (afterMessageId) {
      const watermark = await collection.findOne({
        conversationId,
        userId,
        messageId: afterMessageId,
      });
      if (watermark) {
        filter.timestamp = { $gt: watermark.timestamp };
      }
    }

    const messages = await collection
      .find(filter)
      .sort({ timestamp: 1 })
      .limit(Math.max(1, maxMessages + keepRecentCount))
      .toArray();

    const compressibleCount = Math.max(0, messages.length - keepRecentCount);
    return messages
      .slice(0, Math.min(compressibleCount, maxMessages))
      .map(message => ({
        ...this.toHistoricalMessage(message),
        source: 'recent' as const,
        estimatedTokens: estimateTextTokens(message.content),
      }));
  }

  async saveMemorySummary(summary: MemorySummary): Promise<void> {
    const db = await connectToDatabase();
    const collection = db.collection<MemorySummary>('memory_summaries');
    const content = formatMemorySummary(summary);
    const enrichedSummary: MemorySummary = {
      ...summary,
      importance:
        summary.importance ?? calculateSummaryImportance(summary),
      embeddingStatus: this.embeddings.isConfigured()
        ? 'failed'
        : 'unavailable',
      embeddingVersion: 'v1',
    };

    if (this.embeddings.isConfigured()) {
      try {
        enrichedSummary.embedding =
          await this.embeddings.getEmbedding(content);
        enrichedSummary.embeddingModel = this.embeddings.getModel();
        enrichedSummary.embeddingStatus = 'ready';
      } catch (error) {
        // A summary remains useful to lexical retrieval when embedding fails.
        console.warn(
          '⚠️ [Memory] 摘要Embedding失败，保留全文检索降级:',
          error
        );
      }
    }

    await collection.updateMany(
      {
        conversationId: enrichedSummary.conversationId,
        userId: enrichedSummary.userId,
        sourceMessageIds: { $in: enrichedSummary.sourceMessageIds },
        summaryId: { $ne: enrichedSummary.summaryId },
        status: 'active',
      },
      {
        $set: {
          status: 'superseded',
          updatedAt: enrichedSummary.updatedAt,
        },
      }
    );

    const {
      createdAt,
      embedding,
      embeddingModel,
      ...mutableFields
    } = enrichedSummary;
    const update: UpdateFilter<MemorySummary> = {
      $set: {
        ...mutableFields,
        ...(enrichedSummary.embeddingStatus === 'ready' &&
        embedding &&
        embedding.length > 0
          ? { embedding, embeddingModel }
          : {}),
      },
      $setOnInsert: { createdAt },
    };
    if (
      enrichedSummary.embeddingStatus !== 'ready' ||
      !embedding ||
      embedding.length === 0
    ) {
      // Never leave an older embedding attached to newer summary text.
      update.$unset = {
        embedding: '',
        embeddingModel: '',
      };
    }
    await collection.updateOne(
      { summaryId: enrichedSummary.summaryId },
      update,
      { upsert: true }
    );
  }

  async findRelevantMemorySummaries(
    conversationId: string,
    userId: string,
    query: string,
    limit: number
  ): Promise<HistoricalMessage[]> {
    const db = await connectToDatabase();
    const summaries = await db
      .collection<MemorySummary>('memory_summaries')
      .find({
        conversationId,
        userId,
        status: 'active',
      })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    const queryTokens = new Set(tokenizeForMemorySearch(query));
    return summaries
      .map(summary => {
        const content = formatMemorySummary(summary);
        const summaryTokens = new Set(tokenizeForMemorySearch(content));
        const matches = [...queryTokens].filter(token =>
          summaryTokens.has(token)
        ).length;
        const relevanceScore =
          queryTokens.size === 0 ? 0.2 : matches / queryTokens.size;
        return {
          messageId: summary.summaryId,
          role: 'assistant' as const,
          content,
          timestamp: new Date(summary.createdAt),
          source: 'summary' as const,
          relevanceScore,
          estimatedTokens: summary.summaryTokenCount,
          sourceMessageIds: summary.sourceMessageIds,
        };
      })
      .sort(
        (left, right) =>
          (right.relevanceScore ?? 0) - (left.relevanceScore ?? 0) ||
          right.timestamp.getTime() - left.timestamp.getTime()
      )
      .slice(0, Math.max(0, limit));
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

  private async collectHybridCandidates(
    collection: Collection<MemoryItem>,
    input: HybridMemorySearchInput
  ): Promise<{
    items: MemoryItem[];
    queryEmbedding?: number[];
  }> {
    let queryEmbedding: number[] | undefined;
    if (this.embeddings.isConfigured()) {
      try {
        queryEmbedding = await this.embeddings.getEmbedding(input.query);
      } catch (error) {
        console.warn(
          '⚠️ [Memory] 查询Embedding失败，降级为全文检索:',
          error
        );
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
        ? this.findAtlasVectorCandidates(
            collection,
            input,
            queryEmbedding
          )
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
      (Boolean(queryEmbedding) &&
        !process.env.MEMORY_VECTOR_SEARCH_INDEX);
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

    return {
      items: [...candidateMap.values()],
      queryEmbedding,
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

function formatMemorySummary(summary: MemorySummary): string {
  const sections = [`[长期记忆摘要] ${summary.summary}`];
  if (summary.goals.length > 0) {
    sections.push(`目标：${summary.goals.join('；')}`);
  }
  if (summary.preferences.length > 0) {
    sections.push(`偏好：${summary.preferences.join('；')}`);
  }
  if (summary.constraints.length > 0) {
    sections.push(`约束：${summary.constraints.join('；')}`);
  }
  return sections.join('\n');
}

function calculateSummaryImportance(
  summary: MemorySummary
): number {
  const structuredFacts =
    summary.goals.length +
    summary.preferences.length +
    summary.constraints.length;
  const sourceCoverage = Math.min(
    0.2,
    summary.sourceMessageIds.length * 0.025
  );
  return Math.min(
    1,
    0.55 + Math.min(0.25, structuredFacts * 0.05) + sourceCoverage
  );
}

