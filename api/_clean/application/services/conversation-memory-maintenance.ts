import { createHash } from 'node:crypto';
import type {
  ConversationTokenState,
  MemorySummary,
} from '../../../db/models.js';
import type { HistoricalMessage } from '../../domain/entities/conversation-memory.entity.js';
import {
  calculateInputBudget,
  estimateTextTokens,
} from '../../domain/services/token-budget.js';
import type { IMemoryRepository } from '../interfaces/repositories/memory.repository.interface.js';
import { getRegistry } from '../../infrastructure/llm/providers/registry.js';
import { extractJSON } from '../../shared/utils/json-extractor.js';

const SUMMARY_VERSION = 'memory-summary-v1';

export interface TokenUsageSnapshot {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface MemorySummaryDraft {
  summary: string;
  goals: string[];
  preferences: string[];
  constraints: string[];
  model: string;
}

export interface IMemorySummaryGenerator {
  generate(messages: HistoricalMessage[]): Promise<MemorySummaryDraft>;
}

export interface RecordTurnInput {
  conversationId: string;
  userId: string;
  requestText: string;
  responseText: string;
  usage?: TokenUsageSnapshot;
  estimatedInputTokens: number;
  inputBudgetTokens?: number;
}

/**
 * The local model performs extraction only. Mongo messages remain the source
 * of truth and every persisted summary carries sourceMessageIds.
 */
export class LocalMemorySummaryAgent implements IMemorySummaryGenerator {
  async generate(messages: HistoricalMessage[]): Promise<MemorySummaryDraft> {
    const registry = getRegistry();
    const provider = registry.getByType('local');
    if (!(await provider.isAvailable())) {
      throw new Error('local summary model is unavailable');
    }

    const source = messages
      .map(
        message =>
          `[${message.messageId}] ${message.role}: ${message.content}`
      )
      .join('\n');
    const prompt = [
      'Extract durable conversation memory from the source messages.',
      'Return JSON only with this shape:',
      '{"summary":"...", "goals":[], "preferences":[], "constraints":[]}',
      'Do not invent facts. Keep identifiers, numbers, decisions, and negations.',
      'The summary must be understandable without the source text.',
      '',
      source,
    ].join('\n');

    const stream = await provider.chat(
      [
        {
          role: 'system',
          content:
            'You are a memory compression worker. Produce valid JSON only.',
        },
        { role: 'user', content: prompt },
      ],
      { temperature: 0.1, maxTokens: 900 }
    );

    const parser = registry.getStreamParser(provider);
    let buffer = '';
    let response = '';
    for await (const chunk of stream) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const parsed = parser.parseLine(line);
        if (parsed?.content) response += parsed.content;
      }
    }
    if (buffer.trim()) {
      const parsed = parser.parseLine(buffer);
      if (parsed?.content) response += parsed.content;
    }
    const parserAccumulatedContent = (
      parser as { getAccumulatedContent?: () => string }
    ).getAccumulatedContent?.();
    if (parserAccumulatedContent?.trim()) {
      response = parserAccumulatedContent;
    }

    const parsed = extractJSON<Partial<MemorySummaryDraft>>(response, {
      source: 'conversation-memory-summary',
    });
    const summary = String(parsed?.summary || '').trim();
    if (!summary) {
      throw new Error('summary model returned no usable summary');
    }

    return {
      summary,
      goals: normalizeStringArray(parsed?.goals),
      preferences: normalizeStringArray(parsed?.preferences),
      constraints: normalizeStringArray(parsed?.constraints),
      model: provider.getModelName(),
    };
  }
}

/**
 * Dual-ledger maintenance:
 * - provider usage records billable cost and the last real input pressure;
 * - raw new user/assistant text increments unsummarizedTokens;
 * - an atomic claim guarantees only one compression worker per conversation.
 */
export class ConversationMemoryMaintenanceService {
  private readonly unsummarizedThreshold: number;
  private readonly pressureThreshold: number;

  constructor(
    private readonly memoryRepository: IMemoryRepository,
    private readonly summaryGenerator: IMemorySummaryGenerator =
      new LocalMemorySummaryAgent(),
    options?: {
      unsummarizedThreshold?: number;
      pressureThreshold?: number;
    }
  ) {
    this.unsummarizedThreshold =
      options?.unsummarizedThreshold ??
      readPositiveInt(process.env.MEMORY_SUMMARY_TRIGGER_TOKENS, 4_000);
    this.pressureThreshold = Math.min(
      0.95,
      Math.max(
        0.2,
        options?.pressureThreshold ??
          Number(process.env.MEMORY_CONTEXT_PRESSURE_RATIO || 0.65)
      )
    );
  }

