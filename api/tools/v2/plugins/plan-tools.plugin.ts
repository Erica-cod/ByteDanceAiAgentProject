/**
 * 计划管理工具插件
 * 
 * 包含 4 个工具：create_plan, update_plan, get_plan, list_plans
 */

import { getContainer } from '../../../_clean/di-container.js';
import type { ToolPlugin } from '../core/types.js';

// ============ 创建计划工具 ============
export const createPlanPlugin: ToolPlugin = {
  metadata: {
    name: 'create_plan',
    description: '创建新的学习或项目计划',
    version: '1.0.0',
    author: 'AI Agent Team',
    tags: ['plan', 'database', 'crud'],
    enabled: true,
  },

  schema: {
    name: 'create_plan',
    description: '创建一个新的学习计划或项目计划，包含标题、目标和任务列表',
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: '计划标题',
        },
        goal: {
          type: 'string',
          description: '计划目标或描述',
        },
        tasks: {
          type: 'array',
          description: '任务列表',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: '任务标题' },
              description: { type: 'string', description: '任务描述' },
              estimated_hours: { type: 'number', description: '预计工时' },
            },
            required: ['title', 'estimated_hours'],
          },
        },
      },
      required: ['title', 'goal', 'tasks'],
    },
  },

  rateLimit: {
    maxConcurrent: 100,
    maxPerMinute: 500,
    timeout: 5000,
  },

  cache: {
    enabled: false, // 写操作不缓存
    ttl: 0,
  },

  circuitBreaker: {
    enabled: true,
    failureThreshold: 10,
    resetTimeout: 30000,
  },

  execute: async (params, context) => {
    const { title, goal, tasks } = params;

    try {
      const container = getContainer();
      const createPlanUseCase = container.getCreatePlanUseCase();

      const plan = await createPlanUseCase.execute({
        userId: context.userId,
        title,
        goal,
        tasks,
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
        message: `✅ 计划 "${plan.title}" 创建成功！包含 ${plan.tasks.length} 个任务`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
};

// ============ 更新计划工具 ============
export const updatePlanPlugin: ToolPlugin = {
  metadata: {
    name: 'update_plan',
    description: '更新现有计划',
    version: '1.0.0',
    author: 'AI Agent Team',
    tags: ['plan', 'database', 'crud'],
    enabled: true,
  },

  schema: {
    name: 'update_plan',
    description: '更新现有计划的标题、目标或任务列表',
    parameters: {
      type: 'object',
      properties: {
        plan_id: {
          type: 'string',
          description: '计划 ID',
        },
        title: {
          type: 'string',
          description: '新的标题（可选）',
        },
        goal: {
          type: 'string',
          description: '新的目标（可选）',
        },
        tasks: {
          type: 'array',
          description: '新的任务列表（可选）',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              estimated_hours: { type: 'number' },
            },
          },
        },
      },
      required: ['plan_id'],
    },
  },

  rateLimit: {
    maxConcurrent: 100,
    maxPerMinute: 500,
    timeout: 5000,
  },

  cache: {
    enabled: false,
    ttl: 0,
  },

  circuitBreaker: {
    enabled: true,
    failureThreshold: 10,
    resetTimeout: 30000,
  },

  execute: async (params, context) => {
    const { plan_id, title, goal, tasks } = params;

    try {
      const container = getContainer();
      const updatePlanUseCase = container.getUpdatePlanUseCase();

      const plan = await updatePlanUseCase.execute({
        planId: plan_id,
        userId: context.userId,
        title,
        goal,
        tasks,
      });

      if (!plan) {
        return {
          success: false,
          error: '计划不存在或无权限访问',
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
        message: `✅ 计划 "${plan.title}" 更新成功`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
};

// ============ 获取计划详情工具 ============
export const getPlanPlugin: ToolPlugin = {
  metadata: {
    name: 'get_plan',
    description: '获取计划详情',
    version: '1.0.0',
    author: 'AI Agent Team',
    tags: ['plan', 'database', 'read'],
    enabled: true,
  },

  schema: {
    name: 'get_plan',
    description: '获取指定计划的详细信息',
    parameters: {
      type: 'object',
      properties: {
        plan_id: {
          type: 'string',
          description: '计划 ID',
        },
      },
      required: ['plan_id'],
    },
  },

  rateLimit: {
    maxConcurrent: 150,
    maxPerMinute: 1000,
    timeout: 3000,
  },

  cache: {
    enabled: true,
    ttl: 60, // 缓存1分钟
    keyStrategy: 'user', // 按用户缓存
  },

  circuitBreaker: {
    enabled: true,
    failureThreshold: 10,
    resetTimeout: 30000,
  },

  execute: async (params, context) => {
    const { plan_id } = params;

    try {
      const container = getContainer();
      const getPlanUseCase = container.getGetPlanUseCase();

      const plan = await getPlanUseCase.execute({
        planId: plan_id,
        userId: context.userId,
      });

      if (!plan) {
        return {
          success: false,
          error: '计划不存在或无权限访问',
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
      return {
        success: false,
        error: error.message,
      };
    }
  },
};

// ============ 列出计划工具 ============
export const listPlansPlugin: ToolPlugin = {
  metadata: {
    name: 'list_plans',
    description: '列出所有计划',
    version: '1.0.0',
    author: 'AI Agent Team',
    tags: ['plan', 'database', 'read'],
    enabled: true,
  },

  schema: {
    name: 'list_plans',
    description: '列出用户的所有计划',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: '返回的最大计划数（默认10，最大50）',
          default: 10,
        },
      },
    },
  },

  rateLimit: {
    maxConcurrent: 150,
    maxPerMinute: 1000,
    timeout: 3000,
  },

  cache: {
    enabled: true,
    ttl: 60, // 缓存1分钟
    keyStrategy: 'user',
  },

  circuitBreaker: {
    enabled: true,
    failureThreshold: 10,
    resetTimeout: 30000,
  },

  execute: async (params, context) => {
    const limit = Math.min(params.limit || 10, 50);

    try {
      const container = getContainer();
      const listPlansUseCase = container.getListPlansUseCase();

      const result = await listPlansUseCase.execute({
        userId: context.userId,
        limit,
      });

      if (result.plans.length === 0) {
        return {
          success: true,
          data: {
            plans: [],
            total: 0,
          },
          message: '📋 你还没有创建任何计划',
        };
      }

      // 简化计划信息
      const simplifiedPlans = result.plans.map(plan => ({
        plan_id: plan.planId,
        title: plan.title,
        goal: plan.goal,
        tasks: plan.tasks,
        tasks_count: plan.tasks.length,
        created_at: plan.createdAt,
        updated_at: plan.updatedAt,
      }));

      return {
        success: true,
        data: {
          plans: simplifiedPlans,
          total: result.total,
          limit,
        },
        message: `📋 找到 ${result.plans.length} 个计划（共 ${result.total} 个）`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  },
};

