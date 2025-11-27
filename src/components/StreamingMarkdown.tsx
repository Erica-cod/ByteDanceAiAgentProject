import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import PlanCard, { extractPlanData } from './PlanCard';
import PlanListCard, { extractPlanListData } from './PlanListCard';
import './StreamingMarkdown.css';

interface StreamingMarkdownProps {
  content: string;
  className?: string;
}

/**
 * 从内容中移除 JSON 部分（辅助函数）
 */
function removeJSONFromContent(content: string): string {
  let displayContent = content;
  
  // 查找并移除完整的 JSON 对象（包括可能的代码块标记）
  const startIndex = content.indexOf('{');
  if (startIndex !== -1) {
    let braceCount = 0;
    let jsonEndIndex = -1;
    let inString = false;
    let escapeNext = false;
    
    for (let i = startIndex; i < content.length; i++) {
      const char = content[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (char === '"') {
        inString = !inString;
        continue;
      }
      
      if (!inString) {
        if (char === '{') braceCount++;
        if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            jsonEndIndex = i + 1;
            break;
          }
        }
      }
    }
    
    if (jsonEndIndex !== -1) {
      // 检查 JSON 前面是否有代码块标记
      let actualStartIndex = startIndex;
      const beforeJson = content.substring(0, startIndex);
      const codeBlockMatch = beforeJson.match(/```[\w]*\s*$/);
      if (codeBlockMatch) {
        actualStartIndex = beforeJson.length - codeBlockMatch[0].length;
      }
      
      // 检查 JSON 后面是否有代码块结束标记
      let actualEndIndex = jsonEndIndex;
      const afterJson = content.substring(jsonEndIndex);
      const endCodeBlockMatch = afterJson.match(/^\s*```/);
      if (endCodeBlockMatch) {
        actualEndIndex = jsonEndIndex + endCodeBlockMatch[0].length;
      }
      
      // 移除 JSON 部分（包括代码块标记）
      displayContent = content.substring(0, actualStartIndex) + content.substring(actualEndIndex);
      
      // 清理多余的空行和空的代码块
      displayContent = displayContent
        .replace(/```\s*```/g, '') // 移除空的代码块
        .replace(/\n{3,}/g, '\n\n') // 移除多余空行
        .trim();
    }
  }
  
  return displayContent;
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
 * 6. 支持计划卡片和计划列表卡片
 */
const StreamingMarkdown: React.FC<StreamingMarkdownProps> = ({ content, className = '' }) => {
  // 检测计划数据（单个计划或计划列表）
  const { planData, planListData, displayContent } = useMemo(() => {
    // 优先检测计划列表（因为 list_plans 更常见）
    const listData = extractPlanListData(content);
    if (listData) {
      console.log('✅ 检测到计划列表，准备渲染');
      return {
        planData: null,
        planListData: listData,
        displayContent: removeJSONFromContent(content),
      };
    }
    
    // 检测单个计划
    const singlePlan = extractPlanData(content);
    if (singlePlan) {
      console.log('✅ 检测到单个计划，准备渲染');
      return {
        planData: singlePlan,
        planListData: null,
        displayContent: removeJSONFromContent(content),
      };
    }
    
    // 没有检测到计划数据
    return {
      planData: null,
      planListData: null,
      displayContent: content,
    };
  }, [content]);

  return (
    <div className={`streaming-markdown ${className}`}>
      {/* 渲染计划列表卡片 */}
      {planListData && <PlanListCard listData={planListData} />}
      
      {/* 渲染单个计划卡片 */}
      {planData && <PlanCard planData={planData} />}
      
      {/* 渲染处理后的 Markdown 内容（已移除 JSON 部分） */}
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
      >
        {displayContent}
      </ReactMarkdown>
    </div>
  );
};

export default StreamingMarkdown;
