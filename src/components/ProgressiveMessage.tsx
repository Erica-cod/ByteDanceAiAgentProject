/**
 * 渐进式消息显示组件
 * 
 * 功能：
 * 1. 初始只显示前1000字符（预览）
 * 2. 用户可以点击"加载下一块"逐步加载
 * 3. 或者点击"全部展开"一次性加载所有剩余内容
 * 4. 显示加载进度和剩余内容统计
 */

import React, { useState, useCallback } from 'react';
import StreamingMarkdown from './StreamingMarkdown';
import './ProgressiveMessage.css';

interface ProgressiveMessageProps {
  messageId: string;
  userId: string;
  initialContent: string;  // 预览内容（前1000字符）
  totalLength: number;     // 完整内容长度
  chunkSize?: number;      // 每次加载的大小
}

export const ProgressiveMessage: React.FC<ProgressiveMessageProps> = ({
  messageId,
  userId,
  initialContent,
  totalLength,
  chunkSize = 1000,
}) => {
  // 已加载的内容片段
  const [contentChunks, setContentChunks] = useState<string[]>([initialContent]);
  
  // 当前已加载的长度
  const [loadedLength, setLoadedLength] = useState(initialContent.length);
  
  // 是否正在加载
  const [isLoading, setIsLoading] = useState(false);
  
  // 完整内容（拼接所有已加载的片段）
  const fullContent = contentChunks.join('');
  
  // 是否已全部加载
  const isFullyLoaded = loadedLength >= totalLength;
  
  // 计算进度
  const progress = Math.round((loadedLength / totalLength) * 100);
  const remainingLength = totalLength - loadedLength;
  const remainingChunks = Math.ceil(remainingLength / chunkSize);
  
  /**
   * 加载下一块内容
   */
  const loadMore = useCallback(async () => {
    if (isLoading || isFullyLoaded) return;
    
    setIsLoading(true);
    
    try {
      const response = await fetch(
        `/api/messages/${messageId}/content?` +
        `userId=${userId}&start=${loadedLength}&length=${chunkSize}`
      );
      
      if (!response.ok) {
        throw new Error('加载失败');
      }
      
      const data = await response.json();
      
      // 添加新内容
      setContentChunks(prev => [...prev, data.content]);
      setLoadedLength(prev => prev + data.length);
      
      console.log(`✅ 已加载 ${data.length} 字符`);
    } catch (error) {
      console.error('❌ 加载失败:', error);
      alert('加载失败，请重试');
    } finally {
      setIsLoading(false);
    }
  }, [messageId, userId, loadedLength, chunkSize, isLoading, isFullyLoaded]);
  
  /**
   * 加载所有剩余内容
   */
  const loadAll = useCallback(async () => {
    if (isLoading || isFullyLoaded) return;
    
    setIsLoading(true);
    
    try {
      const remaining = totalLength - loadedLength;
      const chunks = Math.ceil(remaining / chunkSize);
      
      console.log(`🔄 开始加载剩余 ${chunks} 块内容...`);
      
      // 并发加载所有剩余块
      const requests = [];
      for (let i = 0; i < chunks; i++) {
        const start = loadedLength + i * chunkSize;
        const length = Math.min(chunkSize, totalLength - start);
        
        requests.push(
          fetch(
            `/api/messages/${messageId}/content?` +
            `userId=${userId}&start=${start}&length=${length}`
          ).then(res => res.json())
        );
      }
      
      const results = await Promise.all(requests);
      const newChunks = results.map(r => r.content);
      
      setContentChunks(prev => [...prev, ...newChunks]);
      setLoadedLength(totalLength);
      
      console.log(`✅ 全部加载完成`);
    } catch (error) {
      console.error('❌ 加载失败:', error);
      alert('加载失败，请重试');
    } finally {
      setIsLoading(false);
    }
  }, [messageId, userId, loadedLength, chunkSize, totalLength, isLoading, isFullyLoaded]);
  
  /**
   * 收起到初始状态
   */
  const collapse = useCallback(() => {
    setContentChunks([initialContent]);
    setLoadedLength(initialContent.length);
  }, [initialContent]);
  
  return (
    <div className="progressive-message">
      {/* 内容区域 */}
      <div className="progressive-content">
        <StreamingMarkdown content={fullContent} />
      </div>
      
      {/* 加载指示器 */}
      {isLoading && (
        <div className="progressive-loading">
          <div className="loading-spinner"></div>
          <span>加载中...</span>
        </div>
      )}
      
      {/* 控制区（未完全加载时显示） */}
      {!isFullyLoaded && !isLoading && (
        <div className="progressive-controls">
          {/* 进度条 */}
          <div className="progress-bar-container">
            <div 
              className="progress-bar-fill" 
              style={{ width: `${progress}%` }}
            />
            <span className="progress-text">{progress}%</span>
          </div>
          
          {/* 统计信息 */}
          <div className="progressive-stats">
            <span className="stat-item">
              已加载: {loadedLength.toLocaleString()} / {totalLength.toLocaleString()} 字符
            </span>
            <span className="stat-separator">•</span>
            <span className="stat-item">
              剩余: {remainingLength.toLocaleString()} 字符
            </span>
          </div>
          
          {/* 操作按钮 */}
          <div className="progressive-actions">
            <button 
              className="progressive-btn primary"
              onClick={loadMore}
              disabled={isLoading}
            >
              加载下一块
              <span className="btn-info">+{Math.min(chunkSize, remainingLength).toLocaleString()} 字符</span>
            </button>
            
            <button 
              className="progressive-btn secondary"
              onClick={loadAll}
              disabled={isLoading}
            >
              全部展开
              <span className="btn-info">{remainingChunks} 块</span>
            </button>
          </div>
        </div>
      )}
      
      {/* 已全部加载时的控制区 */}
      {isFullyLoaded && loadedLength > initialContent.length && (
        <div className="progressive-controls">
          <div className="progressive-stats">
            <span className="stat-item success">
              ✅ 已加载完整内容 ({totalLength.toLocaleString()} 字符)
            </span>
          </div>
          
          <button 
            className="progressive-btn secondary"
            onClick={collapse}
          >
            收起
          </button>
        </div>
      )}
    </div>
  );
};

