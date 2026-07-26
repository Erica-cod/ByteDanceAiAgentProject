import { describe, expect, test } from '@jest/globals';
import {
  calculateBm25Scores,
  rankHybridMemoryItems,
} from '../../api/_clean/domain/services/hybrid-memory-ranking.js';
import {
  calculateImportance,
  splitMessage,
} from '../../api/_clean/application/services/conversation-memory-indexer.js';
import { GetConversationContextUseCase } from '../../api/_clean/application/use-cases/memory/get-conversation-context.use-case.js';
import type { IMemoryRepository } from '../../api/_clean/application/interfaces/repositories/memory.repository.interface.js';

describe('hybrid conversation memory', () => {
  test('BM25应优先精确命中的技术术语', () => {
    const items = [
      {
        memoryId: 'a',
        messageId: 'a',
        text: 'React 前端性能优化和渲染问题',
        importance: 0.5,
        occurredAt: new Date(),
      },
      {
        memoryId: 'b',
        messageId: 'b',
        text: '今天讨论数据库备份',
        importance: 0.5,
        occurredAt: new Date(),
      },
    ];

    const scores = calculateBm25Scores('React 性能', items);
    expect(scores.get('a')).toBeGreaterThan(scores.get('b') ?? 0);
  });

  test('混合排序应同时保留全文命中和语义命中', () => {
    const items = [
      {
        memoryId: 'lexical',
        messageId: 'lexical-message',
        text: 'React 性能优化',
        importance: 0.4,
        occurredAt: new Date('2026-07-20'),
        embedding: [0, 1],
      },
      {
        memoryId: 'semantic',
        messageId: 'semantic-message',
        text: '减少组件重复渲染',
        importance: 0.8,
        occurredAt: new Date('2026-07-01'),
        embedding: [1, 0],
      },
    ];

    const ranked = rankHybridMemoryItems('React 性能', [1, 0], items, {
      limit: 2,
      lexicalCandidateCount: 2,
      vectorCandidateCount: 2,
      recencyHalfLifeDays: 30,
      weights: { relevance: 0.7, recency: 0.1, importance: 0.2 },
      now: new Date('2026-07-27'),
    });

    expect(ranked.map(item => item.messageId)).toEqual(
      expect.arrayContaining(['lexical-message', 'semantic-message'])
    );
  });

  test('Embedding不可用时仍应通过BM25完成降级召回', () => {
    const ranked = rankHybridMemoryItems(
      '缓存击穿',
      undefined,
      [
        {
          memoryId: 'cache',
          messageId: 'cache-message',
          text: '缓存击穿需要使用singleflight或互斥锁',
          importance: 0.7,
          occurredAt: new Date(),
        },
        {
          memoryId: 'other',
          messageId: 'other-message',
          text: 'React组件渲染',
          importance: 0.7,
          occurredAt: new Date(),
        },
      ],
      {
        limit: 1,
        lexicalCandidateCount: 5,
        vectorCandidateCount: 5,
        recencyHalfLifeDays: 30,
        weights: { relevance: 0.7, recency: 0.1, importance: 0.2 },
      }
    );

    expect(ranked[0].messageId).toBe('cache-message');
  });

  test('长消息切块有重叠，显式偏好拥有更高重要性', () => {
    const chunks = splitMessage('a'.repeat(2_000), 1_000, 100);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(1_000);
    expect(calculateImportance('user', '请记住我以后必须使用 TypeScript'))
      .toBeGreaterThan(calculateImportance('assistant', '普通说明'));
  });

  test('已入库的本轮用户消息不应在最终上下文重复', async () => {
    const repository: IMemoryRepository = {
      async getRecentMessages() {
        return [
          {
            messageId: 'old',
            role: 'assistant',
            content: '上一轮回答',
            timestamp: new Date('2026-07-26'),
          },
          {
            messageId: 'current',
            role: 'user',
            content: '当前问题',
            timestamp: new Date('2026-07-27'),
          },
        ];
      },
      async findRelevantMessages() {
        return [];
      },
      async getTotalMessageCount() {
        return 2;
      },
    };
    const useCase = new GetConversationContextUseCase(repository);

    const result = await useCase.execute({
      conversationId: 'conversation',
      userId: 'user',
      currentMessage: '当前问题',
      systemPrompt: 'system',
      enableCompression: false,
      config: {
        windowSize: 2,
        enableHybridRetrieval: false,
        enableKeywordMatch: false,
      },
    });

    expect(
      result.context.filter(message => message.content === '当前问题')
    ).toHaveLength(1);
  });
});
