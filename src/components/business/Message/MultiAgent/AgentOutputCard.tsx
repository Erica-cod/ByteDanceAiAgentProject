/**
 * AgentOutputCard - 单个 Agent 输出卡片
 */

import React from 'react';
import StreamingMarkdown from '../StreamingMarkdown';
import { tryParseStreamingJSON, formatPartialAgentData } from '@/utils/json/streamingJsonParser';
import { AGENT_ICONS, AGENT_NAMES, AGENT_STREAMING_MESSAGES } from '@/constants';

interface AgentOutputCardProps {
  agent: string;
  outputType: string;
  displayContent: string;
  isStreaming: boolean;
}

const AgentOutputCard: React.FC<AgentOutputCardProps> = ({
  agent, outputType, displayContent, isStreaming,
}) => {
  let effectiveContent = displayContent;
  if (isStreaming && displayContent) {
    const parsed = tryParseStreamingJSON(displayContent);
    const formatted = parsed ? formatPartialAgentData(parsed) : null;
    if (formatted) effectiveContent = formatted;
  }

  return (
    <div className={`agent-output agent-${agent}`}>
      <div className="agent-header">
        <span className="agent-icon">{AGENT_ICONS[agent]}</span>
        <span className="agent-name">{AGENT_NAMES[agent]}</span>
        <span className="output-type">{outputType}</span>
        {isStreaming && <span className="streaming-indicator">⚡ 生成中...</span>}
      </div>
      <div className="agent-content">
        {effectiveContent && effectiveContent.trim() ? (
          <StreamingMarkdown content={effectiveContent} />
        ) : isStreaming ? (
          <div className="streaming-placeholder">
            <div className="typing-indicator">
              <span></span><span></span><span></span>
            </div>
            <span className="streaming-text">
              {AGENT_STREAMING_MESSAGES[agent] || '正在生成分析...'}
            </span>
          </div>
        ) : (
          <div className="typing-indicator">
            <span></span><span></span><span></span>
          </div>
        )}
      </div>
    </div>
  );
};

export default AgentOutputCard;
