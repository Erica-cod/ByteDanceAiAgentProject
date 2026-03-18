/**
 * 增强版 StreamingMarkdown 组件
 * 
 * 功能增强：
 * 1. ✅ Markdown 格式截断容错处理
 * 2. ✅ react-markdown 失败时的备用渲染器
 * 3. ✅ JSON metadata 自动过滤
 * 4. ✅ 计划卡片渲染支持
 * 5. ✅ 流式渲染优化
 * 
 * 与旧版的区别：
 * - 更强的容错能力（处理代码块、表格、HTML标签截断）
 * - 更可靠的降级方案（react-markdown 失败时不会白屏）
 * - 更好的类型安全
 */

import React, { useMemo, useState, useEffect } from 'react';
import { fixIncompleteMarkdown, safeFixMarkdown } from '@/utils/markdown/markdownFixer';
import { removeJSONFromContent } from '@/utils/markdown/jsonFilter';
import { renderMarkdownFallback } from '@/utils/markdown/fallbackMarkdownRenderer';
import PlanCard, { extractPlanData } from './Plan/PlanCard';
import PlanListCard, { extractPlanListData } from './Plan/PlanListCard';
import { BaseMarkdownRenderer } from '@/components/base';
import styles from './StreamingMarkdown.module.css';

interface StreamingMarkdownProps {
  /** 要渲染的 Markdown 内容 */
  content: string;
  /** 自定义类名 */
  className?: string;
  /** 是否启用容错处理（默认 true） */
  enableFixer?: boolean;
  /** 是否强制使用备用渲染器（用于测试，默认 false） */
  forceFallback?: boolean;
}

// removeJSONFromContent 已提取到 src/utils/markdown/jsonFilter.ts，由 import 引入

/**
 * 增强版 StreamingMarkdown 组件
 * 
 * 特点：
 * 1. 累积接收的内容并实时渲染
 * 2. ✅ 自动检测并修复不完整的 Markdown 标记（代码块、表格、HTML标签等）
 * 3. ✅ react-markdown 失败时自动降级到备用渲染器
 * 4. 支持 GFM（表格、删除线、任务列表等）
 * 5. 支持代码高亮
 * 6. 支持计划卡片和计划列表卡片
 */
