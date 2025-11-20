#!/usr/bin/env node
/**
 * 端口清理脚本 - 在启动前自动清理占用的端口
 * 这个脚本会在每次 npm run serve/start 前自动执行
 */

import { execSync } from 'child_process';
import { platform } from 'os';

const PORT = process.env.PORT || 8080;
const isWindows = platform() === 'win32';

console.log(`\n🔍 检查端口 ${PORT} 是否被占用...`);

try {
  if (isWindows) {
    // Windows: 查找占用端口的进程
    const output = execSync(`netstat -ano | findstr :${PORT}`, { encoding: 'utf-8' }).toString();
    const lines = output.split('\n').filter(line => line.includes('LISTENING'));
    
    if (lines.length === 0) {
      console.log(`✅ 端口 ${PORT} 未被占用\n`);
      process.exit(0);
    }

    console.log(`⚠️  端口 ${PORT} 被占用，正在清理...`);
    
    // 提取所有 PID
    const pids = new Set();
    lines.forEach(line => {
      const match = line.trim().match(/\s+(\d+)\s*$/);
      if (match) {
        pids.add(match[1]);
      }
    });

    // 终止所有占用端口的进程
    pids.forEach(pid => {
      try {
        console.log(`  🔴 终止进程 PID: ${pid}`);
        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
      } catch (err) {
        // 进程可能已经终止，忽略错误
      }
    });

    console.log(`✅ 端口 ${PORT} 已清理\n`);
    
  } else {
    // Linux/Mac: 查找并终止占用端口的进程
    try {
      const pid = execSync(`lsof -ti:${PORT}`, { encoding: 'utf-8' }).toString().trim();
      if (pid) {
        console.log(`⚠️  端口 ${PORT} 被占用，正在清理...`);
        console.log(`  🔴 终止进程 PID: ${pid}`);
        execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
        console.log(`✅ 端口 ${PORT} 已清理\n`);
      } else {
        console.log(`✅ 端口 ${PORT} 未被占用\n`);
      }
    } catch (err) {
      console.log(`✅ 端口 ${PORT} 未被占用\n`);
    }
  }
  
  process.exit(0);
  
} catch (error) {
  // 端口未被占用时，netstat/lsof 会报错，这是正常的
  console.log(`✅ 端口 ${PORT} 未被占用\n`);
  process.exit(0);
}

