/**
 * 流式 JSON 增量解析工具
 *
 * 用于多 Agent 场景：LLM 流式输出 JSON 时，前端实时解析已到达的部分，
 * 渐进渲染结构化卡片，而非展示原始 JSON 文本。
 *
 * 依赖项目已有的 jsonrepair 包修复截断的 JSON。
 */

import { jsonrepair } from 'jsonrepair';

/**
 * 从流式累积内容中提取 JSON 字符串
 *
 * 处理三种常见格式：
 * 1. ```json 代码块（完整或未闭合）
 * 2. 纯 JSON（以 { 开头）
 * 3. 文本前缀 + JSON（如 "好的\n{..."）
 */
function extractJSONFromStream(content: string): string | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  // 优先匹配 ```json 代码块
  const markerIdx = trimmed.indexOf('```json');
  if (markerIdx !== -1) {
    let jsonPart = trimmed.substring(markerIdx + 7).trim();
    const closingIdx = jsonPart.indexOf('```');
    if (closingIdx !== -1) {
      jsonPart = jsonPart.substring(0, closingIdx).trim();
    }
    if (jsonPart.startsWith('{')) return jsonPart;
  }

  // 纯 JSON
  if (trimmed.startsWith('{')) return trimmed;

  // 文本 + JSON
  const braceIdx = trimmed.indexOf('{');
  if (braceIdx !== -1) return trimmed.substring(braceIdx);

  return null;
}

/**
 * 尝试解析流式中的不完整 JSON
 *
 * @returns 解析出的部分对象，或 null（内容不含可解析 JSON）
 */
export function tryParseStreamingJSON<T = any>(raw: string | undefined): T | null {
  if (!raw) return null;

  const jsonStr = extractJSONFromStream(raw);
  if (!jsonStr || jsonStr.length < 10) return null;

  try {
    return JSON.parse(jsonStr);
  } catch {
    try {
      return JSON.parse(jsonrepair(jsonStr));
    } catch {
      return null;
    }
  }
}

/**
 * 将部分解析的 Agent JSON 数据格式化为可读 Markdown
 *
 * 输出格式尽量与后端 formatPlanContent / formatCritiqueContent 一致，
 * 使得流式阶段 → agent_complete 的视觉过渡平滑。
 */
export function formatPartialAgentData(data: any): string | null {
  if (!data || typeof data !== 'object') return null;

  const parts: string[] = [];

  // ── position（planner / critic 共有）──
  const pos = data.position;
  if (pos) {
    if (pos.conclusion) {
      parts.push(`## 我的方案\n\n${pos.conclusion}`);
    }
    if (pos.key_reasons?.length) {
      parts.push(`\n**关键理由**:`);
      pos.key_reasons.forEach((r: string, i: number) => {
        parts.push(`${i + 1}. ${r}`);
      });
    }
    if (pos.assumptions?.length) {
      parts.push(`\n**基于假设**:`);
      pos.assumptions.forEach((a: string) => parts.push(`- ${a}`));
    }
    if (pos.confidence !== undefined) {
      parts.push(`\n**置信度**: ${(pos.confidence * 100).toFixed(0)}%`);
    }
  }

  // ── plan（planner 特有）──
  const plan = data.plan;
  if (plan) {
    if (plan.title) {
      parts.unshift(`# ${plan.title}\n`);
      if (plan.goal) parts.splice(1, 0, `**目标**: ${plan.goal}\n`);
      if (plan.total_estimated_hours !== undefined) {
        parts.splice(2, 0, `**总预计工时**: ${plan.total_estimated_hours} 小时\n`);
      }
    }

    if (plan.phases?.length) {
      parts.push(`\n## 详细计划\n`);
      plan.phases.forEach((phase: any, pi: number) => {
        if (!phase?.phase_name) return;
        parts.push(`### 阶段 ${pi + 1}: ${phase.phase_name}`);
        if (phase.duration) parts.push(`**持续时间**: ${phase.duration}\n`);
        phase.tasks?.forEach((task: any, ti: number) => {
          if (!task?.title) return;
          parts.push(`${ti + 1}. **${task.title}**`);
          if (task.estimated_hours) parts.push(`   - 预计工时: ${task.estimated_hours}小时`);
          if (task.deadline) parts.push(`   - 截止日期: ${task.deadline}`);
          if (task.tags?.length) parts.push(`   - 标签: ${task.tags.join(', ')}`);
        });
      });
    }
  }

  // ── critique（critic 特有）──
  const crit = data.critique;
  if (crit) {
    if (crit.target_agent) {
      parts.push(`\n**针对**: ${crit.target_agent}${crit.target_round ? ` (第${crit.target_round}轮)` : ''}`);
    }

    const vc = crit.validity_check;
    if (vc) {
      const checks: string[] = [];
      if (vc.feasible !== undefined) checks.push(`可行性: ${vc.feasible ? '✅ 可行' : '❌ 不可行'}`);
      if (vc.realistic !== undefined) checks.push(`现实性: ${vc.realistic ? '✅ 现实' : '❌ 不现实'}`);
      if (vc.complete !== undefined) checks.push(`完整性: ${vc.complete ? '✅ 完整' : '⚠️ 不完整'}`);
      if (checks.length) {
        parts.push(`\n## 可行性检查\n`);
        checks.forEach(c => parts.push(`- ${c}`));
      }
    }

    if (crit.risks?.length) {
      parts.push(`\n## 风险评估\n`);
      crit.risks.forEach((r: any, i: number) => {
        if (!r?.risk) return;
        const icon = r.severity === 'high' ? '🔴' : r.severity === 'medium' ? '🟡' : '🟢';
        parts.push(`${i + 1}. ${icon} **${r.risk}** (${r.severity || '未知'})`);
        if (r.impact) parts.push(`   - 影响: ${r.impact}`);
      });
    }

    if (crit.suggestions?.length) {
      parts.push(`\n## 改进建议\n`);
      crit.suggestions.forEach((s: any, i: number) => {
        if (!s?.issue) return;
        const icon = s.priority === 'high' ? '🔥' : s.priority === 'medium' ? '⚡' : '💡';
        parts.push(`${i + 1}. ${icon} **${s.issue}** (${s.priority || '未知'})`);
        if (s.solution) parts.push(`   - 解决方案: ${s.solution}`);
      });
    }
  }

  return parts.length > 0 ? parts.join('\n') : null;
}
