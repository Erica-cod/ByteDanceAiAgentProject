export interface TokenCountableMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface TokenBudgetCandidate<T> {
  id: string;
  value: T;
  content: string;
  score: number;
  occurredAt: Date;
}

export interface TokenBudgetResult<T> {
  selected: T[];
  selectedIds: string[];
  droppedIds: string[];
  usedTokens: number;
  budgetTokens: number;
  overflowedByTokens: number;
}

/**
 * 没有供应商 tokenizer 时的保守估算。
 * 中文按接近 1 字/token，ASCII 文本按约 4 字符/token，并保留消息包装开销。
 * API 返回的真实 usage 仍然是记账和后续校准的优先数据源。
 */
export function estimateTextTokens(text: string): number {
  if (!text) return 0;

  const cjkCount = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) ?? []).length;
  const remainingLength = Math.max(0, text.length - cjkCount);
  return Math.max(1, cjkCount + Math.ceil(remainingLength / 4));
}

export function estimateMessageTokens(message: TokenCountableMessage): number {
  // role、分隔符等聊天协议开销使用一个小的保守常量。
  return estimateTextTokens(message.content) + 4;
}

export function estimateMessagesTokens(
  messages: TokenCountableMessage[]
): number {
  return messages.reduce(
    (total, message) => total + estimateMessageTokens(message),
    0
  );
}

export function estimateJsonTokens(value: unknown): number {
  if (value === undefined || value === null) return 0;
  return estimateTextTokens(JSON.stringify(value));
}

export function calculateInputBudget(options: {
  contextWindowTokens: number;
  outputReserveTokens: number;
  safetyMarginRatio: number;
}): {
  inputBudgetTokens: number;
  safetyMarginTokens: number;
} {
  const contextWindowTokens = Math.max(1, options.contextWindowTokens);
  const outputReserveTokens = Math.max(0, options.outputReserveTokens);
  const safetyMarginTokens = Math.ceil(
    contextWindowTokens *
      Math.min(0.3, Math.max(0, options.safetyMarginRatio))
  );

  return {
    inputBudgetTokens: Math.max(
      1,
      contextWindowTokens - outputReserveTokens - safetyMarginTokens
    ),
    safetyMarginTokens,
  };
}

/**
 * 在给定 token 预算内装入历史候选。
 *
 * mandatory 通常是最近两轮原文，始终优先；普通候选按照
 * “相关性价值 / token 成本”排序，避免一条很长的低密度记忆挤满上下文。
 */
export function packHistoryWithinBudget<T>(
  mandatory: TokenBudgetCandidate<T>[],
  candidates: TokenBudgetCandidate<T>[],
  budgetTokens: number
): TokenBudgetResult<T> {
  const safeBudget = Math.max(0, budgetTokens);
  const selected: T[] = [];
  const selectedIds: string[] = [];
  const selectedIdSet = new Set<string>();
  let usedTokens = 0;

  for (const item of mandatory) {
    if (selectedIdSet.has(item.id)) continue;
    selected.push(item.value);
    selectedIds.push(item.id);
    selectedIdSet.add(item.id);
    usedTokens += estimateTextTokens(item.content) + 4;
  }

  const ranked = [...candidates]
    .filter(item => !selectedIdSet.has(item.id))
    .sort((left, right) => {
      const leftCost = Math.max(1, estimateTextTokens(left.content));
      const rightCost = Math.max(1, estimateTextTokens(right.content));
      const valuePerTokenDelta =
        right.score / rightCost - left.score / leftCost;
      if (Math.abs(valuePerTokenDelta) > Number.EPSILON) {
        return valuePerTokenDelta;
      }
      if (right.score !== left.score) return right.score - left.score;
      return right.occurredAt.getTime() - left.occurredAt.getTime();
    });

  for (const item of ranked) {
    const itemTokens = estimateTextTokens(item.content) + 4;
    if (usedTokens + itemTokens > safeBudget) continue;
    selected.push(item.value);
    selectedIds.push(item.id);
    selectedIdSet.add(item.id);
    usedTokens += itemTokens;
  }

  return {
    selected,
    selectedIds,
    droppedIds: [
      ...mandatory,
      ...candidates,
    ]
      .filter(item => !selectedIdSet.has(item.id))
      .map(item => item.id),
    usedTokens,
    budgetTokens: safeBudget,
    overflowedByTokens: Math.max(0, usedTokens - safeBudget),
  };
}
