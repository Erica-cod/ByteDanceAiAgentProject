// 加载环境变量配置
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// 获取当前文件的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 根据 NODE_ENV 加载相应的环境变量文件
const env = process.env.NODE_ENV || 'development';

// 只有在环境变量未设置时才从.env文件加载（Docker优先）
if (env === 'production') {
  // 生产环境加载 .env.production（不覆盖已存在的环境变量）
  config({ path: join(__dirname, '../../.env.production'), override: false });
} else {
  // 开发环境加载 .env.local
  config({ path: join(__dirname, '../../.env.local'), override: false });
}

console.log(`🔧 环境模式: ${env}`);
console.log(`🔧 [本地] Ollama URL: ${process.env.OLLAMA_API_URL || 'http://localhost:11434'}`);
console.log(`🔧 [本地] Ollama Model: ${process.env.OLLAMA_MODEL || 'qwen3:8b (默认)'}`);
console.log(`🔧 [远程] 火山引擎 API Key: ${process.env.ARK_API_KEY ? '已配置 (' + process.env.ARK_API_KEY.substring(0, 10) + '...)' : '❌ 未配置'}`);
console.log(`🔧 [远程] 火山引擎 Model: ${process.env.ARK_MODEL || '使用默认值'}`);
console.log(`🔧 MongoDB URI: ${process.env.MONGODB_URI}`);
console.log(`🔧 Tavily API Key: ${process.env.TAVILY_API_KEY ? '已配置 (' + process.env.TAVILY_API_KEY.substring(0, 10) + '...)' : '❌ 未配置'}`);

export {};

