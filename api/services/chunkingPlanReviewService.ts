/**
 * Chunking 计划评审服务
 * 处理超长计划文本的智能分段分析
 */

import { SSEStreamWriter } from '../utils/sseStreamWriter.js';
import { splitTextIntoChunks, type TextChunk } from '../utils/textChunker.js';
import { buildMapPrompt, buildReducePrompt } from '../config/chunkingPrompts.js';
import { callVolcengineModel } from './modelService.js';
import { volcengineService } from './volcengineService.js';
import { MessageService } from './messageService.js';
import { ConversationService } from './conversationService.js';
import { extractThinkingAndContent } from '../_clean/shared/utils/content-extractor.js';
import type { ChatMessage } from '../types/chat.js';

interface ChunkingOptions {
  maxChunks?: number;
  includeCitations?: boolean;
}

interface ExtractedData {
  goals: string[];
  milestones: string[];
  tasks: Array<{
    title: string;
    owner?: string;
    deadline?: string;
    dependsOn?: string;
  }>;
  metrics: string[];
  risks: Array<{
    risk: string;
    mitigation?: string;
  }>;
  unknowns: string[];
}

/**
 * 处理超长计划文本的 chunking 分析
 */
export async function handleChunkingPlanReview(
  message: string,
  userId: string,
  conversationId: string,
  clientAssistantMessageId: string | undefined,
  modelType: 'local' | 'volcano',
  sseWriter: SSEStreamWriter,
  options: ChunkingOptions = {}
): Promise<void> {
  console.log('📦 [Chunking] 开始处理超长文本...');
  
  try {
    // 1. Split：切分文本
    const chunks = splitTextIntoChunks(message, {
      maxChunks: options.maxChunks || 30,
    });
    
    await sseWriter.sendEvent({
      type: 'chunking_init',
      totalChunks: chunks.length,
      estimatedSeconds: chunks.length * 5, // 粗略估算：每个 chunk 5 秒
    });
    
    // 2. Map：分析每个 chunk
    const extractedDataList: ExtractedData[] = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // 检查流是否已关闭
      if (sseWriter.isClosed()) {
        console.log('⚠️  [Chunking] 客户端已断开，停止处理');
        return;
      }
      
      await sseWriter.sendEvent({
        type: 'chunking_progress',
        stage: 'map',
        chunkIndex: i,
        totalChunks: chunks.length,
      });
      
      console.log(`🔍 [Chunking] 分析第 ${i + 1}/${chunks.length} 段...`);
      
      // 调用模型分析这个 chunk
      const chunkData = await processChunk(chunk, i, chunks.length);
      extractedDataList.push(chunkData);
      
      await sseWriter.sendEvent({
        type: 'chunking_chunk',
        chunkIndex: i,
        chunkSummary: chunkData.goals.join('; '),
      });
    }
    
    // 3. Reduce：合并数据
    await sseWriter.sendEvent({
      type: 'chunking_progress',
      stage: 'reduce',
    });
    
    console.log('🔄 [Chunking] 合并分析结果...');
    const mergedData = mergeExtractedData(extractedDataList);
    
    // 4. Final：生成最终评审（流式输出）
    await sseWriter.sendEvent({
      type: 'chunking_progress',
      stage: 'final',
    });
    
    console.log('📝 [Chunking] 生成最终评审报告...');
    
    const finalPrompt = buildReducePrompt(mergedData, message, chunks.length);
    const messages: ChatMessage[] = [
      { role: 'user', content: finalPrompt }
    ];
    
    const stream = await callVolcengineModel(messages);
    
    // 流式输出最终结果
    let buffer = '';
    let accumulatedText = '';
    
    for await (const chunk of stream) {
      if (sseWriter.isClosed()) break;
      
      const chunkStr = chunk.toString();
      buffer += chunkStr;
      
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.trim()) {
          const content = volcengineService.parseStreamLine(line);
          
          if (content) {
            accumulatedText += content;
            const { thinking, content: mainContent } = extractThinkingAndContent(accumulatedText);
            
            await sseWriter.sendEvent({
              content: mainContent,
              thinking: thinking || undefined,
            });
          }
          
          if (line.includes('[DONE]')) {
            console.log('✅ [Chunking] 最终评审完成');
            break;
          }
        }
      }
    }
    
    // 保存到数据库
    if (accumulatedText) {
      const { thinking, content } = extractThinkingAndContent(accumulatedText);
      await MessageService.addMessage(
        conversationId,
        userId,
        'assistant',
        content || accumulatedText,
        clientAssistantMessageId,
        thinking,
        modelType
      );
      await ConversationService.incrementMessageCount(conversationId, userId);
      console.log('✅ [Chunking] 消息已保存到数据库');
    }
    
  } catch (error: any) {
    console.error('❌ [Chunking] 处理失败:', error);
    throw error;
  }
}

