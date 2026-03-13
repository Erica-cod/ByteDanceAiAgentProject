import { appTools, defineConfig } from '@modern-js/app-tools';
import { bffPlugin } from '@modern-js/plugin-bff';

export default defineConfig({
  plugins: [
    appTools(),
    bffPlugin(),
  ],
  output: {
    // 避免生产环境内联 runtime 造成 chunk 映射漂移，固定为独立 runtime 文件
    disableInlineRuntimeChunk: true,
  },
  performance: {
    // 先确保构建产物映射稳定，避免缓存导致的旧 hash 注入
    buildCache: false,
  },
  server: {
    port: 8080,
  },
  bff: {
    // 只扫描 api/lambda 目录作为 API 路由
    prefix: '/api',
  },
});

