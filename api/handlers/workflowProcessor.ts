/**
 * 多工具调用工作流处理器
 * 处理复杂的多步骤工具调用逻辑
 */

import { MultiToolCallManager } from '../workflows/chatWorkflowIntegration.js';
import { callVolcengineModel } from '../_clean/infrastructure/llm/model-service.js';
import { volcengineService } from '../_clean/infrastructure/llm/volcengine-service.js';
import { extractThinkingAndContent } from '../_clean/shared/utils/content-extractor.js';
import type { ChatMessage } from '../types/chat.js';

/**
 * 工作流处理结果
 */
export interface WorkflowProcessResult {
  searchSources?: Array<{ title: string; url: string }>;
  finalContent: string;
  finalThinking?: string;
}

/**
 * 处理多工具调用工作流
 * 
 * @param accumulatedText 累积的 AI 响应文本
 * @param messages 消息历史
 * @param userId 用户 ID
 * @param safeWrite SSE 写入函数
 * @returns 工作流处理结果
 */
export async function processMultiToolWorkflow(
  accumulatedText: string,
  messages: ChatMessage[],
  userId: string,
  safeWrite: (data: string) => Promise<boolean>
): Promise<WorkflowProcessResult> {
  const workflowManager = new MultiToolCallManager(5); // 最多5轮
  let currentResponse = accumulatedText;
  let continueLoop = true;
  let loopIteration = 0;
  const MAX_LOOP_ITERATIONS = 10; // 额外的安全保护

  let searchSources: Array<{ title: string; url: string }> | undefined;
  let buffer = '';
  let workingText = accumulatedText;
  let lastSentContent = '';
  let lastSentThinking = '';

  // 获取用户的原始问题
  const originalUserMessage = messages.filter((m) => m.role === 'user').pop()?.content || '';

  console.log(`🔄 [Workflow] 开始多工具调用循环，最多 ${MAX_LOOP_ITERATIONS} 次迭代`);

  while (continueLoop && loopIteration < MAX_LOOP_ITERATIONS) {
    loopIteration++;
    console.log(`\n🔁 [Workflow] === 循环迭代 ${loopIteration}/${MAX_LOOP_ITERATIONS} ===`);
    console.log(
      `📝 [Workflow] 当前AI回复内容（前500字符）:\n${currentResponse.substring(0, 500)}...`
    );

    // 处理当前 AI 回复，检测并执行工具
    const workflowResult = await workflowManager.processAIResponse(currentResponse, userId);

    if (!workflowResult.hasToolCall) {
      console.log('⚠️  [Workflow] 本轮没有检测到工具调用');
      console.log(`📝 [Workflow] AI完整回复:\n${currentResponse}`);
      console.log('✅ [Workflow] 结束工具调用循环');
      break;
    }

    console.log(
      `🔧 [Workflow] 第 ${workflowManager.getHistory().length} 轮工具调用: ${workflowResult.toolCall?.tool}`
    );

    // 发送工具调用通知到前端
    const toolCallNotice = JSON.stringify({
      content: `正在执行工具: ${workflowResult.toolCall?.tool}...`,
      toolCall: workflowResult.toolCall,
    });
    if (!(await safeWrite(`data: ${toolCallNotice}\n\n`))) {
      break; // 客户端断开，退出循环
    }

    // 保存搜索来源
    if (workflowResult.toolResult?.sources) {
      searchSources = workflowResult.toolResult.sources;
    }

    // 构建工具结果反馈消息
    const feedbackMessage = buildFeedbackMessage(
      workflowResult,
      originalUserMessage,
      workflowManager
    );

    // 将工具结果反馈给 AI
    messages.push(
      { role: 'assistant', content: currentResponse },
      { role: 'user', content: feedbackMessage }
    );

    console.log(`📨 [Workflow] 消息历史长度: ${messages.length}, 准备重新调用 AI`);

    // 检查是否应该继续
    console.log(`🔍 [Workflow] 检查是否继续: shouldContinue=${workflowResult.shouldContinue}`);
    if (!workflowResult.shouldContinue) {
      console.log('⚠️  [Workflow] 工作流指示不继续，退出循环');
      console.log(`⚠️  [Workflow] 退出原因: ${workflowResult.error || '未知'}`);
      continueLoop = false;
      break;
    }

    console.log('✅ [Workflow] 工具执行成功，准备继续下一轮...');

    // 重新调用 AI 模型
    console.log('🔄 [Workflow] 重新调用 AI 模型...');
    const newStream = await callVolcengineModel(messages);

    // 重置累积文本
    currentResponse = '';
    workingText = '';
    lastSentContent = '';
    lastSentThinking = '';
    buffer = '';

    // 继续处理新的流
    let newStreamDone = false;

    for await (const chunk of newStream) {
      const chunkStr = chunk.toString();
      buffer += chunkStr;

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          const content = volcengineService.parseStreamLine(line);

          if (content) {
            workingText += content;
            currentResponse += content; // 累积用于下一轮工具检测
            const { thinking, content: mainContent } = extractThinkingAndContent(workingText);

            // 立即发送每次更新，确保流式效果
            const sseData = JSON.stringify({
              content: mainContent,
              thinking: thinking || undefined,
            });

            if (!(await safeWrite(`data: ${sseData}\n\n`))) {
              return {
                searchSources,
                finalContent: mainContent,
                finalThinking: thinking,
              };
            }
            lastSentContent = mainContent;
            lastSentThinking = thinking;
          }

          if (line.includes('[DONE]')) {
            newStreamDone = true;
            console.log('✅ [Workflow] 新流完成');
            break;
          }
        }
      }

      if (newStreamDone) break;
    }

    // 检查新回复中是否还有工具调用
    if (newStreamDone) {
      if (currentResponse && currentResponse.trim()) {
        console.log('🔍 [Workflow] 新流完成，检查是否有更多工具调用...');
        console.log(`📝 [Workflow] 当前回复长度: ${currentResponse.length} 字符`);
        // 循环会在下一次迭代时自动检测 tool_call
      } else {
        console.log('✅ [Workflow] 新流完成，但没有新内容，结束循环');
        continueLoop = false;
      }
    } else {
      console.warn('⚠️  [Workflow] 新流未正常完成，但保持循环继续');
    }
  }

  // 打印工具调用历史和退出原因
  console.log(`\n📊 [Workflow] ============ 工作流结束 ============`);
  console.log(`📊 [Workflow] 工具调用历史: ${workflowManager.getHistorySummary()}`);
  console.log(`📊 [Workflow] 总迭代次数: ${loopIteration}`);
  console.log(`📊 [Workflow] 退出原因: ${!continueLoop ? '不需要继续' : '达到最大迭代次数'}`);

  const { thinking, content } = extractThinkingAndContent(workingText);

  return {
    searchSources,
    finalContent: content || workingText,
    finalThinking: thinking,
  };
}

