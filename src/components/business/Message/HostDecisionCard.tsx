/**
 * HostDecisionCard - 主持人决策展示卡片
 */

import React from 'react';
import type { HostDecision } from '@/types/message';
import { ACTION_NAMES, AGENT_NAMES } from '@/constants';

interface HostDecisionCardProps {
  decision: HostDecision;
}

const HostDecisionCard: React.FC<HostDecisionCardProps> = ({ decision }) => (
  <div className="host-decision">
    <div className="decision-header">
      <span className="decision-icon">🎯</span>
      <span className="decision-title">主持人决策</span>
    </div>
    <div className="decision-content">
      <div className="decision-action">
        <strong>决策：</strong>
        {ACTION_NAMES[decision.action] || decision.action}
      </div>
      <div className="decision-reason">
        <strong>理由：</strong>
        {decision.reason}
      </div>
      <div className="decision-next">
        <strong>下一轮发言：</strong>
        {decision.next_agents
          .map((a) => AGENT_NAMES[a] || a)
          .join('、')}
      </div>
    </div>
  </div>
);

export default HostDecisionCard;
