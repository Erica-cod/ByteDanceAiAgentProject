import { rankHybridMemoryItems } from './hybrid-memory-ranking.js';
import {
  estimateTextTokens,
} from './token-budget.js';

export type MemoryCandidateKind = 'raw' | 'summary';
export type MemoryScoringStrategy = 'split_baseline' | 'unified';

export interface MemoryScoringCandidate {
  id: string;
  kind: MemoryCandidateKind;
  content: string;
  occurredAt: Date;
  importance: number;
  sourceMessageIds: string[];
  embedding?: number[];
  estimatedTokens?: number;
}

export interface ScoredMemoryCandidate extends MemoryScoringCandidate {
  estimatedTokens: number;
  retrievalRelevance: number;
  utility: number;
  packingScore: number;
}

export interface MemorySelectionResult {
  selected: ScoredMemoryCandidate[];
  dropped: ScoredMemoryCandidate[];
  usedTokens: number;
  budgetTokens: number;
}

export interface UnifiedMemoryScoringOptions {
  recencyHalfLifeDays: number;
  weights: {
    relevance: number;
    recency: number;
    importance: number;
  };
}

const DEFAULT_UNIFIED_SCORING_OPTIONS: UnifiedMemoryScoringOptions = {
  recencyHalfLifeDays: 30,
  weights: {
    relevance: 0.7,
    recency: 0.1,
    importance: 0.2,
  },
};

const EXACT_EVIDENCE_PATTERN =
  /(具体|精确|原话|哪天|几点|日期|数字|错误码|版本号|路径|代码|deadline|exact|verbatim|error code)/i;

/**
 * Reproduces the current split baseline:
 * - raw chunks use hybrid BM25/vector/RRF relevance;
 * - summaries use lexical token overlap;
 * - type priors are applied before score/token packing.
 */
export function scoreSplitBaseline(
  query: string,
  queryEmbedding: number[] | undefined,
  candidates: MemoryScoringCandidate[],
  now = new Date()
): ScoredMemoryCandidate[] {
  const rawCandidates = candidates.filter(
    candidate => candidate.kind === 'raw'
  );
  const summaryCandidates = candidates.filter(
    candidate => candidate.kind === 'summary'
  );
  const rawRanking = rankHybridMemoryItems(
    query,
    queryEmbedding,
    rawCandidates.map(candidate => ({
      memoryId: candidate.id,
      // Candidate ids are intentionally unique: the experiment compares
      // summary/raw representations that may cover the same source message.
      messageId: candidate.id,
      text: candidate.content,
      importance: candidate.importance,
      occurredAt: candidate.occurredAt,
      embedding: candidate.embedding,
    })),
    {
      limit: rawCandidates.length,
      lexicalCandidateCount: rawCandidates.length,
      vectorCandidateCount: rawCandidates.length,
      recencyHalfLifeDays: 30,
      weights: {
        relevance: 0.7,
        recency: 0.1,
        importance: 0.2,
      },
      now,
    }
  );
  const rawRelevance = new Map(
    rawRanking.map(item => [item.memoryId, item.finalScore])
  );
  const queryTokens = new Set(tokenize(query));

  return candidates.map(candidate => {
    const estimatedTokens =
      candidate.estimatedTokens ??
      estimateTextTokens(candidate.content);
    const retrievalRelevance =
      candidate.kind === 'raw'
        ? rawRelevance.get(candidate.id) ?? 0
        : lexicalOverlap(queryTokens, new Set(tokenize(candidate.content)));
    const utility =
      (candidate.kind === 'summary' ? 0.8 : 0.6) +
      retrievalRelevance;
    return {
      ...candidate,
      estimatedTokens,
      retrievalRelevance,
      utility,
      packingScore: utility / Math.max(1, estimatedTokens),
    };
  });
}

/**
 * Scores raw chunks and summaries in one feature space.
 *
 * Both kinds use the same formula. Their different properties enter as
 * explicit features (fidelity, density, coverage), rather than incomparable
 * type-specific retrieval scores.
 */
