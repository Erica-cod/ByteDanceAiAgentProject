import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import PlanCard, { extractPlanData } from './PlanCard';
import PlanListCard, { extractPlanListData } from './PlanListCard';
import './StreamingMarkdown.css';

// ✅ 导入新的 Markdown 样式（CLS 优化）

interface StreamingMarkdownProps {
  content: string;
  className?: string;
}

/**
 * ⚡ 实时隐藏 JSON 流式输出（性能优化 + 用户体验）
 * 
 * 策略：
 * 1. 如果内容以 `{` 开头，立即隐藏（流式阶段）
 * 2. 如果检测到完整 JSON，移除它
 * 3. 避免用户看到 `{ "position": ...` 的流式输出
 */
function removeJSONFromContent(content: string): string {
  const trimmedContent = content.trim();
  
  // ⚡ 关键优化：如果内容以 `{` 开头，认为是 JSON metadata 正在流式输出
  // 直接返回空字符串，避免显示 JSON 字符
  if (trimmedContent.startsWith('{')) {
    // 检查是否有 JSON 之外的内容（换行后的文本）
    const lines = content.split('\n');
    let jsonEndLineIndex = -1;
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
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
              jsonEndLineIndex = lineIdx;
              break;
            }
          }
        }
      }
      if (jsonEndLineIndex !== -1) break;
    }
    
    // 如果找到完整 JSON，返回 JSON 后面的内容
    if (jsonEndLineIndex !== -1 && jsonEndLineIndex < lines.length - 1) {
      return lines.slice(jsonEndLineIndex + 1).join('\n').trim();
    }
    
    // 如果 JSON 未完成（流式阶段），返回空或等待图标
    return ''; // ⚡ 关键：流式阶段不显示任何内容，避免 JSON 字符闪现
  }
  
  // 如果不是以 `{` 开头，检查是否包含嵌入的 JSON
  const startIndex = trimmedContent.indexOf('{');
  if (startIndex === -1) {
    return content; // 没有 JSON，直接返回
  }
  
  // 尝试移除完整的 JSON 对象
  let braceCount = 0;
  let jsonEndIndex = -1;
  let inString = false;
  let escapeNext = false;
  
  for (let i = startIndex; i < trimmedContent.length; i++) {
    const char = trimmedContent[i];
    
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
    // 移除 JSON 部分
    const result = (trimmedContent.substring(0, startIndex) + trimmedContent.substring(jsonEndIndex)).trim();
    return result;
  }
  
  return content;
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
    // ✅ 始终先移除 JSON（适用于所有 agent 输出）
    const cleanContent = removeJSONFromContent(content);
    
    // 优先检测计划列表（因为 list_plans 更常见）
    const listData = extractPlanListData(content);
    if (listData) {
      console.log('✅ 检测到计划列表，准备渲染');
      return {
        planData: null,
        planListData: listData,
        displayContent: cleanContent,
      };
    }
    
    // 检测单个计划
    const singlePlan = extractPlanData(content);
    if (singlePlan) {
      console.log('✅ 检测到单个计划，准备渲染');
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