  async recordTurnAndSchedule(input: RecordTurnInput): Promise<void> {
    if (!this.memoryRepository.recordConversationTokenUsage) return;

    const rawDelta =
      estimateTextTokens(input.requestText) +
      estimateTextTokens(input.responseText);
    const usage = input.usage;
    const state = await this.memoryRepository.recordConversationTokenUsage({
      conversationId: input.conversationId,
      userId: input.userId,
      inputTokens: usage?.prompt_tokens ?? input.estimatedInputTokens,
      totalTokens:
        usage?.total_tokens ??
        input.estimatedInputTokens + estimateTextTokens(input.responseText),
      unsummarizedTokenDelta: rawDelta,
      source: usage ? 'provider' : 'estimated',
    });

    if (!this.shouldCompress(state, input.inputBudgetTokens)) return;
    void this.runCompression(input.conversationId, input.userId).catch(
      error => {
        console.warn('[MemorySummary] background compression failed', error);
      }
    );
  }

  shouldCompress(
    state: ConversationTokenState,
    budgetOverride?: number
  ): boolean {
    const inputBudgetTokens =
      budgetOverride && budgetOverride > 0
        ? budgetOverride
        : calculateInputBudget({
            contextWindowTokens: readPositiveInt(
              process.env.MEMORY_CONTEXT_WINDOW_TOKENS,
              16_000
            ),
            outputReserveTokens: readPositiveInt(
              process.env.MEMORY_OUTPUT_RESERVE_TOKENS,
              2_000
            ),
            safetyMarginRatio: 0.08,
          }).inputBudgetTokens;
    return (
      state.unsummarizedTokens >= this.unsummarizedThreshold ||
      state.lastInputTokens >=
        Math.floor(inputBudgetTokens * this.pressureThreshold)
    );
  }

  async runCompression(
    conversationId: string,
    userId: string
  ): Promise<void> {
    const repository = this.memoryRepository;
    if (
      !repository.claimConversationCompression ||
      !repository.getConversationTokenState ||
      !repository.getMessagesForSummary ||
      !repository.saveMemorySummary ||
      !repository.completeConversationCompression
    ) {
      return;
    }

    const claimed = await repository.claimConversationCompression(
      conversationId,
      userId,
      new Date()
    );
    if (!claimed) return;

    try {
      const state = await repository.getConversationTokenState(
        conversationId,
        userId
      );
      const candidates = await repository.getMessagesForSummary(
        conversationId,
        userId,
        state?.summarizedThroughMessageId,
        4,
        40
      );
      const messages = takeWithinTokenLimit(candidates, 4_000);
      if (messages.length < 2) {
        await repository.releaseConversationCompression?.(
          conversationId,
          userId
        );
        return;
      }

      const draft = await this.summaryGenerator.generate(messages);
      const sourceMessageIds = messages.map(message => message.messageId);
      const now = new Date();
      const sourceTokenCount = messages.reduce(
        (total, message) =>
          total +
          (message.estimatedTokens ??
            estimateTextTokens(message.content)),
        0
      );
      const summary: MemorySummary = {
        summaryId: createHash('sha256')
          .update(
            `${conversationId}:${SUMMARY_VERSION}:${sourceMessageIds.join(',')}`
          )
          .digest('hex'),
        conversationId,
        userId,
        summary: draft.summary,
        goals: draft.goals,
        preferences: draft.preferences,
        constraints: draft.constraints,
        sourceMessageIds,
        sourceFromMessageId: sourceMessageIds[0],
        sourceToMessageId: sourceMessageIds[sourceMessageIds.length - 1],
        sourceTokenCount,
        summaryTokenCount: estimateTextTokens(
          [
            draft.summary,
            ...draft.goals,
            ...draft.preferences,
            ...draft.constraints,
          ].join('\n')
        ),
        model: draft.model,
        version: SUMMARY_VERSION,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };

      await repository.saveMemorySummary(summary);
      await repository.completeConversationCompression(
        conversationId,
        userId,
        sourceTokenCount,
        summary.sourceToMessageId
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      await repository.failConversationCompression?.(
        conversationId,
        userId,
        message,
        new Date(Date.now() + 5 * 60 * 1_000)
      );
      throw error;
    }
  }
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => String(item).trim())
    .filter(Boolean)
    .slice(0, 20);
}

function takeWithinTokenLimit(
  messages: HistoricalMessage[],
  maxTokens: number
): HistoricalMessage[] {
  const selected: HistoricalMessage[] = [];
  let used = 0;
  for (const message of messages) {
    const tokens =
      message.estimatedTokens ?? estimateTextTokens(message.content);
    if (selected.length > 0 && used + tokens > maxTokens) break;
    selected.push(message);
    used += tokens;
  }
  return selected;
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : fallback;
}
