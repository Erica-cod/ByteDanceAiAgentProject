import React from 'react';
import { useDateFormat } from '../../../hooks';
import './PlanCard.css';

interface Task {
  title: string;
  estimated_hours: number;
  deadline?: string;
  tags?: string[];
  status?: 'pending' | 'in_progress' | 'completed';
}

interface PlanData {
  plan_id?: string;
  planId?: string;
  title: string;
  goal: string;
  tasks: Task[];
  tasks_count?: number;
  created_at?: string;
  updated_at?: string;
}

interface PlanCardProps {
  planData: PlanData;
  compact?: boolean;
  index?: number;
}

const DateDisplay: React.FC<{ date?: string }> = ({ date }) => {
  const formattedDate = useDateFormat(date || '', { relative: false });
  return <>{formattedDate}</>;
};

const PlanCard: React.FC<PlanCardProps> = ({ planData, compact = false, index }) => {
  const planId = planData.plan_id || planData.planId;
  const tasksCount = planData.tasks_count || planData.tasks?.length || 0;

  const getStatusBadge = (status?: string) => {
    const statusMap = {
      pending: { label: '待开始', className: 'status-pending' },
      in_progress: { label: '进行中', className: 'status-progress' },
      completed: { label: '已完成', className: 'status-completed' },
    };
    const statusInfo = statusMap[status as keyof typeof statusMap] || statusMap.pending;
    return <span className={`task-status ${statusInfo.className}`}>{statusInfo.label}</span>;
  };

  if (compact) {
    return (
      <div className="plan-card-compact">
        {index !== undefined && (
          <div className="plan-compact-index">{index + 1}</div>
        )}

        <div className="plan-compact-content">
          <div className="plan-compact-header">
            <h4 className="plan-compact-title">{planData.title}</h4>
            {planId && <span className="plan-compact-id">ID: {planId.substring(0, 8)}...</span>}
          </div>

          <div className="plan-compact-goal">
            <span className="goal-icon">🎯</span>
            {planData.goal}
          </div>

          {planData.tasks && planData.tasks.length > 0 && (
            <div className="plan-compact-tasks">
              <div className="compact-tasks-label">📝 任务清单 ({planData.tasks.length})</div>
              <ul className="compact-tasks-list">
                {planData.tasks.map((task, idx) => (
                  <li key={idx} className="compact-task-item">
                    <span className="compact-task-number">{idx + 1}.</span>
                    <span className="compact-task-title">{task.title}</span>
                    {task.deadline && (
                      <span className="compact-task-deadline">
                        📆 {task.deadline}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="plan-compact-meta">
            <span className="meta-item">
              <span className="meta-icon">✓</span>
              {tasksCount} 个任务
            </span>
            {planData.created_at && (
              <span className="meta-item">
                <span className="meta-icon">📅</span>
                创建于 <DateDisplay date={planData.created_at} />
              </span>
            )}
            {planData.updated_at && planData.updated_at !== planData.created_at && (
              <span className="meta-item">
                <span className="meta-icon">🔄</span>
                更新于 <DateDisplay date={planData.updated_at} />
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="plan-card">
      <div className="plan-card-header">
        <div className="plan-title-section">
          <h3 className="plan-title">📋 {planData.title}</h3>
          {planId && <span className="plan-id">ID: {planId.substring(0, 8)}...</span>}
        </div>
        <div className="plan-meta">
          <span className="plan-tasks-count">
            <span className="meta-icon">✓</span>
            {tasksCount} 个任务
          </span>
          {planData.created_at && (
            <span className="plan-date">
              <span className="meta-icon">📅</span>
              <DateDisplay date={planData.created_at} />
            </span>
          )}
        </div>
      </div>

      <div className="plan-goal">
        <div className="goal-label">🎯 目标</div>
        <div className="goal-content">{planData.goal}</div>
      </div>

      {planData.tasks && planData.tasks.length > 0 && (
        <div className="plan-tasks">
          <div className="tasks-label">📝 任务清单</div>
          <div className="tasks-list">
            {planData.tasks.map((task, index) => (
              <div key={index} className="task-item">
                <div className="task-header">
                  <span className="task-number">{index + 1}</span>
                  <span className="task-title">{task.title}</span>
                  {task.status && getStatusBadge(task.status)}
                </div>
                <div className="task-details">
                  {task.estimated_hours && (
                    <span className="task-detail">
                      <span className="detail-icon">⏱️</span>
                      {task.estimated_hours} 小时
                    </span>
                  )}
                  {task.deadline && (
                    <span className="task-detail">
                      <span className="detail-icon">📆</span>
                      {task.deadline}
                    </span>
                  )}
                  {task.tags && task.tags.length > 0 && (
                    <span className="task-tags">
                      {task.tags.map((tag, tagIndex) => (
                        <span key={tagIndex} className="task-tag">
                          {tag}
                        </span>
                      ))}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {planData.updated_at && (
        <div className="plan-footer">
          <span className="update-time">
            最后更新: <DateDisplay date={planData.updated_at} />
          </span>
        </div>
      )}
    </div>
  );
};

const removeJSONComments = (jsonStr: string): string => {
  let result = jsonStr.replace(/\/\/[^\n]*/g, '');
  result = result.replace(/\/\*[\s\S]*?\*\//g, '');
  return result;
};

const isCompleteJSON = (text: string): boolean => {
  let braceCount = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

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
      if (char === '}') braceCount--;
    }
  }

  return braceCount === 0 && !inString;
};

export const extractPlanData = (text: string): PlanData | null => {
  try {
    const toolResultRegex = /<tool_result>([\s\S]*?)<\/tool_result>/;
    const toolResultMatch = text.match(toolResultRegex);

    if (toolResultMatch) {
      const content = toolResultMatch[1];
      const dataMatch = content.match(/详细数据[：:]\s*(\{[\s\S]*?\})\s*(?:<\/tool_result>|$)/);
      if (dataMatch) {
        try {
          const planData = JSON.parse(dataMatch[1]);
          if (planData.title && planData.goal) {
            return planData;
          }
        } catch (e) {
          // ignore
        }
      }
    }

    const codeBlockMatch = text.match(/```(?:json)?\s*\n?(\{[\s\S]*?\})\s*\n?```/);
    if (codeBlockMatch) {
      try {
        let jsonStr = codeBlockMatch[1].trim();
        jsonStr = removeJSONComments(jsonStr);
        const planData = JSON.parse(jsonStr);
        const hasValidStructure = planData.plan_id && planData.title && planData.goal;
        if (hasValidStructure) {
          return planData;
        }
      } catch (e) {
        // ignore
      }
    }

    const startIndex = text.indexOf('{');
    if (startIndex !== -1) {
      const hasPlanIndicators = text.includes('"tool"') || text.includes('plan_id') || text.includes('"title"');
      if (hasPlanIndicators) {
        let braceCount = 0;
        let jsonEndIndex = -1;
        let inString = false;
        let escapeNext = false;

        for (let i = startIndex; i < text.length; i++) {
          const char = text[i];

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
          let jsonStr = text.substring(startIndex, jsonEndIndex);
          if (isCompleteJSON(jsonStr)) {
            try {
              jsonStr = removeJSONComments(jsonStr);
              const planData = JSON.parse(jsonStr);
              const isValidTool = ['create_plan', 'update_plan', 'get_plan'].includes(planData.tool);

              if (isValidTool && planData.title && planData.goal && planData.tasks) {
                return planData;
              }

              if (!planData.tool && planData.plan_id && planData.title && planData.goal) {
                return planData;
              }
            } catch (e) {
              // ignore
            }
          }
        }
      }
    }

    return null;
  } catch (error) {
    return null;
  }
};

export default PlanCard;

