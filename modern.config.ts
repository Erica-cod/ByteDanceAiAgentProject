import { appTools, defineConfig } from '@modern-js/app-tools';
import { bffPlugin } from '@modern-js/plugin-bff';

export default defineConfig({
  plugins: [
    appTools(),
    bffPlugin(),
  ],
  server: {
    port: 8080,
  },
  bff: {
    // 只扫描 api/lambda 目录作为 API 路由
    prefix: '/api',
  },
});

