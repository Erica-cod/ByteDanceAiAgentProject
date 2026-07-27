import { cosineSimilarity } from '../../shared/utils/similarity-calculator.js';

export interface RankableMemoryItem {
  memoryId: string;
  messageId: string;
  text: string;
  importance: number;
  occurredAt: Date;
  embedding?: number[];
}

export interface RankedMemoryItem extends RankableMemoryItem {
  lexicalScore: number;
  vectorScore: number;
  rrfScore: number;
  recencyScore: number;
  finalScore: number;
}

/**
 * 为中英文混合聊天生成轻量检索词。
 * 英文保留单词/路径，中文同时保留单字和双字片段，避免整句被当成一个词。
 */
export function tokenizeForMemorySearch(text: string): string[] {
  const normalized = text.toLowerCase();
  const tokens: string[] = [
    ...(normalized.match(/[a-z0-9_@./:-]+/g) ?? []),
  ];
  const chineseSegments = normalized.match(/[\u4e00-\u9fff]+/g) ?? [];

  for (const segment of chineseSegments) {
    for (const char of segment) tokens.push(char);
    for (let index = 0; index < segment.length - 1; index++) {
      tokens.push(segment.slice(index, index + 2));
    }
  }

  return tokens.filter(Boolean);
}

/**
 * 对有限候选集计算标准 BM25。生产环境可由 Atlas Search 替代，
 * 本实现保证本地 MongoDB 7 和测试环境仍有确定性的全文检索能力。
 */
export function calculateBm25Scores(
  query: string,
  items: RankableMemoryItem[],
  k1 = 1.2,
  b = 0.75
): Map<string, number> {
  const queryTokens = Array.from(new Set(tokenizeForMemorySearch(query)));
  const documentTokens = items.map(item => tokenizeForMemorySearch(item.text));
  const averageLength =
    documentTokens.reduce((sum, tokens) => sum + tokens.length, 0) /
    Math.max(documentTokens.length, 1);
  const scores = new Map<string, number>();

  for (let documentIndex = 0; documentIndex < items.length; documentIndex++) {
    const tokens = documentTokens[documentIndex];
    const termFrequency = new Map<string, number>();
    for (const token of tokens) {
      termFrequency.set(token, (termFrequency.get(token) ?? 0) + 1);
    }

    let score = 0;
    for (const queryToken of queryTokens) {
      const matchingDocuments = documentTokens.reduce(
        (count, candidateTokens) =>
          count + (candidateTokens.includes(queryToken) ? 1 : 0),
        0
      );
      const inverseDocumentFrequency = Math.log(
        1 +
          (documentTokens.length - matchingDocuments + 0.5) /
            (matchingDocuments + 0.5)
      );
      const frequency = termFrequency.get(queryToken) ?? 0;
      if (frequency === 0) continue;

      const lengthNormalization =
        frequency +
        k1 *
          (1 -
            b +
            b * (tokens.length / Math.max(averageLength, 1)));
      score +=
        inverseDocumentFrequency *
        ((frequency * (k1 + 1)) / lengthNormalization);
    }

    scores.set(items[documentIndex].memoryId, score);
  }

  return scores;
}

export function rankHybridMemoryItems(
  query: string,
  queryEmbedding: number[] | undefined,
  items: RankableMemoryItem[],
  options: {
    limit: number;
    lexicalCandidateCount: number;
    vectorCandidateCount: number;
    recencyHalfLifeDays: number;
    weights: {
      relevance: number;
      recency: number;
      importance: number;
    };
    now?: Date;
  }
): RankedMemoryItem[] {
  if (items.length === 0) return [];

  const lexicalScores = calculateBm25Scores(query, items);
  const lexicalRanking = [...items]
    .filter(item => (lexicalScores.get(item.memoryId) ?? 0) > 0)
    .sort(
      (left, right) =>
        (lexicalScores.get(right.memoryId) ?? 0) -
        (lexicalScores.get(left.memoryId) ?? 0)
    )
    .slice(0, options.lexicalCandidateCount);

  const vectorScores = new Map<string, number>();
  const vectorRanking = queryEmbedding
    ? [...items]
        .filter(
          item =>
            Array.isArray(item.embedding) &&
            item.embedding.length === queryEmbedding.length
        )
        .map(item => {
          const score = cosineSimilarity(queryEmbedding, item.embedding!);
          vectorScores.set(item.memoryId, score);
          return item;
        })
        .sort(
          (left, right) =>
            (vectorScores.get(right.memoryId) ?? 0) -
            (vectorScores.get(left.memoryId) ?? 0)
        )
        .slice(0, options.vectorCandidateCount)
    : [];

  const rrfScores = new Map<string, number>();
  const addRanking = (ranking: RankableMemoryItem[]) => {
    ranking.forEach((item, index) => {
      rrfScores.set(
        item.memoryId,
        (rrfScores.get(item.memoryId) ?? 0) + 1 / (60 + index + 1)
      );
    });
  };
  addRanking(lexicalRanking);
  addRanking(vectorRanking);

  const candidateIds = new Set([
    ...lexicalRanking.map(item => item.memoryId),
    ...vectorRanking.map(item => item.memoryId),
  ]);
  const maximumRrfScore = Math.max(...rrfScores.values(), 1);
  const totalWeight = Math.max(
    options.weights.relevance +
      options.weights.recency +
      options.weights.importance,
    Number.EPSILON
  );
  const now = options.now ?? new Date();

  const ranked = items
    .filter(item => candidateIds.has(item.memoryId))
    .map(item => {
      const ageDays = Math.max(
        0,
        (now.getTime() - item.occurredAt.getTime()) / 86_400_000
      );
      const recencyScore =
        2 ** (-ageDays / Math.max(options.recencyHalfLifeDays, 0.1));
      const rrfScore = rrfScores.get(item.memoryId) ?? 0;
      const finalScore =
        (options.weights.relevance * (rrfScore / maximumRrfScore) +
          options.weights.recency * recencyScore +
          options.weights.importance * item.importance) /
        totalWeight;

      return {
        ...item,
        lexicalScore: lexicalScores.get(item.memoryId) ?? 0,
        vectorScore: vectorScores.get(item.memoryId) ?? 0,
        rrfScore,
        recencyScore,
        finalScore,
      };
    })
    .sort((left, right) => right.finalScore - left.finalScore);

  // 一个原始消息可能被拆成多个块，只保留得分最高的块。
  const uniqueMessages = new Map<string, RankedMemoryItem>();
  for (const item of ranked) {
    if (!uniqueMessages.has(item.messageId)) {
      uniqueMessages.set(item.messageId, item);
    }
  }

  return [...uniqueMessages.values()].slice(0, options.limit);
}
