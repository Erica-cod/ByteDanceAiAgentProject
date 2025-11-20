import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import './StreamingMarkdown.css';

interface StreamingMarkdownProps {
  content: string;
  className?: string;
}

/**
 * 支持流式渲染的 Markdown 组件
 * 
 * 特点：
 * 1. 累积接收的内容并实时渲染
 * 2. 即使 Markdown 标记不完整（如单独的 **）也能优雅处理
 * 3. react-markdown 会持续解析累积的内容，正确显示已完整的格式
 * 4. 支持 GFM（表格、删除线、任务列表等）
 * 5. 支持代码高亮
 */
const StreamingMarkdown: React.FC<StreamingMarkdownProps> = ({ content, className = '' }) => {
  return (
    <div className={`streaming-markdown ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
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
          // 自定义列表项渲染 - 解决流式渲染时的对齐问题 AI辅助修改：react-markdown 在内容增加时，会自动在列表项中插入 <p> 标签包裹文本，导致换行和错位。
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
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default StreamingMarkdown;

