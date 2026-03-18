/**
 * 请求复杂度分类器 — 规则配置
 *
 * 所有用于判断请求复杂度的正则 / 关键词 / 阈值集中在此文件，
 * 方便运维人员快速调整，不需要改动分类器核心逻辑。
 */

// ────────── 闲聊 / 问候 ──────────

export const GREETING_PATTERN =
  /^(你好|hi|hello|hey|嗨|早上好|晚上好|下午好|谢谢|thanks|ok|好的|嗯|再见|bye|拜拜|晚安|早安)\s*[!！。.？?]*$/i;

// ────────── 简单问题 ──────────

export const SIMPLE_QUESTION_PATTERN =
  /^(什么是|.{2,10}是什么|怎么读|怎么写|.{2,6}的意思|翻译一下|帮我翻译|现在几点|今天星期几|今天的日期)/;

// ────────── 复杂度指标 ──────────

export const COMPLEX_INDICATORS: RegExp[] = [
  /```[\s\S]{50,}/,
  /function\s+\w+|class\s+\w+|import\s+{|const\s+\w+\s*=/,
  /详细分析|深入分析|全面分析|对比分析|系统性|方法论|战略规划/,
  /优缺点|利弊|权衡|trade-?off/i,
  /第[一二三四五六七八九十]步|step\s*\d/i,
  /如何实现.*并且|首先.*然后.*最后/,
  /列出\d{2,}|写一篇|写一份|撰写.*报告|生成.*方案/,
  /证明|推导|求解|计算.*公式|概率.*分布/,
];

export const MODERATE_INDICATORS: RegExp[] = [
  /解释一下|帮我理解|总结一下|概括/,
  /怎么做|如何|怎样|能不能/,
  /推荐|建议|对比|比较|区别/,
  /写一段|帮我写|修改一下|优化/,
];

// ────────── 阈值 ──────────

export const CLASSIFIER_THRESHOLDS = {
  /** 短于此长度 + 匹配简单模式 → simple */
  simpleMaxLength: 80,
  /** 长于此 → complex */
  complexMinLength: 800,
  /** 命中几个复杂指标即判 complex */
  complexIndicatorCountThreshold: 2,
  /** 中等长度区间 */
  moderateLengthRange: [80, 800] as [number, number],
  /** 短消息默认 simple 上限 */
  shortMessageMaxLength: 60,
  /** 多轮短追问阈值 */
  multiTurnShortLength: 100,
  multiTurnMinContext: 4,
  /** 规则可信度门槛 */
  ruleConfidenceThreshold: 0.7,
} as const;
