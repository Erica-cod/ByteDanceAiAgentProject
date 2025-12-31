/**
 * 计划实体
 * 
 * 封装计划的业务规则和数据
 */

import { z } from 'zod';

/**
 * 任务状态枚举
 */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

/**
 * 任务 Schema
 * 兼容旧的 Task 接口（保留 estimated_hours, deadline, tags）
 */
const TaskSchema = z.object({
  title: z.string().min(1, '任务标题不能为空'),
  description: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).default('pending'),
  estimated_hours: z.number().optional(), // 预估工时（兼容旧接口）
  deadline: z.string().optional(), // 截止日期（兼容旧接口）
  tags: z.array(z.string()).optional(), // 标签数组（兼容旧接口）
  dueDate: z.string().optional(), // 新字段：到期日期
  priority: z.enum(['low', 'medium', 'high']).optional(), // 新字段：优先级
});

export type Task = z.infer<typeof TaskSchema>;

/**
 * 计划属性 Schema
 */
const PlanPropsSchema = z.object({
  planId: z.string().uuid(),
  userId: z.string().min(1),
  title: z.string().min(1, '计划标题不能为空').max(200, '计划标题不能超过200字符'),
  goal: z.string().min(1, '计划目标不能为空'),
  tasks: z.array(TaskSchema).min(1, '至少需要一个任务'),
  createdAt: z.date(),
  updatedAt: z.date(),
  isActive: z.boolean().default(true),
});

export type PlanProps = z.infer<typeof PlanPropsSchema>;

/**
 * 计划实体
 */
export class PlanEntity {
  private constructor(private props: PlanProps) {}

  /**
   * 创建新计划
   */
  static create(data: {
    userId: string;
    title: string;
    goal: string;
    tasks: Task[];
    planId?: string;
  }): PlanEntity {
    // 使用 crypto.randomUUID() 代替 uuid
    const planId = data.planId || crypto.randomUUID();
    const now = new Date();

    const validatedProps = PlanPropsSchema.parse({
      planId,
      userId: data.userId,
      title: data.title,
      goal: data.goal,
      tasks: data.tasks,
      createdAt: now,
      updatedAt: now,
      isActive: true,
    });

    return new PlanEntity(validatedProps);
  }

  /**
   * 从已有数据重建实体
   */
  static fromData(data: PlanProps): PlanEntity {
    const validatedProps = PlanPropsSchema.parse(data);
    return new PlanEntity(validatedProps);
  }

  /**
   * 更新计划
   */
  update(data: {
    title?: string;
    goal?: string;
    tasks?: Task[];
  }): PlanEntity {
    const updatedProps: PlanProps = {
      ...this.props,
      updatedAt: new Date(),
    };

    if (data.title !== undefined) {
      updatedProps.title = data.title;
    }

    if (data.goal !== undefined) {
      updatedProps.goal = data.goal;
    }

    if (data.tasks !== undefined) {
      updatedProps.tasks = data.tasks;
    }

    return PlanEntity.fromData(updatedProps);
  }

  /**
   * 更新任务状态
   */
  updateTaskStatus(taskIndex: number, status: TaskStatus): PlanEntity {
    if (taskIndex < 0 || taskIndex >= this.props.tasks.length) {
      throw new Error(`Invalid task index: ${taskIndex}`);
    }

    const updatedTasks = [...this.props.tasks];
    updatedTasks[taskIndex] = {
      ...updatedTasks[taskIndex],
      status,
    };

    return this.update({ tasks: updatedTasks });
  }

  /**
   * 添加任务
   */
  addTask(task: Task): PlanEntity {
    const updatedTasks = [...this.props.tasks, task];
    return this.update({ tasks: updatedTasks });
  }

  /**
   * 删除任务
   */
  removeTask(taskIndex: number): PlanEntity {
    if (taskIndex < 0 || taskIndex >= this.props.tasks.length) {
      throw new Error(`Invalid task index: ${taskIndex}`);
    }

    const updatedTasks = this.props.tasks.filter((_, index) => index !== taskIndex);
    
    if (updatedTasks.length === 0) {
      throw new Error('Cannot remove last task. Plan must have at least one task.');
    }

    return this.update({ tasks: updatedTasks });
  }

  /**
   * 软删除计划
   */
  softDelete(): PlanEntity {
    return PlanEntity.fromData({
      ...this.props,
      isActive: false,
      updatedAt: new Date(),
    });
  }

  /**
   * 获取计划进度
   */
  getProgress(): {
    total: number;
    completed: number;
    percentage: number;
  } {
    const total = this.props.tasks.length;
    const completed = this.props.tasks.filter(t => t.status === 'completed').length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, percentage };
  }

  /**
   * 检查计划是否完成
   */
  isCompleted(): boolean {
    return this.props.tasks.every(t => t.status === 'completed');
  }

  /**
   * 检查计划是否有进行中的任务
   */
  hasInProgressTasks(): boolean {
    return this.props.tasks.some(t => t.status === 'in_progress');
  }

  // Getters
  get planId(): string {
    return this.props.planId;
  }

  get userId(): string {
    return this.props.userId;
  }

  get title(): string {
    return this.props.title;
  }

  get goal(): string {
    return this.props.goal;
  }

  get tasks(): Task[] {
    return [...this.props.tasks]; // 返回副本，防止外部修改
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get isActive(): boolean {
    return this.props.isActive;
  }

  /**
   * 转换为普通对象
   */
  toObject(): PlanProps {
    return { ...this.props };
  }
}

