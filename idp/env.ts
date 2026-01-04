/**
 * IdP 环境变量加载
 * - 开发环境：加载根目录 .env.local
 * - 生产环境：加载根目录 .env.production
 *
 * 说明：为避免影响现有 BFF 日志，本文件不输出 console.log。
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const env = process.env.NODE_ENV || 'development';

if (env === 'production') {
  config({ path: join(__dirname, '../.env.production'), override: false });
} else {
  config({ path: join(__dirname, '../.env.local'), override: false });
}

export {};


