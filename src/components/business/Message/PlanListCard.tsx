import React from 'react';
import PlanCard from './PlanCard';
import './PlanCard.css';

interface Task {
  title: string;
  estimated_hours: number;
  deadline?: string;
  tags?: string[];
  status?: 'pending' | 'in_progress' | 'completed';
}

interface PlanSummary {
  plan_id: string;
  title: string;
  goal: string;
  tasks: Task[];
  tasks_count?: number;
  created_at?: string;
  updated_at?: string;
}

interface PlanListData {
  plans: PlanSummary[];
  total: number;
  limit: number;
}

interface PlanListCardProps {
  listData: PlanListData;
}

const PlanListCard: React.FC<PlanListCardProps> = ({ listData }) => {
  return (
    <div className="plan-list-card">
      <div className="plan-list-header">
        <h3 className="plan-list-title">
          📚 计划列表
          <span className="plan-count-badge">{listData.total} 个计划</span>
        </h3>
      </div>

      {listData.plans.length > 0 ? (
        <div className="plan-list-items">
          {listData.plans.map((plan, index) => (
            <PlanCard
              key={plan.plan_id}
              planData={{
                plan_id: plan.plan_id,
                title: plan.title,
                goal: plan.goal,
                tasks: plan.tasks,
                tasks_count: plan.tasks_count || plan.tasks?.length || 0,
                created_at: plan.created_at,
                updated_at: plan.updated_at,
              }}
              compact={true}
              index={index}
            />
          ))}
        </div>
      ) : (
        <div className="plan-list-empty">
          <span className="empty-icon">📭</span>
          <p>暂无计划</p>
        </div>
      )}

      {listData.plans.length < listData.total && (
        <div className="plan-list-footer">
          <span className="more-info">
            显示前 {listData.limit} 个计划，共 {listData.total} 个
          </span>
        </div>
      )}
    </div>
  );
};

function extractCompleteJSON(text: string, startIndex: number): string | null {
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
    return text.substring(startIndex, jsonEndIndex);
  }

  return null;
}

export const extractPlanListData = (text: string): PlanListData | null => {
  try {
    const toolResultRegex = /<tool_result>([\s\S]*?)<\/tool_result>/;
    const toolResultMatch = text.match(toolResultRegex);

    if (toolResultMatch) {
      const content = toolResultMatch[1];
      const dataIndex = content.search(/详细数据[：:]\s*/);
      if (dataIndex !== -1) {
        const afterLabel = content.substring(dataIndex);
        const jsonStartIndex = afterLabel.indexOf('{');

        if (jsonStartIndex !== -1) {
          const jsonStr = extractCompleteJSON(afterLabel, jsonStartIndex);
          if (jsonStr) {
            try {
              const data = JSON.parse(jsonStr);
              if (data.plans && Array.isArray(data.plans)) {
                return {
                  plans: data.plans,
                  total: data.total || data.plans.length,
                  limit: data.limit || 10,
                };
              }
            } catch (e) {
              // ignore
            }
          }
        }
      }
    }

    const plansIndex = text.indexOf('"plans"');
    if (plansIndex !== -1) {
      let jsonStart = -1;
      for (let i = plansIndex; i >= 0; i--) {
        if (text[i] === '{') {
          jsonStart = i;
          break;
        }
      }

      if (jsonStart !== -1) {
        const jsonStr = extractCompleteJSON(text, jsonStart);
        if (jsonStr) {
          try {
            const data = JSON.parse(jsonStr);
            if (data.plans && Array.isArray(data.plans)) {
              return {
                plans: data.plans,
                total: data.total || data.plans.length,
                limit: data.limit || 10,
              };
            }
          } catch (e) {
            // ignore
          }
        }
      }
    }

    return null;
  } catch (error) {
    return null;
  }
};

export default PlanListCard;

