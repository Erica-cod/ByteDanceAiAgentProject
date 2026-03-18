/**
 * 模型目录 — 加载根目录 models.config.ts 并提供类型安全的查找接口
 *
 * 模型配置数据统一维护在项目根目录的 models.config.ts 中，
 * 新增/修改模型无需深入此处，直接编辑根目录文件即可。
 */

import type { ModelConfig } from './providers/types.js';
import { MODEL_CONFIGS } from '../../../../models.config.js';

export const MODEL_CATALOG: Record<string, ModelConfig> = MODEL_CONFIGS;

/**
 * 根据模型名查找目录配置
 * 支持精确匹配和模糊匹配（如 "qwen3:8b" 或 "qwen3-8b"）
 */
export function findModelConfig(modelName: string): ModelConfig | undefined {
  if (MODEL_CATALOG[modelName]) {
    return MODEL_CATALOG[modelName];
  }

  const normalized = modelName.replace(/-/g, ':').replace(/_/g, ':');
  if (MODEL_CATALOG[normalized]) {
    return MODEL_CATALOG[normalized];
  }

  for (const config of Object.values(MODEL_CATALOG)) {
    if (config.modelName === modelName) {
      return config;
    }
  }

  return undefined;
}