/**
 * 处理单个 chunk（调用模型提取结构化信息）
 */
async function processChunk(
  chunk: TextChunk,
  chunkIndex: number,
  totalChunks: number
): Promise<ExtractedData> {
  const prompt = buildMapPrompt(chunk.content, chunkIndex, totalChunks);
  const messages: ChatMessage[] = [
    { role: 'user', content: prompt }
  ];
  
  try {
    const stream = await callVolcengineModel(messages);
    
    // 消费流并拼接完整响应
    let fullResponse = '';
    let buffer = '';
    
    for await (const streamChunk of stream) {
      const chunkStr = streamChunk.toString();
      buffer += chunkStr;
      
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.trim() && !line.includes('[DONE]')) {
          const content = volcengineService.parseStreamLine(line);
          if (content) {
            fullResponse += content;
          }
        }
      }
    }
    
    // 解析 JSON
    const jsonMatch = fullResponse.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      const jsonStr = jsonMatch[1];
      const parsed = JSON.parse(jsonStr);
      
      return {
        goals: parsed.extracted?.goals || [],
        milestones: parsed.extracted?.milestones || [],
        tasks: parsed.extracted?.tasks || [],
        metrics: parsed.extracted?.metrics || [],
        risks: parsed.extracted?.risks || [],
        unknowns: parsed.extracted?.unknowns || [],
      };
    }
    
    // 降级：尝试直接解析整个响应
    try {
      const parsed = JSON.parse(fullResponse);
      return {
        goals: parsed.extracted?.goals || [],
        milestones: parsed.extracted?.milestones || [],
        tasks: parsed.extracted?.tasks || [],
        metrics: parsed.extracted?.metrics || [],
        risks: parsed.extracted?.risks || [],
        unknowns: parsed.extracted?.unknowns || [],
      };
    } catch {
      console.warn(`⚠️  [Chunking] Chunk ${chunkIndex} JSON 解析失败，返回空数据`);
      return {
        goals: [],
        milestones: [],
        tasks: [],
        metrics: [],
        risks: [],
        unknowns: [],
      };
    }
  } catch (error) {
    console.error(`❌ [Chunking] Chunk ${chunkIndex} 处理失败:`, error);
    return {
      goals: [],
      milestones: [],
      tasks: [],
      metrics: [],
      risks: [],
      unknowns: [],
    };
  }
}

/**
 * 合并多个 chunk 的提取数据（去重 + 归一化）
 */
function mergeExtractedData(dataList: ExtractedData[]): ExtractedData {
  const merged: ExtractedData = {
    goals: [],
    milestones: [],
    tasks: [],
    metrics: [],
    risks: [],
    unknowns: [],
  };
  
  // 去重辅助函数
  const normalize = (str: string) => str.trim().toLowerCase().replace(/\s+/g, ' ');
  
  const seenGoals = new Set<string>();
  const seenMilestones = new Set<string>();
  const seenMetrics = new Set<string>();
  const seenUnknowns = new Set<string>();
  const seenTaskTitles = new Set<string>();
  const seenRisks = new Set<string>();
  
  for (const data of dataList) {
    // 合并 goals
    for (const goal of data.goals) {
      const key = normalize(goal);
      if (!seenGoals.has(key)) {
        seenGoals.add(key);
        merged.goals.push(goal);
      }
    }
    
    // 合并 milestones
    for (const milestone of data.milestones) {
      const key = normalize(milestone);
      if (!seenMilestones.has(key)) {
        seenMilestones.add(key);
        merged.milestones.push(milestone);
      }
    }
    
    // 合并 tasks（按 title 去重）
    for (const task of data.tasks) {
      const key = normalize(task.title);
      if (!seenTaskTitles.has(key)) {
        seenTaskTitles.add(key);
        merged.tasks.push(task);
      }
    }
    
    // 合并 metrics
    for (const metric of data.metrics) {
      const key = normalize(metric);
      if (!seenMetrics.has(key)) {
        seenMetrics.add(key);
        merged.metrics.push(metric);
      }
    }
    
    // 合并 risks
    for (const risk of data.risks) {
      const key = normalize(risk.risk);
      if (!seenRisks.has(key)) {
        seenRisks.add(key);
        merged.risks.push(risk);
      }
    }
    
    // 合并 unknowns
    for (const unknown of data.unknowns) {
      const key = normalize(unknown);
      if (!seenUnknowns.has(key)) {
        seenUnknowns.add(key);
        merged.unknowns.push(unknown);
      }
    }
  }
  
  console.log(`✅ [Chunking] 合并完成: ${merged.goals.length} 目标, ${merged.tasks.length} 任务, ${merged.risks.length} 风险`);
  
  return merged;
}

