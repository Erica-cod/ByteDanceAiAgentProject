import type { IMemoryRepository } from '../../interfaces/repositories/memory.repository.interface.js';
import {
  ConversationMemoryEntity,
  type ChatMessage,
  type HistoricalMessage,
  type MemoryConfig,
} from '../../../domain/entities/conversation-memory.entity.js';
import { compressContext } from '../../../infrastructure/llm/context-compressor.js';
import {
  calculateInputBudget,
  estimateJsonTokens,
  estimateMessagesTokens,
  estimateTextTokens,
} from '../../../domain/services/token-budget.js';
import type { CompressionStatus } from '../../../../db/models.js';
import {
  selectMemoryCandidates,
  type ScoredMemoryCandidate,
} from '../../../domain/services/memory-candidate-scoring.js';

export interface GetConversationContextInput {
  conversationId: string;
  userId: string;
  currentMessage: string;
  systemPrompt: string;
  config?: Partial<MemoryConfig>;
  enableCompression?: boolean;
  tools?: unknown[];
}

export interface GetConversationContextOutput {
  context: ChatMessage[];
  stats: {
    totalMessages: number;
    recentMessages: number;
    relevantMessages: number;
    uniqueMessages: number;
    estimatedTokens: number;
    retrievalMode: 'hybrid' | 'keyword' | 'recent_only';
    compressionStatus: CompressionStatus;
    inputBudgetTokens: number;
    selectedHistoryTokens: number;
    droppedHistoryItems: number;
    usedTemporaryCompression: boolean;
  };
}

/**
 * Builds a context in priority order:
 * system/current/tool overhead -> last two complete turns -> persisted summary
 * and retrieved memory ranked by relevance/token -> stop at the budget.
 *
 * Persisted summaries are derived data only. Running/failed jobs always retain
 * a raw-message retrieval path.
 */
export class GetConversationContextUseCase {
  constructor(
    private readonly memoryRepository: IMemoryRepository
  ) {}