export function scoreUnifiedCandidates(
  query: string,
  queryEmbedding: number[] | undefined,
  candidates: MemoryScoringCandidate[],
  now = new Date(),
  options: UnifiedMemoryScoringOptions =
    DEFAULT_UNIFIED_SCORING_OPTIONS
): ScoredMemoryCandidate[] {
  const ranking = rankHybridMemoryItems(
    query,
    queryEmbedding,
    candidates.map(candidate => ({
      memoryId: candidate.id,
      messageId: candidate.id,
      text: candidate.content,
      importance: candidate.importance,
      occurredAt: candidate.occurredAt,
      embedding: candidate.embedding,
    })),
    {
      limit: candidates.length,
      lexicalCandidateCount: candidates.length,
      vectorCandidateCount: candidates.length,
      recencyHalfLifeDays: options.recencyHalfLifeDays,
      weights: options.weights,
      now,
    }
  );
  const rankingById = new Map(
    ranking.map(item => [item.memoryId, item])
  );
  const requiresExactEvidence = EXACT_EVIDENCE_PATTERN.test(query);

  return candidates.map(candidate => {
    const estimatedTokens =
      candidate.estimatedTokens ??
      estimateTextTokens(candidate.content);
    const ranked = rankingById.get(candidate.id);
    const retrievalRelevance = ranked?.finalScore ?? 0;
    const hasMeaningfulRetrievalMatch =
      (ranked?.lexicalScore ?? 0) > 0 ||
      (ranked?.vectorScore ?? 0) >= 0.2;
    const fidelity =
      candidate.kind === 'raw'
        ? 1
        : requiresExactEvidence
          ? 0.15
          : 0.75;
    const informationDensity =
      candidate.kind === 'summary' ? 1 : 0.65;
    const coverage = Math.min(
      1,
      candidate.sourceMessageIds.length / 4
    );

    let utility =
      0.6 * retrievalRelevance +
      0.2 * fidelity +
      0.1 * informationDensity +
      0.1 * coverage;

    // Type/quality priors must never rescue a candidate with no lexical or
    // semantic match. This gate fixed a failure where a short irrelevant raw
    // chunk beat the exact deadline evidence solely because it was cheaper.
    if (!hasMeaningfulRetrievalMatch) utility = 0;

    // Exact dates, versions, error codes, paths, and verbatim requests should
    // not be satisfied only by a lossy derived summary.
    if (requiresExactEvidence && candidate.kind === 'summary') {
      utility *= 0.45;
    }

    return {
      ...candidate,
      estimatedTokens,
      retrievalRelevance,
      utility,
      // A sub-linear cost avoids tiny fragments winning solely by being tiny.
      packingScore:
        utility / Math.max(1, estimatedTokens) ** 0.7,
    };
  });
}

export function selectMemoryCandidates(
  scoredCandidates: ScoredMemoryCandidate[],
  budgetTokens: number,
  strategy: MemoryScoringStrategy,
  initialCoveredSourceIds: Iterable<string> = []
): MemorySelectionResult {
  const remaining = [...scoredCandidates];
  const selected: ScoredMemoryCandidate[] = [];
  const selectedIds = new Set<string>();
  const coveredSourceIds = new Set(initialCoveredSourceIds);
  const safeBudget = Math.max(0, budgetTokens);
  let usedTokens = 0;

  while (remaining.length > 0) {
    const ranked = remaining
      .map(candidate => {
        const overlapRatio =
          candidate.sourceMessageIds.length === 0
            ? 0
            : candidate.sourceMessageIds.filter(sourceId =>
                coveredSourceIds.has(sourceId)
              ).length / candidate.sourceMessageIds.length;
        const redundancyMultiplier =
          strategy === 'unified'
            ? 1 - 0.65 * overlapRatio
            : 1;
        return {
          candidate,
          adjustedPackingScore:
            candidate.packingScore * redundancyMultiplier,
        };
      })
      .sort(
        (left, right) =>
          right.adjustedPackingScore -
            left.adjustedPackingScore ||
          right.candidate.utility - left.candidate.utility
      );

    const next = ranked.find(
      item =>
        item.adjustedPackingScore > 0 &&
        usedTokens + item.candidate.estimatedTokens <= safeBudget
    );
    if (!next) break;

    selected.push(next.candidate);
    selectedIds.add(next.candidate.id);
    usedTokens += next.candidate.estimatedTokens;
    for (const sourceId of next.candidate.sourceMessageIds) {
      coveredSourceIds.add(sourceId);
    }
    remaining.splice(
      remaining.findIndex(
        candidate => candidate.id === next.candidate.id
      ),
      1
    );
  }

  return {
    selected,
    dropped: scoredCandidates.filter(
      candidate => !selectedIds.has(candidate.id)
    ),
    usedTokens,
    budgetTokens: safeBudget,
  };
}

function tokenize(text: string): string[] {
  const normalized = text.toLowerCase();
  const words = normalized.match(/[a-z0-9_@./:-]+/g) ?? [];
  const chinese = normalized.match(/[\u4e00-\u9fff]+/g) ?? [];
  const tokens = [...words];
  for (const segment of chinese) {
    for (const char of segment) tokens.push(char);
    for (let index = 0; index < segment.length - 1; index++) {
      tokens.push(segment.slice(index, index + 2));
    }
  }
  return tokens;
}

function lexicalOverlap(
  queryTokens: Set<string>,
  documentTokens: Set<string>
): number {
  if (queryTokens.size === 0) return 0.2;
  const matched = [...queryTokens].filter(token =>
    documentTokens.has(token)
  ).length;
  return matched / queryTokens.size;
}
