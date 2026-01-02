/**
 * 备用 Markdown 渲染器
 * 
 * 当 react-markdown 依赖加载失败或抛出错误时使用
 * 提供基本的 Markdown 格式支持，确保内容始终可读
 */

import React from 'react';

export interface FallbackRendererOptions {
  /** 是否高亮代码 */
  highlightCode?: boolean;
  /** 是否支持 GFM 扩展（表格、删除线等） */
  gfm?: boolean;
  /** 自定义类名 */
  className?: string;
}

/**
 * 备用 Markdown 渲染器（纯手工解析）
 * 
 * 支持的格式：
 * - 标题（# ## ###）
 * - 粗体（**text** 或 __text__）
 * - 斜体（*text* 或 _text_）
 * - 代码块（```）
 * - 行内代码（`code`）
 * - 链接（[text](url)）
 * - 图片（![alt](url)）
 * - 列表（- 或 * 或 1.）
 * - 引用（> text）
 * - 水平线（--- 或 ***）
 * - 表格（GFM）
 * - 删除线（~~text~~）
 */
export function renderMarkdownFallback(
  markdown: string,
  options: FallbackRendererOptions = {}
): React.ReactElement {
  const { className = '', gfm = true } = options;

  if (!markdown || markdown.trim() === '') {
    return <div className={`fallback-markdown ${className}`} />;
  }

  const lines = markdown.split('\n');
  const elements: React.ReactNode[] = [];
  let currentBlockType: 'normal' | 'code' | 'table' | 'list' = 'normal';
  let codeBlockLines: string[] = [];
  let codeBlockLang = '';
  let tableLines: string[] = [];
  let listLines: { level: number; ordered: boolean; text: string }[] = [];

  const flushCodeBlock = () => {
    if (codeBlockLines.length > 0) {
      elements.push(
        <pre key={`code-${elements.length}`} className="code-block">
          <code className={codeBlockLang ? `language-${codeBlockLang}` : ''}>
            {codeBlockLines.join('\n')}
          </code>
        </pre>
      );
      codeBlockLines = [];
      codeBlockLang = '';
    }
  };

  const flushTable = () => {
    if (tableLines.length > 0) {
      elements.push(renderTable(tableLines, elements.length));
      tableLines = [];
    }
  };

  const flushList = () => {
    if (listLines.length > 0) {
      elements.push(renderList(listLines, elements.length));
      listLines = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 代码块处理
    if (trimmed.startsWith('```')) {
      if (currentBlockType === 'code') {
        // 结束代码块
        flushCodeBlock();
        currentBlockType = 'normal';
      } else {
        // 开始代码块
        flushTable();
        flushList();
        currentBlockType = 'code';
        codeBlockLang = trimmed.substring(3).trim();
      }
      continue;
    }

    if (currentBlockType === 'code') {
      codeBlockLines.push(line);
      continue;
    }

    // 表格处理（GFM）
    if (gfm && (trimmed.startsWith('|') || (trimmed.includes('|') && currentBlockType === 'table'))) {
      if (currentBlockType !== 'table') {
        flushList();
        currentBlockType = 'table';
      }
      tableLines.push(line);
      continue;
    } else if (currentBlockType === 'table') {
      flushTable();
      currentBlockType = 'normal';
    }

    // 列表处理
    const listMatch = trimmed.match(/^(\s*)([-*+]|\d+\.)\s+(.+)$/);
    if (listMatch) {
      if (currentBlockType !== 'list') {
        currentBlockType = 'list';
      }
      const indent = listMatch[1].length;
      const marker = listMatch[2];
      const text = listMatch[3];
      listLines.push({
        level: Math.floor(indent / 2),
        ordered: /^\d+\./.test(marker),
        text,
      });
      continue;
    } else if (currentBlockType === 'list' && trimmed === '') {
      // 空行不结束列表，继续累积
      continue;
    } else if (currentBlockType === 'list') {
      flushList();
      currentBlockType = 'normal';
    }

    // 空行
    if (trimmed === '') {
      elements.push(<br key={`br-${elements.length}`} />);
      continue;
    }

    // 水平线
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      elements.push(<hr key={`hr-${elements.length}`} />);
      continue;
    }

    // 标题
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6;
      const text = headingMatch[2];
      const HeadingTag = `h${level}` as keyof JSX.IntrinsicElements;
      elements.push(
        <HeadingTag key={`heading-${elements.length}`}>
          {renderInlineMarkdown(text, gfm)}
        </HeadingTag>
      );
      continue;
    }

    // 引用
    if (trimmed.startsWith('> ')) {
      const quoteText = trimmed.substring(2);
      elements.push(
        <blockquote key={`quote-${elements.length}`}>
          {renderInlineMarkdown(quoteText, gfm)}
        </blockquote>
      );
      continue;
    }

    // 普通段落
    elements.push(
      <p key={`p-${elements.length}`}>
        {renderInlineMarkdown(trimmed, gfm)}
      </p>
    );
  }

  // 刷新剩余的块
  flushCodeBlock();
  flushTable();
  flushList();

  return (
    <div className={`fallback-markdown ${className}`}>
      {elements}
    </div>
  );
}

