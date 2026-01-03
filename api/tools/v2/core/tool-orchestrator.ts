/**
 * 工具编排器
 * 
 * 解决问题：用户要求"列计划→查方案→更新计划"，模型只做第一步
 * 
 * 功能：
 * - 解析多步执行计划
 * - 管理工具依赖关系
 * - 失败重试和降级
 * - 并行执行优化
 */

import { toolExecutor } from './tool-executor.js';
import type {
  ToolContext,
  ToolOrchestrationPlan,
  ToolStep,
  OrchestrationResult,
  ToolResult,
} from './types.js';

export class ToolOrchestrator {
  /**
   * 执行编排计划
   */
  async executePlan(
    plan: ToolOrchestrationPlan,
    context: ToolContext
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const stepResults: Record<string, ToolResult> = {};
    const { steps, planId } = plan;

    console.log(`🎬 开始执行编排计划: ${planId}`);
    console.log(`📋 总步骤数: ${steps.length}`);

    try {
      // 按依赖关系排序步骤
      const sortedSteps = this.topologicalSort(steps);

      for (const step of sortedSteps) {
        console.log(`\n▶️  执行步骤 ${step.stepId}: ${step.toolName}`);
        console.log(`   描述: ${step.description || '无'}`);

        // 检查依赖是否都已完成且成功
        if (step.dependsOn && step.dependsOn.length > 0) {
          const unmetDeps = step.dependsOn.filter(depId => {
            const depResult = stepResults[depId];
            return !depResult || !depResult.success;
          });

          if (unmetDeps.length > 0) {
            const error = `依赖未满足: ${unmetDeps.join(', ')}`;
            console.error(`   ❌ ${error}`);

            stepResults[step.stepId] = {
              success: false,
              error,
            };

            // 根据失败策略决定是否继续
            if (step.onFailure === 'abort') {
              console.error(`   🚫 步骤失败，中止计划`);
              break;
            } else {
              continue;
            }
          }
        }

        // 执行步骤
        const result = await this.executeStep(step, stepResults, context);
        stepResults[step.stepId] = result;

        if (result.success) {
          console.log(`   ✅ 步骤成功 (${result.duration}ms)`);
        } else {
          console.error(`   ❌ 步骤失败: ${result.error}`);

          // 根据失败策略处理
          if (step.onFailure === 'abort') {
            console.error(`   🚫 步骤失败，中止计划`);
            break;
          } else if (step.onFailure === 'retry') {
            console.log(`   🔄 尝试重试...`);
            const retryResult = await this.executeStep(step, stepResults, context);
            stepResults[step.stepId] = retryResult;

            if (!retryResult.success) {
              console.error(`   🚫 重试失败，中止计划`);
              break;
            }
          }
          // 'continue': 继续执行下一步
        }
      }

      // 检查是否所有步骤都成功
      const allSuccess = Object.values(stepResults).every(r => r.success);
      const totalDuration = Date.now() - startTime;

      console.log(`\n🏁 计划执行完成`);
      console.log(`   总耗时: ${totalDuration}ms`);
      console.log(`   状态: ${allSuccess ? '✅ 全部成功' : '⚠️  部分失败'}`);

      return {
        success: allSuccess,
        planId,
        stepResults,
        totalDuration,
      };
    } catch (error: any) {
      console.error(`❌ 计划执行失败:`, error);

      return {
        success: false,
        planId,
        stepResults,
        totalDuration: Date.now() - startTime,
        error: error.message,
      };
    }
  }

  /**
   * 执行单个步骤
   */
  private async executeStep(
    step: ToolStep,
    previousResults: Record<string, ToolResult>,
    context: ToolContext
  ): Promise<ToolResult> {
    // 解析参数中的变量引用（如 ${step1.data.planId}）
    const resolvedParams = this.resolveParams(step.params, previousResults);

    // 执行工具
    return toolExecutor.execute(step.toolName, resolvedParams, context);
  }

  /**
   * 解析参数中的变量引用
   * 
   * 例如：
   * params: { plan_id: "${step1.data.planId}" }
   * 解析为: { plan_id: "actual-plan-id-value" }
   */
  private resolveParams(
    params: any,
    previousResults: Record<string, ToolResult>
  ): any {
    if (typeof params === 'string') {
      // 匹配 ${stepId.path} 格式
      return params.replace(/\$\{([^}]+)\}/g, (match, path) => {
        const [stepId, ...keys] = path.split('.');
        const result = previousResults[stepId];

        if (!result || !result.success) {
          console.warn(`   ⚠️  变量引用失败: ${path}`);
          return match; // 保持原样
        }

        // 遍历路径获取值
        let value: any = result;
        for (const key of keys) {
          value = value?.[key];
        }

        return value !== undefined ? String(value) : match;
      });
    } else if (Array.isArray(params)) {
      return params.map(item => this.resolveParams(item, previousResults));
    } else if (typeof params === 'object' && params !== null) {
      const resolved: any = {};
      for (const [key, value] of Object.entries(params)) {
        resolved[key] = this.resolveParams(value, previousResults);
      }
      return resolved;
    }

    return params;
  }

  /**
   * 拓扑排序（处理依赖关系）
   */
  private topologicalSort(steps: ToolStep[]): ToolStep[] {
    const sorted: ToolStep[] = [];
    const visited = new Set<string>();
    const stepMap = new Map(steps.map(s => [s.stepId, s]));

    const visit = (stepId: string) => {
      if (visited.has(stepId)) return;

      const step = stepMap.get(stepId);
      if (!step) {
        console.warn(`   ⚠️  步骤 ${stepId} 不存在`);
        return;
      }

      // 先访问依赖
      if (step.dependsOn) {
        for (const depId of step.dependsOn) {
          visit(depId);
        }
      }

      visited.add(stepId);
      sorted.push(step);
    };

    // 访问所有步骤
    for (const step of steps) {
      visit(step.stepId);
    }

    return sorted;
  }

  /**
   * 从 LLM 的多步计划中构建编排计划
   * 
   * 例如：
   * "1. 列出所有计划 (list_plans)
   *  2. 查看第一个计划的详情 (get_plan)
   *  3. 更新计划标题 (update_plan)"
   */
  static parseFromText(text: string, userId: string): ToolOrchestrationPlan {
    const lines = text.split('\n').filter(line => line.trim());
    const steps: ToolStep[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // 匹配格式：1. 描述 (tool_name)
      const match = line.match(/^\d+\.\s*(.+?)\s*\(([^)]+)\)/);
      
      if (match) {
        const [_, description, toolName] = match;
        
        steps.push({
          stepId: `step${i + 1}`,
          toolName: toolName.trim(),
          params: {}, // 需要 LLM 提供具体参数
          description: description.trim(),
          onFailure: 'abort',
        });
      }
    }

    return {
      steps,
      planId: `plan_${Date.now()}`,
      createdAt: Date.now(),
    };
  }

  /**
   * 从结构化的 Function Calling 数组构建编排计划
   */
  static fromToolCalls(
    toolCalls: Array<{ function: { name: string; arguments: string } }>,
    userId: string
  ): ToolOrchestrationPlan {
    const steps: ToolStep[] = toolCalls.map((call, index) => {
      const args = JSON.parse(call.function.arguments);
      
      return {
        stepId: `step${index + 1}`,
        toolName: call.function.name,
        params: args,
        onFailure: 'abort',
      };
    });

    return {
      steps,
      planId: `plan_${Date.now()}`,
      createdAt: Date.now(),
    };
  }
}

// 单例实例
export const toolOrchestrator = new ToolOrchestrator();

