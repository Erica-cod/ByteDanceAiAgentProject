/**
 * Markdown 容错处理工具演示脚本
 * 
 * 运行方式：node src/utils/__tests__/markdownFixer.test.ts
 * 或使用：npm run test:markdown
 * 
 * 演示场景：
 * 1. 未闭合的代码块
 * 2. 未闭合的 HTML 标签
 * 3. 不完整的链接和图片
 * 4. 不完整的表格
 * 5. 复杂场景（多个问题同时存在）
 */

import { fixIncompleteMarkdown, isLikelyStreaming, safeFixMarkdown, hasSevereFormatError } from '../markdownFixer.js';

// 测试工具函数
function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ 断言失败: ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

function testSection(title: string): void {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📝 ${title}`);
  console.log('='.repeat(60));
}

// 主测试函数
async function runTests() {
  console.log('\n🚀 开始测试 Markdown 容错处理工具\n');

  // 测试 1: 未闭合的代码块
  testSection('测试 1: 未闭合的代码块');
  {
    const input = '这是一段文本\n```python\ndef hello():\n    print("world")';
    console.log('输入内容:');
    console.log(input);
    
    const result = fixIncompleteMarkdown(input);
    console.log('\n修复结果:');
    console.log(result.fixed);
    console.log('\n检测到的问题:');
    console.log(result.issues);
    
    assert(result.hasIssues, '应该检测到问题');
    // 检查是否添加了闭合标记（代码块数量应该是偶数）
    const codeBlockCount = (result.fixed.match(/```/g) || []).length;
    assert(codeBlockCount % 2 === 0, '应该添加了闭合标记（代码块数量为偶数）');
    assert(result.issues.includes('检测到未闭合的代码块，已自动添加结束标记'), '应该记录正确的问题');
  }

  // 测试 2: 未闭合的 HTML 标签
  testSection('测试 2: 未闭合的 HTML 标签');
  {
    const input = '<div class="container">内容';
    console.log('输入内容:');
    console.log(input);
    
    const result = fixIncompleteMarkdown(input);
    console.log('\n修复结果:');
    console.log(result.fixed);
    console.log('\n检测到的问题:');
    console.log(result.issues);
    
    assert(result.hasIssues, '应该检测到问题');
    assert(result.fixed.includes('</div>'), '应该添加了闭合标签');
    assert(result.issues.length > 0, '应该记录问题');
  }

  // 测试 3: 不完整的链接
  testSection('测试 3: 不完整的链接');
  {
    const input = '这是一个 [链接](http://example.com';
    console.log('输入内容:');
    console.log(input);
    
    const result = fixIncompleteMarkdown(input);
    console.log('\n修复结果:');
    console.log(result.fixed);
    console.log('\n检测到的问题:');
    console.log(result.issues);
    
    assert(result.hasIssues, '应该检测到问题');
    assert(result.fixed.endsWith(')'), '应该添加了闭合括号');
  }

  // 测试 4: 不完整的表格
  testSection('测试 4: 不完整的表格');
  {
    const input = '| 列1 | 列2 | 列3 |\n|-----|-----|-----|\n| 内容1 | 内容2 |';
    console.log('输入内容:');
    console.log(input);
    
    const result = fixIncompleteMarkdown(input);
    console.log('\n修复结果:');
    console.log(result.fixed);
    console.log('\n检测到的问题:');
    console.log(result.issues);
    
    assert(result.hasIssues, '应该检测到问题');
    // 检查最后一行是否被补全了（检查问题列表中是否有表格修复的信息）
    const hasTableFix = result.issues.some(issue => issue.includes('表格'));
    assert(hasTableFix, '应该补全了缺失的列');
  }

  // 测试 5: 完整的 Markdown 不应该被修改
  testSection('测试 5: 完整的 Markdown 不应该被修改');
  {
    const input = '# 标题\n\n这是一段文本\n\n```python\nprint("hello")\n```\n\n正常内容';
    console.log('输入内容:');
    console.log(input);
    
    const result = fixIncompleteMarkdown(input);
    console.log('\n修复结果:');
    console.log(result.fixed);
    console.log('\n是否有问题:', result.hasIssues);
    
    assert(!result.hasIssues, '不应该检测到问题');
    assert(result.fixed === input, '不应该修改完整内容');
  }

  // 测试 6: 流式传输检测
  testSection('测试 6: 流式传输检测');
  {
    console.log('测试未完成的代码块:');
    assert(isLikelyStreaming('```python'), '应该识别为流式传输');
    assert(isLikelyStreaming('```'), '应该识别为流式传输');
    
    console.log('\n测试未完成的链接:');
    assert(isLikelyStreaming('这是一个 ['), '应该识别为流式传输');
    assert(isLikelyStreaming('![图片'), '应该识别为流式传输');
    
    console.log('\n测试未完成的表格:');
    assert(isLikelyStreaming('| 列1 | 列2 |'), '应该识别为流式传输');
    
    console.log('\n测试未完成的 HTML 标签:');
    assert(isLikelyStreaming('<div class="test"'), '应该识别为流式传输');
    
    console.log('\n测试完整内容:');
    assert(!isLikelyStreaming('这是完整的文本'), '不应该识别为流式传输');
    assert(!isLikelyStreaming('# 标题\n\n内容'), '不应该识别为流式传输');
  }

  // 测试 7: 严重格式错误检测
  testSection('测试 7: 严重格式错误检测（应该降级为纯文本）');
  {
    console.log('测试严重格式错误：未闭合的HTML标签开始符号');
    const severeError1 = '内容<div class="test"'; // 标签未闭合 >
    console.log('输入:', severeError1);
    console.log('是否有严重错误:', hasSevereFormatError(severeError1));
    assert(hasSevereFormatError(severeError1), '应该检测到严重错误');
    
    console.log('\n测试严重格式错误：大量连续特殊字符');
    const severeError2 = '内容<<<<<<文本';
    console.log('输入:', severeError2);
    console.log('是否有严重错误:', hasSevereFormatError(severeError2));
    assert(hasSevereFormatError(severeError2), '应该检测到严重错误');
    
    console.log('\n测试严重格式错误：严重不平衡的括号');
    const severeError3 = '[[[[[[内容文本';
    console.log('输入:', severeError3);
    console.log('是否有严重错误:', hasSevereFormatError(severeError3));
    assert(hasSevereFormatError(severeError3), '应该检测到严重错误');
    
    console.log('\n测试正常内容：');
    const normal = '# 标题\n\n这是正常内容';
    console.log('输入:', normal);
    console.log('是否有严重错误:', hasSevereFormatError(normal));
    assert(!hasSevereFormatError(normal), '不应该检测到严重错误');
  }

  // 测试 8: 安全修复（新版本返回对象）
  testSection('测试 8: 安全修复（只在检测到流式特征时应用）');
  {
    // 使用真正的流式特征：以不完整标记结尾
    const streaming1 = '这是文本[链接](http://example.com'; // 链接未闭合
    const streaming2 = '内容<div>文本'; // HTML标签已开始但未闭合
    const streaming3 = '```'; // 代码块刚开始
    const complete = '# 标题\n\n完整内容';
    const severeError = '内容<div class="test"'; // 严重错误
    
    console.log('测试流式内容（未闭合链接）:');
    console.log('输入:', streaming1);
    console.log('是否识别为流式:', isLikelyStreaming(streaming1));
    const fixedStreaming1 = safeFixMarkdown(streaming1);
    console.log('输出:', fixedStreaming1.content);
    console.log('是否降级为纯文本:', fixedStreaming1.shouldRenderAsPlainText);
    assert(fixedStreaming1.content !== streaming1, '应该应用了修复');
    assert(fixedStreaming1.content.endsWith(')'), '应该补全了链接');
    assert(!fixedStreaming1.shouldRenderAsPlainText, '不应该降级为纯文本');
    
    console.log('\n测试流式内容（未闭合HTML标签）:');
    console.log('输入:', streaming2);
    const fixedStreaming2 = safeFixMarkdown(streaming2);
    console.log('输出:', fixedStreaming2.content);
    console.log('是否降级为纯文本:', fixedStreaming2.shouldRenderAsPlainText);
    assert(!fixedStreaming2.shouldRenderAsPlainText, '不应该降级为纯文本');
    
    console.log('\n测试流式内容（代码块刚开始）:');
    console.log('输入:', streaming3);
    console.log('是否识别为流式:', isLikelyStreaming(streaming3));
    assert(isLikelyStreaming(streaming3), '应该识别为流式传输');
    
    console.log('\n测试完整内容:');
    console.log('输入:', complete);
    const fixedComplete = safeFixMarkdown(complete);
    console.log('输出:', fixedComplete.content);
    console.log('是否降级为纯文本:', fixedComplete.shouldRenderAsPlainText);
    assert(fixedComplete.content === complete, '不应该修改完整内容');
    assert(!fixedComplete.shouldRenderAsPlainText, '不应该降级为纯文本');
    
    console.log('\n测试严重格式错误（应该降级为纯文本）:');
    console.log('输入:', severeError);
    const fixedSevereError = safeFixMarkdown(severeError);
    console.log('输出:', fixedSevereError.content);
    console.log('是否降级为纯文本:', fixedSevereError.shouldRenderAsPlainText);
    assert(fixedSevereError.shouldRenderAsPlainText, '应该降级为纯文本');
    assert(fixedSevereError.content === severeError, '应该返回原始内容');
  }

  // 测试 9: 复杂场景（多个问题同时存在）
  testSection('测试 9: 复杂场景（多个问题同时存在）');
  {
    const input = '<div>\n```python\ndef test():\n    pass\n[链接](http://example.com';
    console.log('输入内容（包含3个问题）:');
    console.log(input);
    
    const result = fixIncompleteMarkdown(input);
    console.log('\n修复结果:');
    console.log(result.fixed);
    console.log('\n检测到的问题:');
    console.log(result.issues);
    
    assert(result.hasIssues, '应该检测到问题');
    assert(result.issues.length > 1, '应该检测到多个问题');
    assert(result.fixed.includes('```'), '应该修复了代码块');
    assert(result.fixed.includes(')'), '应该修复了链接');
    assert(result.fixed.includes('</div>'), '应该修复了 HTML 标签');
  }

  // 测试 10: 嵌套的 HTML 标签
  testSection('测试 10: 嵌套的 HTML 标签');
  {
    const input = '<div><span>内容</span>';
    console.log('输入内容:');
    console.log(input);
    
    const result = fixIncompleteMarkdown(input);
    console.log('\n修复结果:');
    console.log(result.fixed);
    console.log('\n检测到的问题:');
    console.log(result.issues);
    
    assert(result.hasIssues, '应该检测到问题');
    assert(result.fixed.includes('</div>'), '应该添加了 </div>');
    assert(!result.fixed.includes('</span></span>'), '不应该重复闭合已闭合的标签');
  }

  // 所有测试完成
  console.log('\n' + '='.repeat(60));
  console.log('🎉 所有测试通过！');
  console.log('='.repeat(60));
  console.log('\n✅ Markdown 容错处理工具工作正常');
  console.log('✅ 所有场景都得到了正确处理');
  console.log('✅ 可以安全地集成到项目中\n');
}

// 运行测试
runTests().catch((error) => {
  console.error('\n❌ 测试过程中发生错误:');
  console.error(error);
  process.exit(1);
});

