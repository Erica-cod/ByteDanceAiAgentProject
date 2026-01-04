/**
 * 可插拔工具系统 V2 - 入口文件
 */

// ============ 核心组件 ============
export * from './core/types.js';
export { toolRegistry, ToolRegistry } from './core/registry/tool-registry.js';
export { toolExecutor, ToolExecutor } from './core/execution/tool-executor.js';
export { toolOrchestrator, ToolOrchestrator } from './core/execution/tool-orchestrator.js';
export { rateLimiter, RateLimiter } from './core/limits/rate-limiter.js';
export { cacheManager, CacheManager } from './core/cache/cache-manager.js';
export { circuitBreaker, CircuitBreaker } from './core/resilience/circuit-breaker.js';
export { toolRuntime, ToolRuntime } from './core/runtime/tool-runtime.js';
export { CompositeCircuitBreaker } from './core/resilience/composite-circuit-breaker.js';
export { HttpStatusCircuitBreaker, httpStatusCircuitBreaker } from './core/resilience/http-status-breaker.js';

// ============ 通信协议（可插拔） ============
export * from './protocols/types.js';
export { toolCallProtocolRegistry, ToolCallProtocolRegistry } from './protocols/protocol-registry.js';

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
import { toolRegistry } from './core/registry/tool-registry.js';
import { rateLimiter } from './core/limits/rate-limiter.js';
import { cacheManager } from './core/cache/cache-manager.js';
import { toolRuntime } from './core/runtime/tool-runtime.js';
import { circuitBreaker } from './core/resilience/circuit-breaker.js';
import { httpStatusCircuitBreaker } from './core/resilience/http-status-breaker.js';
import { CompositeCircuitBreaker } from './core/resilience/composite-circuit-breaker.js';
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

  /**
   * 熔断器注入（可插拔骨架）
   *
   * - 默认：使用基础熔断器（连续失败）
   * - 需要多策略：把 CompositeCircuitBreaker 注入 toolRuntime
   *
   * 使用方式（示例）：
   * - 设置环境变量：TOOL_CIRCUIT_BREAKER_MODE=composite
   * - 或者你也可以在调用 initializeToolSystem() 之前手动调用 toolRuntime.setCircuitBreaker(...)
   */
  if (process.env.TOOL_CIRCUIT_BREAKER_MODE === 'composite') {
    toolRuntime.setCircuitBreaker(new CompositeCircuitBreaker([circuitBreaker, httpStatusCircuitBreaker]));
  }

  const circuitBreakerProvider = toolRuntime.getCircuitBreaker();

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
      circuitBreakerProvider.setConfig(plugin.metadata.name, plugin.circuitBreaker);
    }
  });

  toolRegistry.printSummary();
  console.log('✅ 工具系统初始化完成\n');
}

