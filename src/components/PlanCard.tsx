import React from 'react';
import './PlanCard.css';

interface Task {
  title: string;
  estimated_hours: number;
  deadline?: string; // 可选字段
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
  compact?: boolean; // 是否使用精简模式（用于列表展示）
  index?: number; // 在列表中的序号
}

/**
 * 计划卡片组件 - 用于渲染计划数据
 * 
 * @param planData - 计划数据
 * @param compact - 精简模式（不显示完整任务列表）
 * @param index - 在列表中的序号（用于精简模式）
 */
const PlanCard: React.FC<PlanCardProps> = ({ planData, compact = false, index }) => {
  const planId = planData.plan_id || planData.planId;
  const tasksCount = planData.tasks_count || planData.tasks?.length || 0;

  // 格式化日期
  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  // 获取状态标签
  const getStatusBadge = (status?: string) => {
    const statusMap = {
      pending: { label: '待开始', className: 'status-pending' },
      in_progress: { label: '进行中', className: 'status-progress' },
      completed: { label: '已完成', className: 'status-completed' },
    };
    const statusInfo = statusMap[status as keyof typeof statusMap] || statusMap.pending;
    return <span className={`task-status ${statusInfo.className}`}>{statusInfo.label}</span>;
  };

  // 精简模式（用于列表）
  if (compact) {
    // 调试日志
    console.log('🔍 [PlanCard Compact] 渲染精简模式:', {
      title: planData.title,
      hasTasks: !!planData.tasks,
      tasksLength: planData.tasks?.length,
      tasks: planData.tasks,
    });
    
    return (
      <div className="plan-card-compact">
        {/* 序号 */}
        {index !== undefined && (
          <div className="plan-compact-index">{index + 1}</div>
        )}
        
        {/* 内容区 */}
        <div className="plan-compact-content">
          <div className="plan-compact-header">
            <h4 className="plan-compact-title">{planData.title}</h4>
            {planId && <span className="plan-compact-id">ID: {planId.substring(0, 8)}...</span>}
          </div>
          
          <div className="plan-compact-goal">
            <span className="goal-icon">🎯</span>
            {planData.goal}
          </div>
          
          {/* 精简的任务列表 - 如果有任务数据则显示 */}
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
                创建于 {formatDate(planData.created_at)}
              </span>
            )}
            {planData.updated_at && planData.updated_at !== planData.created_at && (
              <span className="meta-item">
                <span className="meta-icon">🔄</span>
                更新于 {formatDate(planData.updated_at)}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 完整模式
  return (
    <div className="plan-card">
      {/* 卡片头部 */}
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
              {formatDate(planData.created_at)}
            </span>
          )}
        </div>
      </div>

      {/* 目标描述 */}
      <div className="plan-goal">
        <div className="goal-label">🎯 目标</div>
        <div className="goal-content">{planData.goal}</div>
      </div>

      {/* 任务列表 */}
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

      {/* 底部信息 */}
      {planData.updated_at && (
        <div className="plan-footer">
          <span className="update-time">
            最后更新: {formatDate(planData.updated_at)}
          </span>
        </div>
      )}
    </div>
  );
};

/**
 * 移除 JSON 字符串中的注释
 */
const removeJSONComments = (jsonStr: string): string => {
  // 移除单行注释 //
  let result = jsonStr.replace(/\/\/[^\n]*/g, '');
  // 移除多行注释 /* */
  result = result.replace(/\/\*[\s\S]*?\*\//g, '');
  return result;
};

/**
 * 检查 JSON 字符串是否完整（大括号闭合）
 */
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

/**
 * 从文本中提取计划数据
 */
export const extractPlanData = (text: string): PlanData | null => {
  try {
    // 1. 尝试匹配 <tool_result> 标签中的 JSON
    const toolResultRegex = /<tool_result>([\s\S]*?)<\/tool_result>/;
    const toolResultMatch = text.match(toolResultRegex);
    
    if (toolResultMatch) {
      const content = toolResultMatch[1];
      
      // 尝试提取 "详细数据:" 后面的 JSON
      const dataMatch = content.match(/详细数据[：:]\s*(\{[\s\S]*?\})\s*(?:<\/tool_result>|$)/);
      if (dataMatch) {
        try {
          const planData = JSON.parse(dataMatch[1]);
          if (planData.title && planData.goal) {
            return planData;
          }
        } catch (e) {
          // 解析失败，继续尝试其他方法
        }
      }
    }

    // 2. 尝试从 Markdown 代码块中提取（如 ```json { ... } ```）
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?(\{[\s\S]*?\})\s*\n?```/);
    if (codeBlockMatch) {
      try {
        let jsonStr = codeBlockMatch[1].trim();
        jsonStr = removeJSONComments(jsonStr);
        const planData = JSON.parse(jsonStr);
        
        // 检查是否是有效的计划数据（带或不带tool字段）
        const hasValidStructure = planData.plan_id && planData.title && planData.goal;
        if (hasValidStructure) {
          console.log('✅ 从Markdown代码块中提取计划数据:', {
            source: 'code block',
            tool: planData.tool || 'no tool field',
            plan_id: planData.plan_id,
            title: planData.title,
            hasTasks: !!planData.tasks
          });
          return planData;
        }
      } catch (e) {
        console.warn('⚠️ 从代码块提取失败:', e);
      }
    }
    
    // 3. 尝试匹配包含 tool 字段的完整 JSON
    // 找到从第一个 { 开始到最后一个 } 的完整 JSON
    const startIndex = text.indexOf('{');
    if (startIndex !== -1) {
      // ✅ 检查是否包含计划相关标识（不再限制只有create_plan）
      const hasPlanIndicators = text.includes('"tool"') || text.includes('plan_id') || text.includes('"title"');
      if (hasPlanIndicators) {
        // 找到完整的 JSON 字符串
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
          
          // 只在 JSON 完整时才解析
          if (isCompleteJSON(jsonStr)) {
            try {
              // 移除注释
              jsonStr = removeJSONComments(jsonStr);
              
              const planData = JSON.parse(jsonStr);
              
              // ✅ 支持 create_plan, update_plan, get_plan 的结果
              const isValidTool = ['create_plan', 'update_plan', 'get_plan'].includes(planData.tool);
              
              if (isValidTool && planData.title && planData.goal && planData.tasks) {
                console.log('✅ 成功提取计划数据:', {
                  tool: planData.tool,
                  title: planData.title,
                  tasksCount: planData.tasks.length
                });
                return planData;
              }
              
              // ✅ 新增：也支持没有 tool 字段的纯计划数据（AI直接输出的情况）
              if (!planData.tool && planData.plan_id && planData.title && planData.goal) {
                console.log('✅ 成功提取纯计划数据（无tool字段）:', {
                  plan_id: planData.plan_id,
                  title: planData.title,
                  hasCustom: !!planData.tasks
                });
                return planData;
              }
            } catch (e) {
              console.warn('⚠️ JSON 解析失败:', e);
            }
          }
        }
      }
    }

    return null;
  } catch (error) {
    // 静默失败，不打印错误（避免流式输出时大量错误）
    return null;
  }
};

export default PlanCard;

