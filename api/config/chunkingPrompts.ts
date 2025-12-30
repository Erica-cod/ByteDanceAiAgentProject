/**
 * Chunking 模式的 Prompt 模板
 */

/**
 * Map 阶段：提取每个 chunk 的结构化信息
 */
export function buildMapPrompt(chunkContent: string, chunkIndex: number, totalChunks: number): string {
  return `你是一个专业的计划分析助手。现在需要你分析一份超长计划文本的第 ${chunkIndex + 1}/${totalChunks} 段内容。

**你的任务**：
1. 仔细阅读这段内容
2. 提取其中的关键信息（目标、任务、里程碑、指标、风险等）
3. 生成一个 5-10 条要点的摘要

**请严格按照以下 JSON 格式输出**（不要输出任何其他内容）：

\`\`\`json
{
  "chunk_summary": "这段内容的 5-10 条要点摘要（数组形式）",
  "extracted": {
    "goals": ["目标1", "目标2"],
    "milestones": ["里程碑1", "里程碑2"],
    "tasks": [
      {"title": "任务名称", "owner": "负责人", "deadline": "截止时间", "dependsOn": "依赖任务"}
    ],
    "metrics": ["指标1", "指标2"],
    "risks": [
      {"risk": "风险描述", "mitigation": "缓解措施"}
    ],
    "unknowns": ["需要澄清的问题1", "需要澄清的问题2"]
  }
}
\`\`\`

**注意**：
- 如果某个字段没有相关内容，请设置为空数组 []
- tasks 中的 owner、deadline、dependsOn 可以为空字符串
- 只输出 JSON，不要有任何额外的解释文字

---

**待分析的文本片段**：

${chunkContent}`;
}

/**
 * Reduce 阶段：基于合并后的结构化内容生成最终评审
 */
export function buildReducePrompt(
  mergedData: any,
  originalUserMessage: string,
  totalChunks: number
): string {
  return `你是一个资深的项目管理顾问。你刚刚分析完一份超长计划文本（共 ${totalChunks} 段），现在需要生成最终的评审报告。

**用户的原始请求**：
"${originalUserMessage}"

**已提取的结构化信息**：

\`\`\`json
${JSON.stringify(mergedData, null, 2)}
\`\`\`

---

**你的任务**：
基于上述信息，生成一份专业的计划评审报告，包含以下部分：

## 📋 计划概览
- 总体目标（${mergedData.goals?.length || 0} 个）
- 主要里程碑（${mergedData.milestones?.length || 0} 个）
- 任务数量（${mergedData.tasks?.length || 0} 个）
- 关键指标（${mergedData.metrics?.length || 0} 个）

## ⚠️ 主要问题与风险
分析计划中存在的问题：
- 可执行性问题（任务是否明确、资源是否充足）
- 时间安排问题（里程碑是否合理、依赖关系是否清晰）
- 指标问题（是否可衡量、是否覆盖关键目标）
- 风险管理问题（已识别的风险：${mergedData.risks?.length || 0} 个）

## 💡 改进建议
按优先级给出具体的改进建议（至少 5 条）：
1. **高优先级**：...
2. **中优先级**：...
3. **低优先级**：...

## ✅ 优化后的计划骨架
提供一个改进后的计划结构（表格或分点形式），包括：
- 调整后的里程碑时间线
- 明确的任务分配
- 可衡量的成功指标

## ❓ 需要澄清的问题
列出需要与团队确认的关键问题（基于 unknowns）：
${mergedData.unknowns?.map((q: string, i: number) => `${i + 1}. ${q}`).join('\n') || '（无）'}

---

**请用清晰、专业、可操作的语言撰写报告。**`;
}

/**
 * 仅摘要模式的 Prompt
 */
export function buildSummarizePrompt(fullText: string): string {
  return `请为以下超长文本生成一个结构化的摘要（约 300-500 字）：

**要求**：
1. 提取核心要点（5-10 条）
2. 识别关键信息（目标、任务、时间节点等）
3. 保持逻辑清晰、层次分明

---

**原文**：

${fullText}`;
}

