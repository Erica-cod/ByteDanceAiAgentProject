/**
 * 重构代码 - Jest 单元测试版（替代 test/test-refactored-code.js）
 *
 * 说明：
 * - 只做“本地可验证”的内容：模块能导入、核心工具函数行为正确
 * - 不做真实 API 调用（那属于集成测试/会消耗配额）
 */

import { describe, expect, test } from '@jest/globals';

describe('refactored code sanity', () => {
  test('关键模块应可正常导入（不依赖外部服务）', async () => {
    const modules: Array<{ path: string; name: string }> = [
      { path: '../../api/types/chat.js', name: '类型定义' },
      { path: '../../api/config/systemPrompt.js', name: 'System Prompt' },
      { path: '../../api/handlers/sseStreamWriter.js', name: 'SSE 流写入工具' },
      { path: '../../api/_clean/shared/utils/content-extractor.js', name: '内容提取工具（_clean）' },
    ];

    const results = await Promise.all(
      modules.map(async (m) => {
        try {
          await import(m.path);
          return { ...m, ok: true as const, error: null as any };
        } catch (error: any) {
          return { ...m, ok: false as const, error };
        }
      })
    );

    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      // 让报错更直观
      const detail = failed
        .map((f) => `- ${f.name} (${f.path}): ${String(f.error?.message || f.error)}`)
        .join('\n');
      throw new Error(`以下模块导入失败：\n${detail}`);
    }
  });

  test('SSE 流写入工具 createSafeSSEWriter 行为应正确', async () => {
    // Node 18+ 才有 Web Streams。若环境不支持就跳过，避免 CI 偶发失败。
    if (typeof WritableStream === 'undefined' || typeof TextEncoder === 'undefined') {
      return;
    }

    const { createSafeSSEWriter } = await import('../../api/handlers/sseStreamWriter.js');

    const chunks: Uint8Array[] = [];
    const writable = new WritableStream<Uint8Array>({
      write(chunk) {
        chunks.push(chunk);
      },
    });
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    const { safeWrite, checkClosed, markClosed } = createSafeSSEWriter(writer, encoder);

    expect(checkClosed()).toBe(false);
    const ok1 = await safeWrite('data: test\n\n');
    expect(ok1).toBe(true);
    expect(chunks.length).toBe(1);

    markClosed();
    expect(checkClosed()).toBe(true);
    const ok2 = await safeWrite('data: test2\n\n');
    expect(ok2).toBe(false);

    await writer.close();
  });

  test('内容提取工具 extractThinkingAndContent 应处理 <think> 标签与未闭合标签', async () => {
    const { extractThinkingAndContent } = await import('../../api/_clean/shared/utils/content-extractor.js');

    const t1 = '<think>这是思考过程</think>这是最终内容';
    const r1 = extractThinkingAndContent(t1);
    expect(r1.thinking).toBe('这是思考过程');
    expect(r1.content).toBe('这是最终内容');

    const t2 = '这是纯内容，没有思考过程';
    const r2 = extractThinkingAndContent(t2);
    expect(r2.thinking).toBe('');
    expect(r2.content).toBe(t2);

    const t3 = '已有内容<think>正在思考中...';
    const r3 = extractThinkingAndContent(t3);
    expect(r3.thinking).toContain('正在思考');
    expect(r3.content).toBe('已有内容');
  });

  test('System Prompt 应可生成且包含 <tool_call> 规则', async () => {
    const { SYSTEM_PROMPT, buildSystemPrompt } = await import('../../api/config/systemPrompt.js');

    expect(typeof SYSTEM_PROMPT).toBe('string');
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(200);
    expect(SYSTEM_PROMPT).toContain('<tool_call>');

    const rebuilt = buildSystemPrompt();
    expect(typeof rebuilt).toBe('string');
    expect(rebuilt.length).toBeGreaterThan(200);
  });
});


