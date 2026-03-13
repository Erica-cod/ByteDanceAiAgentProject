import React, { useEffect, useMemo, useState } from 'react';

type MarkdownComponentType = React.ComponentType<any>;
type MarkdownPlugin = unknown;

interface BaseMarkdownRendererProps {
  content: string;
  components?: Record<string, (props: any) => React.ReactNode>;
  className?: string;
  fallbackClassName?: string;
  enableHighlight?: boolean;
  onLoadError?: (error: Error) => void;
}

/**
 * 基础 Markdown 渲染组件（无业务规则）
 *
 * 设计目标：
 * - 对外只暴露最小可用接口
 * - 对内负责 markdown 引擎的按需加载
 * - 业务组件只关注“要渲染什么”，不关心“如何加载引擎”
 */
export const BaseMarkdownRenderer: React.FC<BaseMarkdownRendererProps> = ({
  content,
  components,
  className = '',
  fallbackClassName = 'markdown-plain-text-fallback',
  enableHighlight = true,
  onLoadError,
}) => {
  const [ReactMarkdownComponent, setReactMarkdownComponent] = useState<MarkdownComponentType | null>(null);
  const [remarkGfmPlugin, setRemarkGfmPlugin] = useState<MarkdownPlugin | null>(null);
  const [rehypeHighlightPlugin, setRehypeHighlightPlugin] = useState<MarkdownPlugin | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);

  const hasCodeBlock = useMemo(() => /```/.test(content), [content]);

  useEffect(() => {
    let cancelled = false;

    const loadCoreMarkdownModules = async () => {
      try {
        const [reactMarkdownModule, remarkGfmModule] = await Promise.all([
          import('react-markdown'),
          import('remark-gfm'),
        ]);

        if (cancelled) return;
        setReactMarkdownComponent(() => reactMarkdownModule.default as MarkdownComponentType);
        setRemarkGfmPlugin(() => remarkGfmModule.default as MarkdownPlugin);
      } catch (error) {
        if (cancelled) return;
        const safeError = error instanceof Error ? error : new Error('加载 Markdown 引擎失败');
        setLoadError(safeError);
        onLoadError?.(safeError);
      }
    };

    if (!ReactMarkdownComponent || !remarkGfmPlugin) {
      loadCoreMarkdownModules();
    }

    return () => {
      cancelled = true;
    };
  }, [ReactMarkdownComponent, remarkGfmPlugin, onLoadError]);

  useEffect(() => {
    if (!enableHighlight || !hasCodeBlock || rehypeHighlightPlugin) {
      return;
    }

    let cancelled = false;
    const loadHighlightPlugin = async () => {
      try {
        const rehypeHighlightModule = await import('rehype-highlight');
        if (cancelled) return;
        setRehypeHighlightPlugin(() => rehypeHighlightModule.default as MarkdownPlugin);
      } catch (error) {
        if (cancelled) return;
        const safeError = error instanceof Error ? error : new Error('加载代码高亮插件失败');
        setLoadError(safeError);
        onLoadError?.(safeError);
      }
    };

    loadHighlightPlugin();
    return () => {
      cancelled = true;
    };
  }, [enableHighlight, hasCodeBlock, rehypeHighlightPlugin, onLoadError]);

  if (!content) {
    return null;
  }

  if (loadError || !ReactMarkdownComponent || !remarkGfmPlugin) {
    return <pre className={fallbackClassName}>{content}</pre>;
  }

  const rehypePlugins = enableHighlight && hasCodeBlock && rehypeHighlightPlugin
    ? [rehypeHighlightPlugin]
    : [];

  return (
    <div className={className}>
      <ReactMarkdownComponent
        remarkPlugins={[remarkGfmPlugin]}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {content}
      </ReactMarkdownComponent>
    </div>
  );
};

BaseMarkdownRenderer.displayName = 'BaseMarkdownRenderer';

