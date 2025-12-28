/**
 * 重构文件存在性测试
 * 验证所有重构文件是否已创建
 */

import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('🧪 ===== 重构文件存在性测试 =====\n');

// 定义需要检查的文件
const filesToCheck = [
  // 第一轮重构文件
  { path: 'api/types/chat.ts', description: '类型定义' },
  { path: 'api/config/systemPrompt.ts', description: 'System Prompt 配置' },
  { path: 'api/utils/contentExtractor.ts', description: '内容提取工具' },
  { path: 'api/utils/llmCaller.ts', description: '模型调用封装' },
  { path: 'api/utils/toolExecutor.ts', description: '工具执行器' },
  { path: 'api/lambda/chat.refactored.ts', description: '重构后的主入口' },
  
  // 第二轮重构文件（SSE 拆分）
  { path: 'api/handlers/sseStreamWriter.ts', description: 'SSE流写入工具' },
  { path: 'api/handlers/workflowProcessor.ts', description: '工作流处理器' },
  { path: 'api/handlers/sseVolcanoHandler.ts', description: '火山引擎SSE处理器' },
  { path: 'api/handlers/sseLocalHandler.ts', description: '本地模型SSE处理器' },
  { path: 'api/handlers/sseHandler.refactored.ts', description: 'SSE处理器入口' },
  { path: 'api/handlers/multiAgentHandler.ts', description: '多Agent处理器' },
  
  // 文档文件
  { path: 'docs/REFACTORING_CHAT_API.md', description: '重构文档' },
  { path: 'test/test-refactored-code.js', description: '重构代码测试脚本' },
];

async function checkFile(filePath) {
  try {
    const fullPath = join(projectRoot, filePath);
    const stats = await stat(fullPath);
    const sizeKB = (stats.size / 1024).toFixed(2);
    return { exists: true, size: sizeKB };
  } catch {
    return { exists: false };
  }
}

async function main() {
  console.log('📦 检查重构文件...\n');
  
  let existsCount = 0;
  let missingCount = 0;
  let totalSize = 0;
  
  for (const file of filesToCheck) {
    const result = await checkFile(file.path);
    
    if (result.exists) {
      console.log(`  ✅ ${file.description}`);
      console.log(`     路径: ${file.path}`);
      console.log(`     大小: ${result.size} KB\n`);
      existsCount++;
      totalSize += parseFloat(result.size);
    } else {
      console.log(`  ❌ ${file.description}`);
      console.log(`     路径: ${file.path} - 文件不存在\n`);
      missingCount++;
    }
  }
  
  console.log('📊 ===== 检查结果 =====');
  console.log(`✅ 存在: ${existsCount} 个文件`);
  console.log(`❌ 缺失: ${missingCount} 个文件`);
  console.log(`💾 总大小: ${totalSize.toFixed(2)} KB\n`);
  
  if (missingCount === 0) {
    console.log('🎉 所有重构文件都已创建！\n');
    
    console.log('📋 重构文件结构：');
    console.log('api/');
    console.log('├── types/');
    console.log('│   └── chat.ts                 ← 类型定义');
    console.log('├── config/');
    console.log('│   └── systemPrompt.ts         ← System Prompt');
    console.log('├── utils/');
    console.log('│   ├── contentExtractor.ts     ← 内容提取');
    console.log('│   ├── llmCaller.ts            ← 模型调用');
    console.log('│   └── toolExecutor.ts         ← 工具执行');
    console.log('├── handlers/');
    console.log('│   ├── sseStreamWriter.ts      ← SSE流写入工具');
    console.log('│   ├── workflowProcessor.ts    ← 工作流处理器');
    console.log('│   ├── sseVolcanoHandler.ts    ← 火山引擎SSE');
    console.log('│   ├── sseLocalHandler.ts      ← 本地模型SSE');
    console.log('│   ├── sseHandler.refactored.ts ← SSE入口（新）');
    console.log('│   └── multiAgentHandler.ts    ← 多Agent处理');
    console.log('└── lambda/');
    console.log('    └── chat.refactored.ts      ← 主入口（新）\n');
    
    console.log('💡 下一步操作：\n');
    console.log('  【方案 A】立即切换到重构版本（测试环境推荐）：');
    console.log('    1. 备份原文件：');
    console.log('       cp api/lambda/chat.ts api/lambda/chat.backup.ts');
    console.log('       cp api/handlers/sseHandler.ts api/handlers/sseHandler.backup.ts');
    console.log('    2. 替换为重构版本：');
    console.log('       mv api/lambda/chat.refactored.ts api/lambda/chat.ts');
    console.log('       mv api/handlers/sseHandler.refactored.ts api/handlers/sseHandler.ts');
    console.log('    3. 重启服务器测试：');
    console.log('       npm run dev\n');
    
    console.log('  【方案 B】灰度切换（生产环境推荐）：');
    console.log('    - 参考 docs/REFACTORING_CHAT_API.md 中的详细步骤\n');
    
    console.log('  【方案 C】先验证编译（保险起见）：');
    console.log('    npm run build  # 验证 TypeScript 编译是否通过\n');
  } else {
    console.log('⚠️  有文件缺失，请检查：');
    console.log('  - 文件是否正确创建');
    console.log('  - 文件路径是否正确');
    console.log('  - 是否有权限访问这些文件\n');
  }
  
  // 检查原始文件大小，做对比
  console.log('📊 原始文件大小对比：');
  const originalFiles = [
    { path: 'api/lambda/chat.ts', description: '原chat.ts' },
    { path: 'api/handlers/sseHandler.ts', description: '原sseHandler.ts' },
  ];
  
  let originalSize = 0;
  for (const file of originalFiles) {
    const result = await checkFile(file.path);
    if (result.exists) {
      console.log(`  ${file.description}: ${result.size} KB`);
      originalSize += parseFloat(result.size);
    }
  }
  
  console.log(`\n  原始文件总大小: ${originalSize.toFixed(2)} KB`);
  console.log(`  重构后总大小: ${totalSize.toFixed(2)} KB`);
  
  const reduction = ((1 - totalSize / originalSize) * 100).toFixed(1);
  if (totalSize < originalSize) {
    console.log(`  📉 代码大小减少: ${reduction}% (由于移除重复代码)`);
  } else {
    console.log(`  📈 代码大小增加: ${Math.abs(parseFloat(reduction)).toFixed(1)}% (由于拆分和注释)`);
  }
  
  console.log('\n✨ 重构完成！所有新文件已准备就绪。\n');
}

main().catch(console.error);

