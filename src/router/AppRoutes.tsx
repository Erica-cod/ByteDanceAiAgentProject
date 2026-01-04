import React, { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ErrorPage } from '../pages/errors/ErrorPage';

// 保持原有 Chat 界面懒加载（不做大改动）
const ChatInterface = lazy(() => import('../components/business/Chat/ChatInterfaceRefactored'));

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
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/" element={<ChatInterface />} />

        {/* 统一错误页 */}
        <Route path="/400" element={<ErrorPage code={400} />} />
        <Route path="/403" element={<ErrorPage code={403} />} />
        <Route path="/404" element={<ErrorPage code={404} />} />
        <Route path="/500" element={<ErrorPage code={500} />} />

        {/* 兼容 /error/xxx 形式 */}
        <Route path="/error/400" element={<Navigate to="/400" replace />} />
        <Route path="/error/403" element={<Navigate to="/403" replace />} />
        <Route path="/error/404" element={<Navigate to="/404" replace />} />
        <Route path="/error/500" element={<Navigate to="/500" replace />} />

        {/* 兜底 404 */}
        <Route path="*" element={<ErrorPage code={404} />} />
      </Routes>
    </Suspense>
  );
};


