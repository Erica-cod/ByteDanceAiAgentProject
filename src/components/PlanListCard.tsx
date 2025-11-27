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
  tasks: Task[]; // 完整的任务数组
  tasks_count?: number; // 任务数量（可选，用于兼容）
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

/**
 * 计划列表卡片组件 - 用于渲染多个计划的摘要
 * 复用 PlanCard 组件的精简模式
 */
const PlanListCard: React.FC<PlanListCardProps> = ({ listData }) => {
  return (
    <div className="plan-list-card">
      {/* 列表头部 */}
      <div className="plan-list-header">
        <h3 className="plan-list-title">
          📚 计划列表
          <span className="plan-count-badge">{listData.total} 个计划</span>
        </h3>
      </div>

      {/* 计划列表 */}
      {listData.plans.length > 0 ? (
        <div className="plan-list-items">
          {listData.plans.map((plan, index) => {
            // 调试日志
            console.log(`🔍 [PlanListCard] 渲染计划 ${index + 1}:`, {
              title: plan.title,
              hasTasks: !!plan.tasks,
              tasksIsArray: Array.isArray(plan.tasks),
              tasksLength: plan.tasks?.length,
              firstTask: plan.tasks?.[0],
            });
            
            return (
              <PlanCard
                key={plan.plan_id}
                planData={{
                  plan_id: plan.plan_id,
                  title: plan.title,
                  goal: plan.goal,
                  tasks: plan.tasks, // 传递完整的任务数据
                  tasks_count: plan.tasks_count || plan.tasks?.length || 0,
                  created_at: plan.created_at,
                  updated_at: plan.updated_at,
                }}
                compact={true}
                index={index}
              />
            );
          })}
        </div>
      ) : (
        <div className="plan-list-empty">
          <span className="empty-icon">📭</span>
          <p>暂无计划</p>
        </div>
      )}

      {/* 底部信息 */}
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

/**
 * 从文本中提取完整的 JSON 对象（支持嵌套）
 */
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

/**
 * 从文本中提取计划列表数据
 */
export const extractPlanListData = (text: string): PlanListData | null => {
  try {
    // 1. 尝试匹配 <tool_result> 标签中的 JSON
    const toolResultRegex = /<tool_result>([\s\S]*?)<\/tool_result>/;
    const toolResultMatch = text.match(toolResultRegex);
    
    if (toolResultMatch) {
      const content = toolResultMatch[1];
      
      // 查找 "详细数据:" 后面的位置
      const dataIndex = content.search(/详细数据[：:]\s*/);
      if (dataIndex !== -1) {
        const afterLabel = content.substring(dataIndex);
        const jsonStartIndex = afterLabel.indexOf('{');
        
        if (jsonStartIndex !== -1) {
          // 提取完整的 JSON 对象
          const jsonStr = extractCompleteJSON(afterLabel, jsonStartIndex);
          
          if (jsonStr) {
            try {
              const data = JSON.parse(jsonStr);
              
              // 检查是否是 list_plans 格式
              if (data.plans && Array.isArray(data.plans)) {
                // 验证 tasks 字段
                const firstPlanHasTasks = data.plans[0]?.tasks && Array.isArray(data.plans[0].tasks);
                
                console.log('✅ [tool_result 提取成功] 计划列表数据:', { 
                  plansCount: data.plans.length, 
                  total: data.total,
                  firstPlanHasTasks,
                  firstPlanTasksLength: data.plans[0]?.tasks?.length || 0,
                });
                
                // 即使 tasks 为空，也返回数据（可能是 AI 删除了）
                return {
                  plans: data.plans,
                  total: data.total || data.plans.length,
                  limit: data.limit || 10,
                };
              } else {
                console.warn('⚠️  data.plans 不存在或不是数组');
              }
            } catch (e) {
              console.error('❌ JSON 解析失败:', e);
            }
          }
        }
      }
    }
    
    // 2. 尝试直接查找包含 "plans" 的 JSON 对象
    const plansIndex = text.indexOf('"plans"');
    if (plansIndex !== -1) {
      // 向前查找最近的 {
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
              console.log('✅ [直接匹配成功] 计划列表数据:', { 
                plansCount: data.plans.length,
                hasTasks: data.plans[0]?.tasks ? `第一个计划有 ${data.plans[0].tasks.length} 个任务` : '无任务'
              });
              return {
                plans: data.plans,
                total: data.total || data.plans.length,
                limit: data.limit || 10,
              };
            }
          } catch (e) {
            console.warn('❌ 直接匹配 JSON 解析失败:', e);
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('❌ 提取计划列表数据异常:', error);
    return null;
  }
};

export default PlanListCard;

