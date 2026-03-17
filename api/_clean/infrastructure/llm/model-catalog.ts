/**
 * 模型目录 - 预置模型配置
 *
 * 新增模型只需在 MODEL_CATALOG 中添加一条配置即可。
 * 运行时通过 OLLAMA_MODEL / ARK_MODEL 环境变量选择激活哪个模型。
 */

import type { ModelConfig } from './providers/types.js';

export const MODEL_CATALOG: Record<string, ModelConfig> = {
  // ─────────────── Ollama 本地模型 ───────────────

  'qwen3:8b': {
    provider: 'ollama',
    modelName: 'qwen3:8b',
    supportsTools: true,
    vramGB: 5.2,
    description: 'Qwen3 8B - 支持工具调用，中文优秀，Agent 任务首选',
  },

  'qwen2.5:7b': {
    provider: 'ollama',
    modelName: 'qwen2.5:7b',
    supportsTools: true,
    vramGB: 4.7,
    description: 'Qwen2.5 7B - 支持工具调用，稳定可靠',
  },

  'llama3.1:8b': {
    provider: 'ollama',
    modelName: 'llama3.1:8b',
    supportsTools: true,
    vramGB: 4.7,
    description: 'Llama 3.1 8B - Meta 开源，工具调用支持好',
  },

  'mistral:7b': {
    provider: 'ollama',
    modelName: 'mistral:7b',
    supportsTools: true,
    vramGB: 4.1,
    description: 'Mistral 7B - 轻量高效，显存占用小',
  },

  'deepseek-r1:7b': {
    provider: 'ollama',
    modelName: 'deepseek-r1:7b',
    supportsTools: false,
    vramGB: 4.7,
    description: 'DeepSeek R1 7B - 推理模型，不支持工具调用',
  },

  'deepseek-r1:1.5b': {
    provider: 'ollama',
    modelName: 'deepseek-r1:1.5b',
    supportsTools: false,
    vramGB: 1.2,
    description: 'DeepSeek R1 1.5B - 超轻量推理模型',
  },

  // ─────────────── 火山引擎远程模型 ───────────────

  'doubao-1-5-thinking-pro-250415': {
    provider: 'openai-compatible',
    modelName: 'doubao-1-5-thinking-pro-250415',
    supportsTools: true,
    description: '豆包 1.5 思维版 - 推荐远程模型',
  },

  'doubao-pro-32k': {
    provider: 'openai-compatible',
    modelName: 'doubao-pro-32k',
    supportsTools: true,
    description: '豆包 Pro 32K - 长上下文',
  },

  'doubao-lite-32k': {
    provider: 'openai-compatible',
    modelName: 'doubao-lite-32k',
    supportsTools: true,
    description: '豆包 Lite 32K - 轻量快速',
  },
};

/**
 * 根据模型名查找目录配置
 * 支持精确匹配和模糊匹配（如 "qwen3:8b" 或 "qwen3-8b"）
 */
export function findModelConfig(modelName: string): ModelConfig | undefined {
  // 精确匹配
  if (MODEL_CATALOG[modelName]) {
    return MODEL_CATALOG[modelName];
  }

  // 尝试替换分隔符后匹配
  const normalized = modelName.replace(/-/g, ':').replace(/_/g, ':');
  if (MODEL_CATALOG[normalized]) {
    return MODEL_CATALOG[normalized];
  }

  // 尝试在所有配置的 modelName 中查找
  for (const config of Object.values(MODEL_CATALOG)) {
    if (config.modelName === modelName) {
      return config;
    }
  }

  return undefined;
}
