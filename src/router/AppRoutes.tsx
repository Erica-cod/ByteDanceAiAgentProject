import React, { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ChatInterfaceRefactored from '../components/business/Chat/ChatInterfaceRefactored';

const ErrorPageLazy = lazy(() =>
  import('../pages/errors/ErrorPage').then(module => ({ default: module.ErrorPage }))
);

const LoadingFallback = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    fontSize: '18px',
    color: '#666'
  }}>
    <div>加载中...</div>
  </div>
);

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<ChatInterfaceRefactored />} />

      {/* 统一错误页（非关键路径，保持懒加载） */}
      <Route
        path="/400"
        element={<Suspense fallback={<LoadingFallback />}><ErrorPageLazy code={400} /></Suspense>}
      />
      <Route
        path="/403"
        element={<Suspense fallback={<LoadingFallback />}><ErrorPageLazy code={403} /></Suspense>}
      />
      <Route
        path="/404"
        element={<Suspense fallback={<LoadingFallback />}><ErrorPageLazy code={404} /></Suspense>}
      />
      <Route
        path="/500"
        element={<Suspense fallback={<LoadingFallback />}><ErrorPageLazy code={500} /></Suspense>}
      />

      {/* 兼容 /error/xxx 形式 */}
      <Route path="/error/400" element={<Navigate to="/400" replace />} />
      <Route path="/error/403" element={<Navigate to="/403" replace />} />
      <Route path="/error/404" element={<Navigate to="/404" replace />} />
      <Route path="/error/500" element={<Navigate to="/500" replace />} />

      {/* 兜底 404 */}
      <Route
        path="*"
        element={<Suspense fallback={<LoadingFallback />}><ErrorPageLazy code={404} /></Suspense>}
      />
    </Routes>
  );
};


