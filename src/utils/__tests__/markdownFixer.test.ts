/**
 * Markdown 容错处理工具 - Jest 单元测试
 *
 * 运行方式：
 * - npm run test:markdown
 * - npm run test:unit
 */

import {
  fixIncompleteMarkdown,
  hasSevereFormatError,
  isLikelyStreaming,
  safeFixMarkdown,
} from '../markdown/markdownFixer.js';

describe('markdownFixer', () => {
  test('未闭合的代码块：应自动补全结束标记', () => {
    const input = '这是一段文本\n```python\ndef hello():\n    print("world")';
    const result = fixIncompleteMarkdown(input);

    expect(result.hasIssues).toBe(true);
    const codeBlockCount = (result.fixed.match(/```/g) || []).length;
    expect(codeBlockCount % 2).toBe(0);
    expect(result.issues).toContain('检测到未闭合的代码块，已自动添加结束标记');
  });

  test('未闭合的 HTML 标签：应补全结束标签', () => {
    const input = '<div class="container">内容';
    const result = fixIncompleteMarkdown(input);

    expect(result.hasIssues).toBe(true);
    expect(result.fixed).toContain('</div>');
    expect(result.issues.length).toBeGreaterThan(0);
  });

  test('不完整的链接：应补全括号', () => {
    const input = '这是一个 [链接](http://example.com';
    const result = fixIncompleteMarkdown(input);

    expect(result.hasIssues).toBe(true);
    expect(result.fixed.endsWith(')')).toBe(true);
  });

  test('不完整的表格：应补全缺失列', () => {
    const input = '| 列1 | 列2 | 列3 |\n|-----|-----|-----|\n| 内容1 | 内容2 |';
    const result = fixIncompleteMarkdown(input);

    expect(result.hasIssues).toBe(true);
    expect(result.issues.some((issue) => issue.includes('表格'))).toBe(true);
  });

  test('完整 Markdown：不应修改', () => {
    const input = '# 标题\n\n这是一段文本\n\n```python\nprint("hello")\n```\n\n正常内容';
    const result = fixIncompleteMarkdown(input);

    expect(result.hasIssues).toBe(false);
    expect(result.fixed).toBe(input);
  });

  test('isLikelyStreaming：应识别常见流式“半截结构”', () => {
    expect(isLikelyStreaming('```python')).toBe(true);
    expect(isLikelyStreaming('```')).toBe(true);
    expect(isLikelyStreaming('这是一个 [')).toBe(true);
    expect(isLikelyStreaming('![图片')).toBe(true);
    expect(isLikelyStreaming('| 列1 | 列2 |')).toBe(true);
    expect(isLikelyStreaming('<div class="test"')).toBe(true);

    expect(isLikelyStreaming('这是完整的文本')).toBe(false);
    expect(isLikelyStreaming('# 标题\n\n内容')).toBe(false);
  });

  test('hasSevereFormatError：严重格式错误应触发降级', () => {
    expect(hasSevereFormatError('内容<div class="test"')).toBe(true);
    expect(hasSevereFormatError('内容<<<<<<文本')).toBe(true);
    expect(hasSevereFormatError('[[[[[[内容文本')).toBe(true);
    expect(hasSevereFormatError('# 标题\n\n这是正常内容')).toBe(false);
  });

  test('safeFixMarkdown：仅在流式特征时修复；严重错误时降级为纯文本', () => {
    const streaming1 = '这是文本[链接](http://example.com';
    const complete = '# 标题\n\n完整内容';
    const severeError = '内容<div class="test"';

    const fixedStreaming1 = safeFixMarkdown(streaming1);
    expect(fixedStreaming1.content).not.toBe(streaming1);
    expect(fixedStreaming1.content.endsWith(')')).toBe(true);
    expect(fixedStreaming1.shouldRenderAsPlainText).toBe(false);

    const fixedComplete = safeFixMarkdown(complete);
    expect(fixedComplete.content).toBe(complete);
    expect(fixedComplete.shouldRenderAsPlainText).toBe(false);

    const fixedSevereError = safeFixMarkdown(severeError);
    expect(fixedSevereError.content).toBe(severeError);
    expect(fixedSevereError.shouldRenderAsPlainText).toBe(true);
  });
});