/**
 * 构建工具结果反馈消息
 */
function buildFeedbackMessage(
  workflowResult: any,
  originalUserMessage: string,
  workflowManager: MultiToolCallManager
): string {
  let feedbackMessage = '';

  // 区分错误和成功的反馈
  if (workflowResult.error) {
    console.warn(`⚠️  [Workflow] 工具执行出错: ${workflowResult.error}`);

    // 错误反馈 - 鼓励重试
    feedbackMessage = `${workflowResult.toolResult?.resultText}\n\n---\n\n`;
    feedbackMessage += `**用户的原始请求**："${originalUserMessage}"\n\n`;
    feedbackMessage += `⚠️ 刚才的工具调用有误，请仔细检查错误提示，立即重新生成正确的工具调用。\n`;
    feedbackMessage += `不要向用户解释错误，而是直接修正并重试。`;
  } else {
    // 成功反馈 - 根据工具类型指引下一步
    feedbackMessage = `## 工具执行结果\n\n${workflowResult.toolResult?.resultText}\n\n---\n\n`;

    // 检测用户请求中的多步骤关键词
    const hasMultiStepKeywords = /然后|接着|再|之后|并且|同时|最后/.test(originalUserMessage);
    const hasUpdateKeyword = /修改|更新|改|调整|变更/.test(originalUserMessage);
    const hasCreateKeyword = /制定|创建|新建|建立/.test(originalUserMessage);
    const hasSearchKeyword = /搜索|查找|查询|找/.test(originalUserMessage);

    const toolHistory = workflowManager.getHistory();
    const completedTools = toolHistory.map((h) => h.tool).join(' → ');

    // 根据工具类型给出更明确的指引
    if (workflowResult.toolCall?.tool === 'search_web') {
      feedbackMessage += `**📌 用户的原始请求**："${originalUserMessage}"\n\n`;
      feedbackMessage += `**✅ 已完成步骤**: ${completedTools}\n\n`;

      if (hasMultiStepKeywords) {
        feedbackMessage += `⚠️ **重要**：用户的请求包含多个步骤（"然后"、"再"等关键词），你必须完成所有步骤！\n\n`;
      }

      feedbackMessage += `🔍 搜索已完成，现在分析下一步：\n`;

      if (hasCreateKeyword) {
        feedbackMessage += `✋ **你必须立即调用 create_plan 工具**创建计划，不要直接回复用户！\n`;
      } else if (hasUpdateKeyword) {
        feedbackMessage += `✋ **你必须立即调用 update_plan 工具**更新计划，不要直接回复用户！\n`;
      } else {
        feedbackMessage += `如果用户只要求搜索，现在可以总结。否则请继续调用相应工具。\n`;
      }
    } else if (workflowResult.toolCall?.tool === 'list_plans') {
      feedbackMessage += `**📌 用户的原始请求**："${originalUserMessage}"\n\n`;
      feedbackMessage += `**✅ 已完成步骤**: ${completedTools}\n\n`;
      feedbackMessage += `**⚠️ 重要：工具返回的数据已包含完整的 tasks 数组！**\n\n`;

      if (hasMultiStepKeywords) {
        feedbackMessage += `⚠️ **警告**：用户使用了"然后"等词，说明有多个步骤要完成！\n\n`;
      }

      feedbackMessage += `📋 计划列表已获取，现在分析下一步：\n`;

      if (hasSearchKeyword && !toolHistory.some((h) => h.tool === 'search_web')) {
        feedbackMessage += `✋ **你必须立即调用 search_web 工具**进行搜索，不要直接回复！\n`;
      } else if (hasUpdateKeyword) {
        feedbackMessage += `✋ **你必须立即调用 update_plan 工具**（使用上面返回的plan_id），不要直接回复用户！\n`;
      } else {
        feedbackMessage += `如果没有其他操作，请直接输出完整JSON（保留tasks数组）。\n`;
      }
    } else {
      feedbackMessage += `**📌 用户的原始请求**："${originalUserMessage}"\n\n`;
      feedbackMessage += `**✅ 已完成步骤**: ${completedTools}\n\n`;

      if (hasMultiStepKeywords) {
        feedbackMessage += `⚠️ 请仔细检查：用户的请求包含多步骤关键词，确认是否还有未完成的操作！\n\n`;
      }

      feedbackMessage += `请检查用户的原始请求，如果还有工具需要调用，请立即调用。否则可以总结回复。`;
    }
  }

  return feedbackMessage;
}

