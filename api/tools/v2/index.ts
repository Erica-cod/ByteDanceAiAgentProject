/**
 * 可插拔工具系统 V2 - 入口文件
 */

// ============ 核心组件 ============
export * from './core/types.js';
export { toolRegistry, ToolRegistry } from './core/tool-registry.js';
export { toolExecutor, ToolExecutor } from './core/tool-executor.js';
export { toolOrchestrator, ToolOrchestrator } from './core/tool-orchestrator.js';
export { rateLimiter, RateLimiter } from './core/rate-limiter.js';
export { cacheManager, CacheManager } from './core/cache-manager.js';
export { circuitBreaker, CircuitBreaker } from './core/circuit-breaker.js';

// ============ 内置插件 ============
export { searchWebPlugin } from './plugins/search-web.plugin.js';
export {
  createPlanPlugin,
  updatePlanPlugin,
  getPlanPlugin,
  listPlansPlugin,
} from './plugins/plan-tools.plugin.js';
export {
  getCurrentTimePlugin,
  calculateDatePlugin,
  parseNaturalDatePlugin,
  compareDatesPlugin,
} from './plugins/time-tools.plugin.js';

// ============ 快速初始化 ============
import { toolRegistry } from './core/tool-registry.js';
import { rateLimiter } from './core/rate-limiter.js';
import { cacheManager } from './core/cache-manager.js';
import { circuitBreaker } from './core/circuit-breaker.js';
import { searchWebPlugin } from './plugins/search-web.plugin.js';
import {
  createPlanPlugin,
  updatePlanPlugin,
  getPlanPlugin,
  listPlansPlugin,
} from './plugins/plan-tools.plugin.js';
import {
  getCurrentTimePlugin,
  calculateDatePlugin,
  parseNaturalDatePlugin,
  compareDatesPlugin,
} from './plugins/time-tools.plugin.js';

/**
 * 初始化工具系统
 * 注册所有内置插件
 */
export function initializeToolSystem(): void {
  console.log('\n🚀 初始化可插拔工具系统 V2');
  console.log('═'.repeat(50));

  // 注册所有内置插件
  const plugins = [
    searchWebPlugin,
    createPlanPlugin,
    updatePlanPlugin,
    getPlanPlugin,
    listPlansPlugin,
    getCurrentTimePlugin,
    calculateDatePlugin,
    parseNaturalDatePlugin,
    compareDatesPlugin,
  ];

  plugins.forEach(plugin => {
    toolRegistry.register(plugin);

    // 配置限流器
    if (plugin.rateLimit) {
      rateLimiter.setConfig(plugin.metadata.name, plugin.rateLimit);
    }

    // 配置缓存
    if (plugin.cache) {
      cacheManager.setConfig(plugin.metadata.name, plugin.cache);
    }

    // 配置熔断器
    if (plugin.circuitBreaker) {
      circuitBreaker.setConfig(plugin.metadata.name, plugin.circuitBreaker);
    }
  });

  toolRegistry.printSummary();
  console.log('✅ 工具系统初始化完成\n');
}

