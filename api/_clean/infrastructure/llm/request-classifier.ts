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

export type ComplexityLevel = 'simple' | 'moderate' | 'complex';

export interface ClassificationResult {
  level: ComplexityLevel;
  confidence: number;
  reason: string;
  /** 建议的远程模型 costTier：1=lite, 2=standard, 3=premium */
  suggestedTier: 1 | 2 | 3;
}

// ────────── 关键词集合 ──────────

const GREETING_PATTERNS = /^(你好|hi|hello|hey|嗨|早上好|晚上好|下午好|谢谢|thanks|ok|好的|嗯|再见|bye|拜拜|晚安|早安)\s*[!！。.？?]*$/i;

const SIMPLE_QUESTION_PATTERNS = /^(什么是|.{2,10}是什么|怎么读|怎么写|.{2,6}的意思|翻译一下|帮我翻译|现在几点|今天星期几|今天的日期)/;

const COMPLEX_INDICATORS = [
  // 代码相关
  /```[\s\S]{50,}/,
  /function\s+\w+|class\s+\w+|import\s+{|const\s+\w+\s*=/,
  // 深度分析
  /详细分析|深入分析|全面分析|对比分析|系统性|方法论|战略规划/,
  /优缺点|利弊|权衡|trade-?off/i,
  // 多步推理
  /第[一二三四五六七八九十]步|step\s*\d/i,
  /如何实现.*并且|首先.*然后.*最后/,
  // 长列表 / 结构化输出要求
  /列出\d{2,}|写一篇|写一份|撰写.*报告|生成.*方案/,
  // 数学 / 逻辑
  /证明|推导|求解|计算.*公式|概率.*分布/,
];

const MODERATE_INDICATORS = [
  /解释一下|帮我理解|总结一下|概括/,
  /怎么做|如何|怎样|能不能/,
  /推荐|建议|对比|比较|区别/,
  /写一段|帮我写|修改一下|优化/,
];

// ────────── 规则分类器 ──────────

function classifyByRules(text: string, contextLength: number): ClassificationResult | null {
  const trimmed = text.trim();
  const len = trimmed.length;

  // 极短问候
  if (GREETING_PATTERNS.test(trimmed)) {
    return { level: 'simple', confidence: 0.95, reason: '问候/简短回应', suggestedTier: 1 };
  }

  // 简单问题模式
  if (len < 80 && SIMPLE_QUESTION_PATTERNS.test(trimmed)) {
    return { level: 'simple', confidence: 0.85, reason: '简单知识问答', suggestedTier: 1 };
  }

  // 检查复杂度指标
  const complexMatches = COMPLEX_INDICATORS.filter(p => p.test(trimmed));
  if (complexMatches.length >= 2 || len > 800) {
    return { level: 'complex', confidence: 0.85, reason: `命中 ${complexMatches.length} 个复杂指标, 长度 ${len}`, suggestedTier: 3 };
  }
  if (complexMatches.length === 1) {
    return { level: 'complex', confidence: 0.7, reason: `命中复杂指标, 长度 ${len}`, suggestedTier: 3 };
  }

  // 中等复杂度指标
  const moderateMatches = MODERATE_INDICATORS.filter(p => p.test(trimmed));
  if (moderateMatches.length >= 1 || (len >= 80 && len <= 800)) {
    return { level: 'moderate', confidence: 0.7, reason: `中等复杂度, 长度 ${len}`, suggestedTier: 2 };
  }

  // 短消息默认 simple
  if (len < 60) {
    return { level: 'simple', confidence: 0.6, reason: '短消息默认', suggestedTier: 1 };
  }

  return null; // 规则无法确定
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

  // 规则层
  const ruleResult = classifyByRules(text, contextLength);
  if (ruleResult && ruleResult.confidence >= 0.7) {
    return ruleResult;
  }

  // 多轮对话的追问通常比较简单（基于已有上下文的短追问）
  if (contextLength > 4 && text.length < 100) {
    return { level: 'simple', confidence: 0.65, reason: '多轮短追问', suggestedTier: 1 };
  }

  // 规则层低置信度或无结果 → 默认 moderate（保守策略）
  if (ruleResult) return ruleResult;
  return { level: 'moderate', confidence: 0.5, reason: '规则无法确定，默认中等', suggestedTier: 2 };
}
