/**
 * Jest 全局环境加载
 *
 * 目标：
 * - 自动加载 `.env.local`（优先）或 `.env`
 * - 避免在测试里重复写 dotenv 逻辑
 * - 不打印敏感信息
 */

import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
const envLocal = join(root, '.env.local');

try {
  if (existsSync(envLocal)) {
    dotenv.config({ path: envLocal, quiet: true });
  } else {
    dotenv.config({ quiet: true });
  }
} catch {
  // 忽略：测试不强依赖 env 文件存在
}


