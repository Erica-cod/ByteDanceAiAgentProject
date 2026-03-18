/**
 * @deprecated 请使用 plan-tools.plugin.ts + toolExecutor.execute() 替代
 *
 * 旧版计划管理工具，已被插件化版本取代。
 * 插件版本自动集成限流、熔断、缓存能力。
 * 此文件保留供参考，将在后续版本中移除。
 */

import { getContainer } from '../../_clean/di-container.js';
import type { Task } from '../../_clean/domain/entities/plan.entity.js';

/**
 * 工具调用结果接口
 */
export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
}

/**
 * 工具 1: create_plan - 创建新计划
 */
export async function handleCreatePlan(
  userId: string,
  params: {
    title: string;
    goal: string;
    tasks: Task[];
  }
): Promise<ToolResult> {
  try {
    // 参数验证
    if (!params.title || !params.goal || !Array.isArray(params.tasks)) {
      return {
        success: false,
        error: '参数错误: title, goal, tasks 都是必填项',
      };
    }

    if (params.tasks.length === 0) {
      return {
        success: false,
        error: '任务列表不能为空',
      };
    }

    // 验证每个任务的结构
    for (const task of params.tasks) {
      if (!task.title || typeof task.estimated_hours !== 'number') {
        return {
          success: false,
          error: '任务格式错误: 每个任务必须包含 title 和 estimated_hours',
        };
      }
    }

    // 🆕 使用 Clean Architecture Use Case
    const container = getContainer();
    const createPlanUseCase = container.getCreatePlanUseCase();

    const plan = await createPlanUseCase.execute({
      userId,
      title: params.title,
      goal: params.goal,
      tasks: params.tasks,
    });

    return {
      success: true,
      data: {
        plan_id: plan.planId,
        title: plan.title,
        goal: plan.goal,
        tasks_count: plan.tasks.length,
        created_at: plan.createdAt,
      },
      message: `✅ 计划 "${plan.title}" 创建成功！包含 ${plan.tasks.length} 个任务。`,
    };
  } catch (error: any) {
    console.error('❌ create_plan 工具执行失败:', error);
    return {
      success: false,
      error: `创建计划失败: ${error.message}`,
    };
  }
}

/**
 * 工具 2: update_plan - 更新计划
 */
export async function handleUpdatePlan(
  userId: string,
  params: {
    plan_id: string;
    title?: string;
    goal?: string;
    tasks?: Task[];
  }
): Promise<ToolResult> {
  try {
    // 参数验证
    if (!params.plan_id) {
      return {
        success: false,
        error: '参数错误: plan_id 是必填项',
      };
    }

    // 检查是否至少提供了一个更新字段
    if (!params.title && !params.goal && !params.tasks) {
      return {
        success: false,
        error: '至少需要提供 title, goal 或 tasks 中的一个字段进行更新',
      };
    }

    // 🆕 使用 Clean Architecture Use Case
    const container = getContainer();
    const updatePlanUseCase = container.getUpdatePlanUseCase();

    const plan = await updatePlanUseCase.execute({
      planId: params.plan_id,
      userId,
      title: params.title,
      goal: params.goal,
      tasks: params.tasks,
    });

    if (!plan) {
      return {
        success: false,
        error: `计划不存在或无权限访问: ${params.plan_id}`,
      };
    }

    return {
      success: true,
      data: {
        plan_id: plan.planId,
        title: plan.title,
        goal: plan.goal,
        tasks_count: plan.tasks.length,
        updated_at: plan.updatedAt,
      },
      message: `✅ 计划 "${plan.title}" 更新成功！`,
    };
  } catch (error: any) {
    console.error('❌ update_plan 工具执行失败:', error);
    return {
      success: false,
      error: `更新计划失败: ${error.message}`,
    };
  }
}

/**
 * 工具 3: get_plan - 获取单个计划详情
 */
export async function handleGetPlan(
  userId: string,
  params: {
    plan_id: string;
  }
): Promise<ToolResult> {
  try {
    // 参数验证
    if (!params.plan_id) {
      return {
        success: false,
        error: '参数错误: plan_id 是必填项',
      };
    }

    // 🆕 使用 Clean Architecture Use Case
    const container = getContainer();
    const getPlanUseCase = container.getGetPlanUseCase();

    const plan = await getPlanUseCase.execute({
      planId: params.plan_id,
      userId,
    });

    if (!plan) {
      return {
        success: false,
        error: `计划不存在或无权限访问: ${params.plan_id}`,
      };
    }

    return {
      success: true,
      data: {
        plan_id: plan.planId,
        title: plan.title,
        goal: plan.goal,
        tasks: plan.tasks,
        created_at: plan.createdAt,
        updated_at: plan.updatedAt,
      },
      message: `📋 计划详情: "${plan.title}"`,
    };
  } catch (error: any) {
    console.error('❌ get_plan 工具执行失败:', error);
    return {
      success: false,
      error: `获取计划失败: ${error.message}`,
    };
  }
}

/**
 * 工具 4: list_plans - 列出所有计划
 */
export async function handleListPlans(
  userId: string,
  params: {
    limit?: number;
  }
): Promise<ToolResult> {
  try {
    const limit = params.limit && params.limit > 0 ? params.limit : 10;

    // 限制最大返回数量
    const safeLimit = Math.min(limit, 50);

    // 🆕 使用 Clean Architecture Use Case
    const container = getContainer();
    const listPlansUseCase = container.getListPlansUseCase();

    const result = await listPlansUseCase.execute({
      userId,
      limit: safeLimit,
    });

    if (result.plans.length === 0) {
      return {
        success: true,
        data: {
          plans: [],
          total: 0,
        },
        message: '📋 你还没有创建任何计划。',
      };
    }

    // 简化计划信息用于列表展示（包含完整的任务数据）
    const simplifiedPlans = result.plans.map(plan => ({
      plan_id: plan.planId,
      title: plan.title,
      goal: plan.goal,
      tasks: plan.tasks, // 包含完整的任务数组
      tasks_count: plan.tasks.length,
      created_at: plan.createdAt,
      updated_at: plan.updatedAt,
    }));

    return {
      success: true,
      data: {
        plans: simplifiedPlans,
        total: result.total,
        limit: safeLimit,
      },
      message: `📋 找到 ${result.plans.length} 个计划（共 ${result.total} 个）`,
    };
  } catch (error: any) {
    console.error('❌ list_plans 工具执行失败:', error);
    return {
      success: false,
      error: `获取计划列表失败: ${error.message}`,
    };
  }
}

/**
 * 工具路由器 - 根据工具名调用对应的处理函数
 */
export async function routePlanningTool(
  toolName: string,
  userId: string,
  params: any
): Promise<ToolResult> {
  switch (toolName) {
    case 'create_plan':
      return handleCreatePlan(userId, params);
    case 'update_plan':
      return handleUpdatePlan(userId, params);
    case 'get_plan':
      return handleGetPlan(userId, params);
    case 'list_plans':
      return handleListPlans(userId, params);
    default:
      return {
        success: false,
        error: `未知的计划工具: ${toolName}`,
      };
  }
}

