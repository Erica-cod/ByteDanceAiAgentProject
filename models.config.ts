/**
 * 模型目录 — 在项目根目录统一管理所有 LLM 模型配置
 *
 * 新增模型只需在下方 MODEL_CONFIGS 中添加一条即可。
 * 运行时通过 .env.local 里的 OLLAMA_MODEL / ARK_MODEL 环境变量选择激活哪个模型。
 *
 * ── 字段说明 ──
 *
 *   provider:            模型提供方
 *     'ollama'             → 本地 Ollama 服务
 *     'openai-compatible'  → 兼容 OpenAI 协议的远程服务（火山引擎 / vLLM / TGI …）
 *
 *   modelName:           Ollama 或 API 中使用的模型名称
 *
 *   supportsTools:       是否支持 Function Calling（工具调用）
 *
 *   thinkingMode:        模型输出 thinking（推理过程）的方式
 *     'field'  → thinking 在 message 对象的独立字段中（如 qwen3 的 message.thinking）
 *     'tags'   → thinking 用 XML 标签嵌在 message.content 中（如 deepseek-r1 的 <think>...</think>）
 *     'none'   → 模型不输出 thinking
 *
 *   thinkingField:       仅 thinkingMode='field' 时生效
 *     message 对象中的字段名，如 'thinking' / 'reasoning' / 'reflection'
 *
 *   thinkingTag:         仅 thinkingMode='tags' 时生效
 *     XML 标签名，如 'think' 对应 <think>...</think>，'Imaging' 对应 <Imaging>...</Imaging>
 *
 *   toolCallsInStream:   tool_calls 是否可能出现在 done=false 的流式消息中
 *     true  → 需要在所有消息中检测 tool_calls（如 qwen3）
 *     false → tool_calls 只在 done=true 时出现（传统行为）
 *
 *   vramGB:              预估显存占用（GB），仅本地模型有意义
 *
 *   costTier:            成本等级（仅远程模型）
 *     1 = lite（最便宜），2 = standard，3 = premium（最贵）
 *
 *   capabilityTier:      能力等级（仅远程模型）
 *     1 = 基础对话/简单任务，2 = 通用任务，3 = 复杂推理/分析
 *
 *   description:         模型的简短描述
 */

export const MODEL_CONFIGS = {
  // ─────────────── Ollama 本地模型 ───────────────

  'qwen3:8b': {
    provider: 'ollama' as const,
    modelName: 'qwen3:8b',
    supportsTools: true,
    thinkingMode: 'field' as const,
    thinkingField: 'thinking',
    toolCallsInStream: true,
    vramGB: 5.2,
    description: 'Qwen3 8B - 支持工具调用，中文优秀，Agent 任务首选',
  },

  'deepseek-r1:7b': {
    provider: 'ollama' as const,
    modelName: 'deepseek-r1:7b',
    supportsTools: false,
    thinkingMode: 'tags' as const,
    thinkingTag: 'think',
    toolCallsInStream: false,
    vramGB: 4.7,
    description: 'DeepSeek R1 7B - 推理模型，不支持工具调用',
  },

  'deepseek-r1:1.5b': {
    provider: 'ollama' as const,
    modelName: 'deepseek-r1:1.5b',
    supportsTools: false,
    thinkingMode: 'tags' as const,
    thinkingTag: 'think',
    toolCallsInStream: false,
    vramGB: 1.2,
    description: 'DeepSeek R1 1.5B - 超轻量推理模型',
  },

  // ─────────────── 火山引擎远程模型 ───────────────

  'doubao-1-5-thinking-pro-250415': {
    provider: 'openai-compatible' as const,
    modelName: 'doubao-1-5-thinking-pro-250415',
    supportsTools: true,
    thinkingMode: 'none' as const,
    toolCallsInStream: false,
    costTier: 3 as const,
    capabilityTier: 3 as const,
    description: '豆包 1.5 思维版 - 复杂推理/分析首选',
  },

  'doubao-seed-1-6-lite-251015': {
    provider: 'openai-compatible' as const,
    modelName: 'doubao-seed-1-6-lite-251015',
    supportsTools: true,
    thinkingMode: 'none' as const,
    toolCallsInStream: false,
    costTier: 1 as const,
    capabilityTier: 1 as const,
    supportsVision: true,
    reasoningEffort: 'medium' as const,
    description: '豆包 Seed 1.6 Lite - 轻量推理，支持多模态，低成本路由首选',
  },
};

export type ModelConfigKey = keyof typeof MODEL_CONFIGS;
export type RemoteModelKey = {
  [K in ModelConfigKey]: (typeof MODEL_CONFIGS)[K]['provider'] extends 'openai-compatible' ? K : never
}[ModelConfigKey];

/**
 * 按能力等级获取远程模型配置。
 * capabilityTier: 1=lite, 2=standard, 3=premium
 */
export function getRemoteModelByTier(tier: 1 | 2 | 3) {
  const entries = Object.entries(MODEL_CONFIGS).filter(
    ([, cfg]) => cfg.provider === 'openai-compatible' && 'capabilityTier' in cfg && (cfg as any).capabilityTier === tier
  );
  return entries.length > 0 ? entries[0][1] : null;
}
