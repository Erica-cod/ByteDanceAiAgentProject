/**
 * ToolExecutor 降级链 - 单元测试
 *
 * 目标：
 * - 主执行失败时，按 fallbackChain 返回 defaultResponse
 *
 * 说明：
 * - ToolExecutor 使用的是单例依赖（toolRegistry/cacheManager/circuitBreaker 等）
 * - 本测试注册一个“只在测试中使用”的 dummy 工具，跑完后注销，避免污染全局注册表
 */

import type { ToolPlugin } from '../types.js';

describe('ToolExecutor fallback chain', () => {
  test('主工具失败：应触发 default 降级', async () => {
    // 只导入 core 单例，避免引入 search-web 等插件带来外部依赖告警
    const { toolRegistry } = await import('../registry/tool-registry.js');
    const { toolExecutor } = await import('../execution/tool-executor.js');

    const toolName = `test_dummy_fail_${Date.now()}`;

    const plugin: ToolPlugin = {
      metadata: {
        name: toolName,
        description: '测试工具：固定失败，用于验证降级链',
        version: '0.0.1',
        author: 'test',
        enabled: true,
        tags: ['test'],
      },
      schema: {
        name: toolName,
        description: '测试工具：固定失败，用于验证降级链',
        parameters: {
          type: 'object',
          properties: {
            q: { type: 'string' },
          },
          required: ['q'],
        },
      },
      fallback: {
        enabled: true,
        fallbackChain: [{ type: 'default' }],
        defaultResponse: {
          success: true,
          data: { ok: true },
          message: 'default fallback',
        },
      },
      execute: async () => {
        throw new Error('boom');
      },
    };

    toolRegistry.register(plugin);

    const result = await toolExecutor.execute(
      toolName,
      { q: 'x' },
      { userId: 'u1', requestId: 'r1', timestamp: Date.now() },
      { skipCache: true, skipRateLimit: true }
    );

    expect(result.success).toBe(true);
    expect(result.degraded).toBe(true);
    expect(result.degradedBy).toBe('default');
    expect(result.data).toEqual({ ok: true });

    toolRegistry.unregister(toolName);
  });
});


