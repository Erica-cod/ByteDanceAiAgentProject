/**
 * 计划服务 - 处理计划的 CRUD 操作
 */

import { getDatabase } from '../db/connection.js';
import { Plan, Task, CreatePlanRequest, UpdatePlanRequest, PlanListResponse } from '../db/models.js';
import { v4 as uuidv4 } from 'uuid';

const COLLECTION_NAME = 'plans';

/**
 * 创建新计划
 */
export async function createPlan(request: CreatePlanRequest): Promise<Plan> {
  const db = await getDatabase();
  
  const plan: Plan = {
    planId: uuidv4(),
    userId: request.userId,
    title: request.title,
    goal: request.goal,
    tasks: request.tasks.map(task => ({
      ...task,
      status: task.status || 'pending', // 默认状态为 pending
    })),
    createdAt: new Date(),
    updatedAt: new Date(),
    isActive: true,
  };

  await db.collection(COLLECTION_NAME).insertOne(plan as any);
  
  console.log(`✅ 计划已创建: ${plan.planId} - "${plan.title}"`);
  
  return plan;
}

/**
 * 更新计划
 */
export async function updatePlan(request: UpdatePlanRequest): Promise<Plan | null> {
  const db = await getDatabase();
  
  // 构建更新字段
  const updateFields: any = {
    updatedAt: new Date(),
  };
  
  if (request.title !== undefined) {
    updateFields.title = request.title;
  }
  
  if (request.goal !== undefined) {
    updateFields.goal = request.goal;
  }
  
  if (request.tasks !== undefined) {
    updateFields.tasks = request.tasks.map(task => ({
      ...task,
      status: task.status || 'pending',
    }));
  }

  const result = await db.collection(COLLECTION_NAME).findOneAndUpdate(
    { planId: request.planId, userId: request.userId },
    { $set: updateFields },
    { returnDocument: 'after' }
  );

  if (!result) {
    console.warn(`⚠️  计划不存在或无权限: ${request.planId}`);
    return null;
  }

  console.log(`✅ 计划已更新: ${request.planId}`);
  
  return result as unknown as Plan;
}

/**
 * 获取单个计划
 */
export async function getPlan(planId: string, userId: string): Promise<Plan | null> {
  const db = await getDatabase();
  
  const plan = await db.collection(COLLECTION_NAME).findOne({
    planId,
    userId,
    isActive: true,
  });

  if (!plan) {
    console.warn(`⚠️  计划不存在: ${planId}`);
    return null;
  }

  return plan as unknown as Plan;
}

/**
 * 列出用户的所有计划
 */
export async function listPlans(
  userId: string,
  limit: number = 10
): Promise<PlanListResponse> {
  const db = await getDatabase();
  
  const plans = await db
    .collection(COLLECTION_NAME)
    .find({
      userId,
      isActive: true,
    })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .toArray();

  const total = await db.collection(COLLECTION_NAME).countDocuments({
    userId,
    isActive: true,
  });

  return {
    plans: plans as unknown as Plan[],
    total,
  };
}

/**
 * 删除计划（软删除）
 */
export async function deletePlan(planId: string, userId: string): Promise<boolean> {
  const db = await getDatabase();
  
  const result = await db.collection(COLLECTION_NAME).updateOne(
    { planId, userId },
    {
      $set: {
        isActive: false,
        updatedAt: new Date(),
      },
    }
  );

  if (result.matchedCount === 0) {
    console.warn(`⚠️  计划不存在: ${planId}`);
    return false;
  }

  console.log(`✅ 计划已删除: ${planId}`);
  return true;
}

