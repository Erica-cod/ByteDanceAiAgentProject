import { describe, expect, jest, test } from '@jest/globals';
import {
  calculateInputBudget,
  packHistoryWithinBudget,
} from '../../api/_clean/domain/services/token-budget.js';
import {
  ConversationMemoryMaintenanceService,
  type IMemorySummaryGenerator,
} from '../../api/_clean/application/services/conversation-memory-maintenance.js';
import type { IMemoryRepository } from '../../api/_clean/application/interfaces/repositories/memory.repository.interface.js';
import { OpenAIStreamAdapter } from '../../api/handlers/stream-adapter.js';
import { OllamaStreamParser } from '../../api/_clean/infrastructure/llm/stream-parsers/ollama-stream-parser.js';
import { GetConversationContextUseCase } from '../../api/_clean/application/use-cases/memory/get-conversation-context.use-case.js';

describe('conversation memory token budget', () => {
  test('reserves output and safety margin before packing history', () => {
    expect(
      calculateInputBudget({
        contextWindowTokens: 10_000,
        outputReserveTokens: 2_000,
        safetyMarginRatio: 0.1,
      })
    ).toEqual({
      inputBudgetTokens: 7_000,
      safetyMarginTokens: 1_000,
    });
  });

  test('always keeps mandatory recent messages and ranks optional memory by value per token', () => {
    const now = new Date();
    const result = packHistoryWithinBudget(
      [
        {
          id: 'recent',
          value: 'recent',
          content: 'last complete turn',
          score: 10,
          occurredAt: now,
        },
      ],
      [
        {
          id: 'dense',
          value: 'dense',
          content: 'important preference',
          score: 1,
          occurredAt: now,
        },
        {
          id: 'verbose',
          value: 'verbose',
          content: 'low value '.repeat(200),
          score: 0.2,
          occurredAt: now,
        },
      ],
      30
    );

    expect(result.selected).toEqual(['recent', 'dense']);
    expect(result.droppedIds).toContain('verbose');
  });
});

