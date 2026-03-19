import { appTools, defineConfig } from '@modern-js/app-tools';
import { bffPlugin } from '@modern-js/plugin-bff';
export default defineConfig({
  plugins: [
    appTools(),
    bffPlugin(),
  ],
  output: {
    disableInlineRuntimeChunk: true,
    // browserslist 已是 chrome>=110+，这些浏览器原生支持 Promise/Symbol/Map/Set/URL 等
    polyfill: 'off',
  },
  performance: {
    buildCache: false,
    // 生产包移除 console.log/info，保留 warn/error 供排障
    removeConsole: ['log', 'info'],
    chunkSplit: {
      strategy: 'split-by-experience',
      forceSplitting: {
        // i18next + react-i18next 单独拆包，提升缓存命中率
        'lib-i18n': /[\\/]node_modules[\\/](i18next|react-i18next)[\\/]/,
        // zustand + immer 单独拆包
        'lib-state': /[\\/]node_modules[\\/](zustand|immer)[\\/]/,
      },
    },
    preload: {
      include: [/main\.\w+\.js$/],
    },
  },
  server: {
    port: 8080,
  },
  bff: {
    prefix: '/api',
  },
});

