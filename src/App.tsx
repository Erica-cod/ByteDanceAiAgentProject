import React, { useEffect } from 'react';
import { MonitorProvider } from 'ai-stream-monitor/react';
import type { AIChatMonitorConfig } from 'ai-stream-monitor';
import { useThemeStore } from './stores/themeStore';
import { runWhenIdle, cancelIdleTask } from './utils/perf/scheduling';
import { initLocalStorageLRU } from './utils/storage/localStorageLRU';
import { AppRoutes } from './router/AppRoutes';

const monitorConfig: AIChatMonitorConfig = {
  appId: 'bytedance-ai-agent',
  endpoint: '/api/monitor',
  debug: process.env.NODE_ENV === 'development',
  transport: {
    mode: process.env.NODE_ENV === 'development' ? 'immediate' : 'batch',
    batchSize: 10,
    flushInterval: 5000,
  },
  sampling: {
    rate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
    alwaysSample: ['js_error', 'promise_error', 'stream_error'],
  },
  error: {
    ignoreErrors: [/ResizeObserver/],
    ignoreUrls: [/chrome-extension/],
  },
  beforeSend(event) {
    if (event.data.authorization) {
      event.data.authorization = '[REDACTED]';
    }
    return event;
  },
  dedupeWindow: 5000,
};

const App: React.FC = () => {
  const { theme, updateEffectiveTheme } = useThemeStore();

  useEffect(() => {
    updateEffectiveTheme();
  }, []);

  useEffect(() => {
    const idleId = runWhenIdle(() => {
      import('./utils/auth/userManager').then(({ getUserId }) => {
        const userId = getUserId();
        initLocalStorageLRU(userId);
      });
    }, { timeout: 2000 });

    return () => {
      cancelIdleTask(idleId);
    };
  }, []);

  return (
    <MonitorProvider config={monitorConfig}>
      <div className="app">
        <AppRoutes />
      </div>
    </MonitorProvider>
  );
};

export default App;