/**
 * 渲染行内 Markdown（粗体、斜体、链接等）
 */
function renderInlineMarkdown(text: string, gfm: boolean): React.ReactNode {
  if (!text) return null;

  const elements: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // 粗体（** 或 __）
    const boldMatch = remaining.match(/^(\*\*|__)(.+?)\1/);
    if (boldMatch) {
      elements.push(<strong key={`bold-${key++}`}>{boldMatch[2]}</strong>);
      remaining = remaining.substring(boldMatch[0].length);
      continue;
    }

    // 斜体（* 或 _，但不是 ** 或 __）
    const italicMatch = remaining.match(/^(\*|_)([^*_]+?)\1/);
    if (italicMatch && !remaining.startsWith('**') && !remaining.startsWith('__')) {
      elements.push(<em key={`italic-${key++}`}>{italicMatch[2]}</em>);
      remaining = remaining.substring(italicMatch[0].length);
      continue;
    }

    // 删除线（~~ text ~~）- GFM
    if (gfm) {
      const strikeMatch = remaining.match(/^~~(.+?)~~/);
      if (strikeMatch) {
        elements.push(<del key={`strike-${key++}`}>{strikeMatch[1]}</del>);
        remaining = remaining.substring(strikeMatch[0].length);
        continue;
      }
    }

    // 行内代码（`code`）
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      elements.push(
        <code key={`code-${key++}`} className="inline-code">
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.substring(codeMatch[0].length);
      continue;
    }

    // 图片（![alt](url)）
    const imageMatch = remaining.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (imageMatch) {
      elements.push(
        <img
          key={`img-${key++}`}
          src={imageMatch[2]}
          alt={imageMatch[1]}
          style={{ maxWidth: '100%' }}
        />
      );
      remaining = remaining.substring(imageMatch[0].length);
      continue;
    }

    // 链接（[text](url)）
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      elements.push(
        <a
          key={`link-${key++}`}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
        >
          {linkMatch[1]}
        </a>
      );
      remaining = remaining.substring(linkMatch[0].length);
      continue;
    }

    // 普通字符
    elements.push(remaining[0]);
    remaining = remaining.substring(1);
  }

  return elements;
}

/**
 * 渲染表格
 */
function renderTable(lines: string[], keyPrefix: number): React.ReactElement {
  const rows = lines.map(line => 
    line.split('|')
      .map(cell => cell.trim())
      .filter(cell => cell !== '')
  );

  if (rows.length < 2) {
    // 不是有效的表格
    return <pre key={`table-${keyPrefix}`}>{lines.join('\n')}</pre>;
  }

  const headerRow = rows[0];
  const dataRows = rows.slice(2); // 跳过分隔行

  return (
    <div key={`table-${keyPrefix}`} className="table-wrapper">
      <table>
        <thead>
          <tr>
            {headerRow.map((cell, i) => (
              <th key={`th-${i}`}>{renderInlineMarkdown(cell, true)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dataRows.map((row, i) => (
            <tr key={`tr-${i}`}>
              {row.map((cell, j) => (
                <td key={`td-${j}`}>{renderInlineMarkdown(cell, true)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 渲染列表
 */
function renderList(
  items: { level: number; ordered: boolean; text: string }[],
  keyPrefix: number
): React.ReactElement {
  if (items.length === 0) return <></>;

  const isOrdered = items[0].ordered;
  const ListTag = isOrdered ? 'ol' : 'ul';

  return (
    <ListTag key={`list-${keyPrefix}`}>
      {items.map((item, i) => (
        <li key={`li-${i}`} style={{ marginLeft: `${item.level * 20}px` }}>
          {renderInlineMarkdown(item.text, true)}
        </li>
      ))}
    </ListTag>
  );
}