const StreamingMarkdown: React.FC<StreamingMarkdownProps> = ({ 
  content, 
  className = '',
  enableFixer = true,
  forceFallback = false,
}) => {
  const [renderError, setRenderError] = useState<Error | null>(null);

  // 重置错误状态（当内容变化时）
  useEffect(() => {
    if (renderError) {
      setRenderError(null);
    }
  }, [content]);

  // 检测计划数据（单个计划或计划列表）
  const { planData, planListData, displayContent } = useMemo(() => {
    //  始终先移除 JSON（适用于所有 agent 输出）
    const cleanContent = removeJSONFromContent(content);
    
    // 优先检测计划列表（因为 list_plans 更常见）
    const listData = extractPlanListData(content);
    if (listData) {
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ 检测到计划列表，准备渲染');
      }
      return {
        planData: null,
        planListData: listData,
        displayContent: cleanContent,
      };
    }
    
    // 检测单个计划
    const singlePlan = extractPlanData(content);
    if (singlePlan) {
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ 检测到单个计划，准备渲染');
      }
      return {
        planData: singlePlan,
        planListData: null,
        displayContent: cleanContent,
      };
    }
    
    // 没有检测到计划数据，但仍使用清理后的内容（移除了 JSON）
    return {
      planData: null,
      planListData: null,
      displayContent: cleanContent,
    };
  }, [content]);

  //  应用 Markdown 容错处理
  const { fixedContent, shouldRenderAsPlainText } = useMemo(() => {
    if (!enableFixer || !displayContent) {
      return {
        fixedContent: displayContent,
        shouldRenderAsPlainText: false,
      };
    }

    // 使用安全修复（只在需要时应用）
    const result = safeFixMarkdown(displayContent);

    // 开发环境下输出修复信息
    if (process.env.NODE_ENV === 'development' && result.content !== displayContent) {
      const fixResult = fixIncompleteMarkdown(displayContent);
      console.log('[StreamingMarkdown] 应用了容错修复:', fixResult.issues);
    }

    return {
      fixedContent: result.content,
      shouldRenderAsPlainText: result.shouldRenderAsPlainText,
    };
  }, [displayContent, enableFixer]);

  //  渲染 Markdown（带错误边界和降级方案）
  const renderContent = () => {
    // 如果没有内容，不渲染
    if (!fixedContent) {
      return null;
    }

    //  如果检测到严重格式错误，直接输出纯文本（不尝试渲染 Markdown）
    if (shouldRenderAsPlainText) {
      return (
        <pre className="markdown-plain-text-fallback">
          {fixedContent}
        </pre>
      );
    }

    // 强制使用备用渲染器（用于测试）
    if (forceFallback) {
      return renderMarkdownFallback(fixedContent, { 
        className: 'fallback-mode',
        gfm: true,
      });
    }

    // 如果之前 react-markdown 抛出错误，使用备用渲染器
    if (renderError) {
      console.warn('[StreamingMarkdown] react-markdown 失败，使用备用渲染器:', renderError);
      return renderMarkdownFallback(fixedContent, { 
        className: 'fallback-mode',
        gfm: true,
      });
    }

    return (
      <BaseMarkdownRenderer
        content={fixedContent}
        className="streaming-markdown-core"
        enableHighlight
        onLoadError={(error) => {
          console.error('[StreamingMarkdown] Markdown 模块加载失败:', error);
          setRenderError(error);
        }}
        components={{
          // 自定义代码块渲染
          code(props: any) {
            const { node, inline, className, children, ...rest } = props;
            return inline ? (
              <code className="inline-code" {...rest}>
                {children}
              </code>
            ) : (
              <code className={className} {...rest}>
                {children}
              </code>
            );
          },
          // 自定义链接渲染（在新标签页打开）
          a(props: any) {
            const { node, children, href, ...rest } = props;
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
                {children}
              </a>
            );
          },
          // 自定义表格样式
          table(props: any) {
            const { node, children, ...rest } = props;
            return (
              <div className="table-wrapper">
                <table {...rest}>{children}</table>
              </div>
            );
          },
          // 自定义列表项渲染 - 解决流式渲染时的对齐问题
          li(props: any) {
            const { node, children, ...rest } = props;
            return (
              <li {...rest}>
                {children}
              </li>
            );
          },
          // 自定义段落渲染 - 在列表项中的段落特殊处理
          p(props: any) {
            const { node, children, ...rest } = props;
            // 检查父元素是否是列表项
            const isInListItem = node?.position &&
              node.parent?.type === 'listItem';

            if (isInListItem) {
              // 列表项中的段落使用 span 替代，避免换行
              return <span className="list-item-text">{children}</span>;
            }

            return <p {...rest}>{children}</p>;
          },
        }}
      />
    );
  };

  return (
    <div className={`${styles['streaming-markdown']} ${className}`}>
      {/* 渲染计划列表卡片 */}
      {planListData && <PlanListCard listData={planListData} />}
      
      {/* 渲染单个计划卡片 */}
      {planData && <PlanCard planData={planData} />}
      
      {/* 渲染处理后的 Markdown 内容（已移除 JSON 部分 + 容错修复） */}
      {renderContent()}

      {/* 开发环境下显示调试信息 */}
      {process.env.NODE_ENV === 'development' && renderError && (
        <div className="markdown-error-notice">
          ⚠️ 降级到备用渲染器
        </div>
      )}
      {process.env.NODE_ENV === 'development' && shouldRenderAsPlainText && (
        <div className="markdown-error-notice severe-error">
          ⚠️ 检测到严重格式错误，已降级为纯文本输出
        </div>
      )}
    </div>
  );
};

export default StreamingMarkdown;