  async execute(
    input: GetConversationContextInput
  ): Promise<GetConversationContextOutput> {
    const memory = ConversationMemoryEntity.create(
      input.conversationId,
      input.userId,
      input.config
    );
    const config = memory.config;
    const recentMessages = await this.memoryRepository.getRecentMessages(
      input.conversationId,
      input.userId,
      config.windowSize * 2
    );

    // chat entry persists the current user message before context building.
    const history = removeDuplicatedCurrentMessage(
      recentMessages,
      input.currentMessage
    );
    const mandatoryCount = config.completeRecentRounds * 2;
    const mandatoryRecent = history.slice(-mandatoryCount);
    const olderRecent = history.slice(0, -mandatoryCount);
    const recentIds = new Set(
      history.map(message => message.messageId)
    );

    const tokenStatePromise =
      this.memoryRepository.getConversationTokenState?.(
        input.conversationId,
        input.userId
      ) ?? Promise.resolve(null);
    let retrievalMode: GetConversationContextOutput['stats']['retrievalMode'] =
      'recent_only';
    let relevantMessages: HistoricalMessage[] = [];
    let summaries: HistoricalMessage[] = [];
    let usedUnifiedScoring = false;
    const hybridSearchInput = {
      conversationId: input.conversationId,
      userId: input.userId,
      query: input.currentMessage,
      excludeMessageIds: recentIds,
      limit: config.hybridMatchCount,
      lexicalCandidateCount: config.lexicalCandidateCount,
      vectorCandidateCount: config.vectorCandidateCount,
      recencyHalfLifeDays: config.recencyHalfLifeDays,
      weights: {
        relevance: config.relevanceWeight,
        recency: config.recencyWeight,
        importance: config.importanceWeight,
      },
    };

    if (
      config.enableUnifiedMemoryScoring &&
      config.enableHybridRetrieval &&
      this.memoryRepository.findUnifiedRelevantMemories
    ) {
      const unifiedCandidates =
        await this.memoryRepository.findUnifiedRelevantMemories({
          ...hybridSearchInput,
          combinedCandidateLimit: Math.max(
            12,
            config.hybridMatchCount * 4
          ),
        });
      summaries = unifiedCandidates.filter(
        message => message.source === 'summary'
      );
      relevantMessages = unifiedCandidates.filter(
        message => message.source !== 'summary'
      );
      usedUnifiedScoring = true;
      if (unifiedCandidates.length > 0) retrievalMode = 'hybrid';
    } else if (
      config.enableHybridRetrieval &&
      this.memoryRepository.findHybridRelevantMessages
    ) {
      relevantMessages =
        await this.memoryRepository.findHybridRelevantMessages(
          hybridSearchInput
        );
      if (relevantMessages.length > 0) retrievalMode = 'hybrid';
    }

    // Raw messages are the fallback when embedding or summary generation fails.
    if (
      relevantMessages.length === 0 &&
      summaries.length === 0 &&
      config.enableKeywordMatch
    ) {
      const keywords = ConversationMemoryEntity.extractKeywords(
        input.currentMessage
      );
      if (keywords.length > 0) {
        relevantMessages =
          await this.memoryRepository.findRelevantMessages(
            input.conversationId,
            input.userId,
            keywords,
            recentIds,
            config.keywordMatchCount
          );
        if (relevantMessages.length > 0) retrievalMode = 'keyword';
      }
    }

    if (
      !usedUnifiedScoring &&
      this.memoryRepository.findRelevantMemorySummaries
    ) {
      summaries =
        await this.memoryRepository.findRelevantMemorySummaries(
          input.conversationId,
          input.userId,
          input.currentMessage,
          4
        );
    }
    const tokenState = await tokenStatePromise;
    const compressionStatus: CompressionStatus =
      tokenState?.compressionStatus ?? 'idle';
    const { inputBudgetTokens } = calculateInputBudget({
      contextWindowTokens: config.contextWindowTokens,
      outputReserveTokens: config.outputReserveTokens,
      safetyMarginRatio: config.safetyMarginRatio,
    });
    const fixedTokens =
      estimateMessagesTokens([
        { role: 'system', content: input.systemPrompt },
        { role: 'user', content: input.currentMessage },
      ]) + estimateJsonTokens(input.tools);
    const historyBudget = Math.max(0, inputBudgetTokens - fixedTokens);

    let usedTemporaryCompression = false;
    let temporarySummary: HistoricalMessage[] = [];
    const underPressure =
      (tokenState?.lastInputTokens ?? 0) >=
      Math.floor(inputBudgetTokens * 0.65);

    if (
      compressionStatus === 'running' &&
      summaries.length === 0 &&
      olderRecent.length >= 2 &&
      underPressure &&
      input.enableCompression !== false
    ) {
      const compressed = await compressContext(
        olderRecent.map(toChatMessage),
        0,
        input.conversationId
      );
      if (
        compressed.length === 1 &&
        compressed[0].role === 'system'
      ) {
        usedTemporaryCompression = true;
        temporarySummary = [
          {
            messageId: `temporary-summary:${input.conversationId}`,
            role: 'assistant',
            content: compressed[0].content,
            timestamp: olderRecent[olderRecent.length - 1].timestamp,
            source: 'temporary_summary',
            relevanceScore: 0.7,
            estimatedTokens: estimateTextTokens(compressed[0].content),
            sourceMessageIds: olderRecent.map(
              message => message.messageId
            ),
          },
        ];
      }
    }

    const candidateMessages = buildCandidates({
      compressionStatus,
      summaries,
      relevantMessages,
      olderRecent,
      temporarySummary,
    });
    const mandatoryTokens = mandatoryRecent.reduce(
      (total, message) =>
        total +
        (message.estimatedTokens ??
          estimateTextTokens(message.content)),
      0
    );
    const optionalBudget = Math.max(
      0,
      historyBudget - mandatoryTokens
    );
    const candidateById = new Map<string, HistoricalMessage>();
    const scoredCandidates: ScoredMemoryCandidate[] =
      candidateMessages.map((message, index) => {
        const id = `${message.source || 'raw'}:${message.messageId}:${index}`;
        const estimatedTokens =
          message.estimatedTokens ??
          estimateTextTokens(message.content);
        const utility =
          usedUnifiedScoring &&
          message.relevanceScore !== undefined
            ? message.relevanceScore
            : scoreMemoryCandidate(message);
        candidateById.set(id, message);
        return {
          id,
          kind:
            message.source === 'summary' ||
            message.source === 'temporary_summary'
              ? 'summary'
              : 'raw',
          content: message.content,
          occurredAt: message.timestamp,
          importance: 0,
          sourceMessageIds:
            message.sourceMessageIds ?? [message.messageId],
          estimatedTokens,
          retrievalRelevance:
            message.relevanceScore ?? utility,
          utility,
          packingScore:
            utility / Math.max(1, estimatedTokens) ** 0.7,
        };
      });
    const selection = selectMemoryCandidates(
      scoredCandidates,
      optionalBudget,
      usedUnifiedScoring ? 'unified' : 'split_baseline',
      mandatoryRecent.map(message => message.messageId)
    );
    const selectedLongTerm = selection.selected
      .map(candidate => candidateById.get(candidate.id)!)
      .sort(
        (left, right) =>
          left.timestamp.getTime() - right.timestamp.getTime()
      );
    const context: ChatMessage[] = [
      { role: 'system', content: input.systemPrompt },
      ...selectedLongTerm.map(toContextMessage),
      ...mandatoryRecent.map(toChatMessage),
      { role: 'user', content: input.currentMessage },
    ];

    return {
      context,
      stats: {
        totalMessages:
          recentMessages.length +
          relevantMessages.length +
          summaries.length,
        recentMessages: recentMessages.length,
        relevantMessages:
          relevantMessages.length + summaries.length,
        uniqueMessages: new Set(
          [
            ...recentMessages,
            ...relevantMessages,
            ...summaries,
          ].map(message => message.messageId)
        ).size,
        estimatedTokens:
          estimateMessagesTokens(context) +
          estimateJsonTokens(input.tools),
        retrievalMode,
        compressionStatus,
        inputBudgetTokens,
        selectedHistoryTokens:
          mandatoryTokens + selection.usedTokens,
        droppedHistoryItems: selection.dropped.length,
        usedTemporaryCompression,
      },
    };
  }
}

