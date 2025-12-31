/**
 * MongoDB 计划仓储实现
 */

import { IPlanRepository, PlanListResult } from '../../application/interfaces/repositories/plan.repository.interface.js';
import { PlanEntity } from '../../domain/entities/plan.entity.js';
import { getDatabase } from '../../../db/connection.js';

const COLLECTION_NAME = 'plans';

export class MongoPlanRepository implements IPlanRepository {
  /**
   * 保存计划（创建或更新）
   */
  async save(plan: PlanEntity): Promise<PlanEntity> {
    const db = await getDatabase();
    const planData = plan.toObject();

    // 尝试更新现有计划，如果不存在则插入
    const result = await db.collection(COLLECTION_NAME).findOneAndUpdate(
      { planId: planData.planId },
      {
        $set: {
          userId: planData.userId,
          title: planData.title,
          goal: planData.goal,
          tasks: planData.tasks,
          updatedAt: planData.updatedAt,
          isActive: planData.isActive,
        },
        $setOnInsert: {
          createdAt: planData.createdAt,
        },
      },
      {
        upsert: true,
        returnDocument: 'after',
      }
    );

    if (!result) {
      throw new Error(`Failed to save plan: ${planData.planId}`);
    }

    // 将 MongoDB 文档转换回 PlanEntity
    return PlanEntity.fromData({
      planId: result.planId as string,
      userId: result.userId as string,
      title: result.title as string,
      goal: result.goal as string,
      tasks: result.tasks as any,
      createdAt: new Date(result.createdAt as Date),
      updatedAt: new Date(result.updatedAt as Date),
      isActive: result.isActive as boolean,
    });
  }

  /**
   * 根据 ID 查找计划
   */
  async findById(planId: string, userId: string): Promise<PlanEntity | null> {
    const db = await getDatabase();

    const doc = await db.collection(COLLECTION_NAME).findOne({
      planId,
      userId,
      isActive: true,
    });

    if (!doc) {
      return null;
    }

    return PlanEntity.fromData({
      planId: doc.planId as string,
      userId: doc.userId as string,
      title: doc.title as string,
      goal: doc.goal as string,
      tasks: doc.tasks as any,
      createdAt: new Date(doc.createdAt as Date),
      updatedAt: new Date(doc.updatedAt as Date),
      isActive: doc.isActive as boolean,
    });
  }

  /**
   * 列出用户的所有活跃计划
   */
  async findByUserId(userId: string, limit: number = 10): Promise<PlanListResult> {
    const db = await getDatabase();

    const docs = await db
      .collection(COLLECTION_NAME)
      .find({
        userId,
        isActive: true,
      })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .toArray();

    const plans = docs.map(doc =>
      PlanEntity.fromData({
        planId: doc.planId as string,
        userId: doc.userId as string,
        title: doc.title as string,
        goal: doc.goal as string,
        tasks: doc.tasks as any,
        createdAt: new Date(doc.createdAt as Date),
        updatedAt: new Date(doc.updatedAt as Date),
        isActive: doc.isActive as boolean,
      })
    );

    const total = await db.collection(COLLECTION_NAME).countDocuments({
      userId,
      isActive: true,
    });

    return { plans, total };
  }

  /**
   * 删除计划（软删除）
   */
  async delete(planId: string, userId: string): Promise<boolean> {
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

    return result.matchedCount > 0;
  }
}

