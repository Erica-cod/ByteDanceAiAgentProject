/**
 * 请求复杂度分类器
 *
 * 通过规则层 + 可选的本地模型层，判断用户请求的复杂度等级，
 * 用于决定路由到 lite / standard / premium 远程模型，
 * 或直接由本地模型处理。
 *
 * 分类结果：
 *   'simple'    → 可用本地模型或 lite 远程模型处理
 *   'moderate'  → 用标准远程模型
 *   'complex'   → 用 premium 远程模型
 */

import type { ChatMessage } from '../../../types/chat.js';
import {
  GREETING_PATTERN,
  SIMPLE_QUESTION_PATTERN,
  COMPLEX_INDICATORS,
  MODERATE_INDICATORS,
  CLASSIFIER_THRESHOLDS,
} from '../../../config/classifierRules.js';

export type ComplexityLevel = 'simple' | 'moderate' | 'complex';

export interface ClassificationResult {
  level: ComplexityLevel;
  confidence: number;
  reason: string;
  /** 建议的远程模型 costTier：1=lite, 2=standard, 3=premium */
  suggestedTier: 1 | 2 | 3;
}

// ────────── 规则分类器 ──────────

const T = CLASSIFIER_THRESHOLDS;

function classifyByRules(text: string, _contextLength: number): ClassificationResult | null {
  const trimmed = text.trim();
  const len = trimmed.length;

  if (GREETING_PATTERN.test(trimmed)) {
    return { level: 'simple', confidence: 0.95, reason: '问候/简短回应', suggestedTier: 1 };
  }

  if (len < T.simpleMaxLength && SIMPLE_QUESTION_PATTERN.test(trimmed)) {
    return { level: 'simple', confidence: 0.85, reason: '简单知识问答', suggestedTier: 1 };
  }

  const complexMatches = COMPLEX_INDICATORS.filter(p => p.test(trimmed));
  if (complexMatches.length >= T.complexIndicatorCountThreshold || len > T.complexMinLength) {
    return { level: 'complex', confidence: 0.85, reason: `命中 ${complexMatches.length} 个复杂指标, 长度 ${len}`, suggestedTier: 3 };
  }
  if (complexMatches.length === 1) {
    return { level: 'complex', confidence: 0.7, reason: `命中复杂指标, 长度 ${len}`, suggestedTier: 3 };
  }

  const moderateMatches = MODERATE_INDICATORS.filter(p => p.test(trimmed));
  const [modMin, modMax] = T.moderateLengthRange;
  if (moderateMatches.length >= 1 || (len >= modMin && len <= modMax)) {
    return { level: 'moderate', confidence: 0.7, reason: `中等复杂度, 长度 ${len}`, suggestedTier: 2 };
  }

  if (len < T.shortMessageMaxLength) {
    return { level: 'simple', confidence: 0.6, reason: '短消息默认', suggestedTier: 1 };
  }

  return null;
}

// ────────── 对外接口 ──────────

/**
 * 对请求进行复杂度分类。
 * 目前使用纯规则方式，后续可扩展为规则 + 本地模型混合。
 */
export function classifyRequest(
  messages: ChatMessage[],
  options?: { forceLevel?: ComplexityLevel }
): ClassificationResult {
  if (options?.forceLevel) {
    const tierMap: Record<ComplexityLevel, 1 | 2 | 3> = { simple: 1, moderate: 2, complex: 3 };
    return {
      level: options.forceLevel,
      confidence: 1.0,
      reason: '用户指定',
      suggestedTier: tierMap[options.forceLevel],
    };
  }

  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUserMsg?.content) {
    return { level: 'moderate', confidence: 0.5, reason: '无用户消息，默认中等', suggestedTier: 2 };
  }

  const text = lastUserMsg.content;
  const contextLength = messages.length;

  const ruleResult = classifyByRules(text, contextLength);
  if (ruleResult && ruleResult.confidence >= T.ruleConfidenceThreshold) {
    return ruleResult;
  }

  if (contextLength > T.multiTurnMinContext && text.length < T.multiTurnShortLength) {
    return { level: 'simple', confidence: 0.65, reason: '多轮短追问', suggestedTier: 1 };
  }

  // 规则层低置信度或无结果 → 默认 moderate（保守策略）
  if (ruleResult) return ruleResult;
  return { level: 'moderate', confidence: 0.5, reason: '规则无法确定，默认中等', suggestedTier: 2 };
}