describe('conversation memory compression worker', () => {
  test('persists a derived summary with source ids and advances the watermark without deleting raw messages', async () => {
    let savedSummary: any;
    let completed: any;
    const rawMessages = [
      {
        messageId: 'msg-1',
        role: 'user' as const,
        content: 'My goal is a frontend role.',
        timestamp: new Date('2026-07-20T00:00:00Z'),
        estimatedTokens: 8,
      },
      {
        messageId: 'msg-2',
        role: 'assistant' as const,
        content: 'We will prioritize React interview practice.',
        timestamp: new Date('2026-07-20T00:01:00Z'),
        estimatedTokens: 10,
      },
    ];
    const repository = {
      getRecentMessages: jest.fn(),
      findRelevantMessages: jest.fn(),
      getTotalMessageCount: jest.fn(),
      claimConversationCompression: jest.fn(async () => true),
      getConversationTokenState: jest.fn(async () => ({
        conversationId: 'conv',
        userId: 'user',
        lastInputTokens: 7_200,
        lifetimeBillableTokens: 32_500,
        unsummarizedTokens: 4_600,
        compressionStatus: 'running' as const,
        compressionFailureCount: 0,
        lastUsageSource: 'provider' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      getMessagesForSummary: jest.fn(async () => rawMessages),
      saveMemorySummary: jest.fn(async summary => {
        savedSummary = summary;
      }),
      completeConversationCompression: jest.fn(
        async (...args: any[]) => {
          completed = args;
        }
      ),
    } as unknown as IMemoryRepository;
    const generator: IMemorySummaryGenerator = {
      generate: jest.fn(async () => ({
        summary: 'User targets a frontend role and will practice React.',
        goals: ['frontend role'],
        preferences: ['React practice'],
        constraints: [],
        model: 'test-model',
      })),
    };
    const service = new ConversationMemoryMaintenanceService(
      repository,
      generator
    );

    await service.runCompression('conv', 'user');

    expect(savedSummary.sourceMessageIds).toEqual(['msg-1', 'msg-2']);
    expect(savedSummary.status).toBe('active');
    expect(completed).toEqual(['conv', 'user', 18, 'msg-2']);
    expect((repository as any).deleteMessages).toBeUndefined();
  });
});

describe('provider usage parsing', () => {
  test('waits for the OpenAI usage-only chunk before reporting done', () => {
    const adapter = new OpenAIStreamAdapter();
    expect(
      adapter.parseLine(
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}'
      )
    ).toBeNull();
    const done = adapter.parseLine(
      'data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":3,"total_tokens":15}}'
    );
    expect(done).toMatchObject({
      done: true,
      finishReason: 'stop',
      tokenUsage: {
        prompt_tokens: 12,
        completion_tokens: 3,
        total_tokens: 15,
      },
    });
  });

  test('maps Ollama prompt_eval_count and eval_count to the same usage shape', () => {
    const parser = new OllamaStreamParser();
    expect(
      parser.parseLine(
        JSON.stringify({
          done: true,
          message: { content: '' },
          prompt_eval_count: 20,
          eval_count: 5,
        })
      )
    ).toMatchObject({
      done: true,
      tokenUsage: {
        prompt_tokens: 20,
        completion_tokens: 5,
        total_tokens: 25,
      },
    });
  });
});

describe('context fallback while background memory is unavailable', () => {
  test('uses existing summary and recent two turns without waiting for a running job', async () => {
    const repository = createContextRepository({
      compressionStatus: 'running',
      summaries: [
        {
          messageId: 'summary-1',
          role: 'assistant',
          content: '[long-term summary] prefers TypeScript',
          timestamp: new Date('2026-07-01'),
          source: 'summary',
          relevanceScore: 1,
        },
      ],
      relevant: [
        {
          messageId: 'huge-low-value',
          role: 'assistant',
          content: 'irrelevant '.repeat(1_000),
          timestamp: new Date('2026-07-02'),
          source: 'memory_chunk',
          relevanceScore: 0.01,
        },
      ],
    });
    const result = await new GetConversationContextUseCase(
      repository
    ).execute({
      conversationId: 'conv',
      userId: 'user',
      currentMessage: 'current question',
      systemPrompt: 'system',
      enableCompression: false,
      config: {
        windowSize: 10,
        completeRecentRounds: 2,
        contextWindowTokens: 300,
        outputReserveTokens: 50,
        safetyMarginRatio: 0,
      },
    });

    expect(result.stats.compressionStatus).toBe('running');
    expect(result.context.map(message => message.content)).toContain(
      '[long-term summary] prefers TypeScript'
    );
    expect(result.context.map(message => message.content)).not.toContain(
      'irrelevant '.repeat(1_000)
    );
    expect(
      result.context.filter(message =>
        message.content.startsWith('recent-')
      )
    ).toHaveLength(4);
  });

  test('falls back to retrieved raw memory when summary generation failed', async () => {
    const repository = createContextRepository({
      compressionStatus: 'failed',
      summaries: [],
      relevant: [
        {
          messageId: 'raw-fact',
          role: 'user',
          content: 'raw Mongo fact: deadline is Friday',
          timestamp: new Date('2026-06-01'),
          source: 'memory_chunk',
          relevanceScore: 1,
        },
      ],
    });
    const result = await new GetConversationContextUseCase(
      repository
    ).execute({
      conversationId: 'conv',
      userId: 'user',
      currentMessage: 'current question',
      systemPrompt: 'system',
      enableCompression: false,
      config: {
        windowSize: 10,
        completeRecentRounds: 2,
        contextWindowTokens: 500,
        outputReserveTokens: 50,
        safetyMarginRatio: 0,
      },
    });

    expect(result.stats.compressionStatus).toBe('failed');
    expect(result.context.map(message => message.content)).toContain(
      'raw Mongo fact: deadline is Friday'
    );
  });
});

function createContextRepository(options: {
  compressionStatus: 'running' | 'failed';
  summaries: any[];
  relevant: any[];
}): IMemoryRepository {
  const recent = [
    'old-user',
    'old-assistant',
    'recent-user-1',
    'recent-assistant-1',
    'recent-user-2',
    'recent-assistant-2',
  ].map((content, index) => ({
    messageId: `message-${index}`,
    role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
    content,
    timestamp: new Date(Date.UTC(2026, 6, 20, 0, index)),
    source: 'recent' as const,
  }));
  return {
    async getRecentMessages() {
      return [
        ...recent,
        {
          messageId: 'current',
          role: 'user',
          content: 'current question',
          timestamp: new Date('2026-07-21'),
        },
      ];
    },
    async findRelevantMessages() {
      return options.relevant;
    },
    async findHybridRelevantMessages() {
      return options.relevant;
    },
    async findRelevantMemorySummaries() {
      return options.summaries;
    },
    async getConversationTokenState() {
      return {
        conversationId: 'conv',
        userId: 'user',
        lastInputTokens: 50,
        lifetimeBillableTokens: 100,
        unsummarizedTokens: 100,
        compressionStatus: options.compressionStatus,
        compressionFailureCount: 0,
        lastUsageSource: 'provider',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    },
    async getTotalMessageCount() {
      return recent.length;
    },
  };
}