function removeDuplicatedCurrentMessage(
  messages: HistoricalMessage[],
  currentMessage: string
): HistoricalMessage[] {
  const last = messages[messages.length - 1];
  if (
    last?.role === 'user' &&
    last.content.trim() === currentMessage.trim()
  ) {
    return messages.slice(0, -1);
  }
  return messages;
}

function buildCandidates(input: {
  compressionStatus: CompressionStatus;
  summaries: HistoricalMessage[];
  relevantMessages: HistoricalMessage[];
  olderRecent: HistoricalMessage[];
  temporarySummary: HistoricalMessage[];
}): HistoricalMessage[] {
  const common = [
    ...input.summaries,
    ...input.temporarySummary,
    ...input.relevantMessages,
  ];

  if (input.compressionStatus === 'failed') {
    // Failed summary generation explicitly falls back to raw Mongo messages.
    return deduplicate([...common, ...input.olderRecent]);
  }
  if (input.compressionStatus === 'running') {
    // Existing summaries/memory remain usable while the new job is running.
    return deduplicate([
      ...common,
      ...(input.summaries.length === 0 &&
      input.temporarySummary.length === 0
        ? input.olderRecent
        : []),
    ]);
  }
  if (input.summaries.length > 0) {
    return deduplicate(common);
  }
  return deduplicate([...common, ...input.olderRecent]);
}

function deduplicate(
  messages: HistoricalMessage[]
): HistoricalMessage[] {
  const seen = new Set<string>();
  return messages.filter(message => {
    const key = `${message.source || 'raw'}:${message.messageId}:${message.content}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scoreMemoryCandidate(message: HistoricalMessage): number {
  const relevance = message.relevanceScore ?? 0.3;
  switch (message.source) {
    case 'summary':
      return 0.8 + relevance;
    case 'temporary_summary':
      return 0.75 + relevance;
    case 'memory_chunk':
      return 0.6 + relevance;
    case 'recent':
      return 0.45 + relevance;
    default:
      return 0.4 + relevance;
  }
}

function toChatMessage(message: HistoricalMessage): ChatMessage {
  return { role: message.role, content: message.content };
}

function toContextMessage(message: HistoricalMessage): ChatMessage {
  if (
    message.source === 'summary' ||
    message.source === 'temporary_summary'
  ) {
    return { role: 'system', content: message.content };
  }
  return toChatMessage(message);
}
