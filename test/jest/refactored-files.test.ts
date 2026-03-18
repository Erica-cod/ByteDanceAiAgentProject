/**
 * 重构文件存在性 - Jest 单元测试版（替代 test/test-refactored-files.js）
 *
 * 注意：
 * - 原脚本里包含一些历史路径（api/utils/*）在当前仓库已不存在
 * - 这里改为验证“当前仓库实际使用的关键文件”是否存在
 */

import { describe, expect, test } from '@jest/globals';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';

type FileCheck = { path: string; description: string };

async function fileExists(relPath: string): Promise<boolean> {
  try {
    await stat(join(process.cwd(), relPath));
    return true;
  } catch {
    return false;
  }
}

describe('refactored files existence', () => {
  test('关键重构文件应存在', async () => {
    const files: FileCheck[] = [
      { path: 'api/types/chat.ts', description: 'Chat API 类型定义' },
      { path: 'api/config/systemPrompt.ts', description: 'System Prompt 配置' },
      { path: 'api/handlers/sseStreamWriter.ts', description: 'SSE 流写入工具' },
      { path: 'api/handlers/singleAgentHandler.ts', description: '单 Agent 处理器' },
      { path: 'api/handlers/multiAgentHandler.ts', description: '多 Agent 处理器' },
      { path: 'api/lambda/chat.ts', description: 'Chat API 入口' },
      { path: 'api/tools/index.ts', description: '工具系统入口' },
      { path: 'api/tools/core/execution/tool-executor.ts', description: '工具执行器' },
      { path: 'api/_clean/shared/utils/content-extractor.ts', description: '内容提取工具（_clean）' },
      { path: 'api/_clean/infrastructure/llm/model-service.ts', description: '模型调用服务' },
      { path: 'api/_clean/infrastructure/llm/providers/registry.ts', description: 'LLM Provider 注册表' },
    ];

    const results = await Promise.all(
      files.map(async (f) => {
        const ok = await fileExists(f.path);
        return { ...f, ok };
      })
    );

    const missing = results.filter((r) => !r.ok);
    if (missing.length > 0) {
      const detail = missing.map((m) => `- ${m.description}: ${m.path}`).join('\n');
      throw new Error(`以下关键文件缺失：\n${detail}`);
    }

    expect(missing.length).toBe(0);
  });
});


