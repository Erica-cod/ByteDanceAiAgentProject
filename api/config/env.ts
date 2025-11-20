// 加载环境变量配置
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// 获取当前文件的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 根据 NODE_ENV 加载相应的环境变量文件
const env = process.env.NODE_ENV || 'development';

if (env === 'production') {
  // 生产环境加载 .env.production
  config({ path: join(__dirname, '../../.env.production') });
} else {
  // 开发环境加载 .env.local
  config({ path: join(__dirname, '../../.env.local') });
}

console.log(`🔧 环境模式: ${env}`);
console.log(`🔧 Ollama URL: ${process.env.OLLAMA_API_URL}`);
console.log(`🔧 Ollama Model: ${process.env.OLLAMA_MODEL}`);
console.log(`🔧 MongoDB URI: ${process.env.MONGODB_URI}`);

export {};

