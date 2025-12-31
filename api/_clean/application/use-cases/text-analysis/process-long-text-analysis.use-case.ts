/**
 * Process Long Text Analysis Use Case
 * 
 * 处理超长文本的Map-Reduce分析
 * 
 * Map-Reduce流程：
 * 1. Split：切分超长文本为多个chunks
 * 2. Map：并行分析每个chunk，提取结构化信息
 * 3. Reduce：合并所有chunk的分析结果
 * 4. Final：生成最终综合评审报告
 */

import { SSEStreamWriter } from '../../../../utils/sseStreamWriter.js';
import { splitTextIntoChunks, type TextChunk } from '../../../../utils/textChunker.js';
import { buildMapPrompt, buildReducePrompt } from '../../../../config/chunkingPrompts.js';
import { callVolcengineModel } from '../../../infrastructure/llm/llm-caller.js';
import { volcengineService } from '../../../infrastructure/llm/volcengine-service.js';
import { extractThinkingAndContent } from '../../../shared/utils/content-extractor.js';
import type { ChatMessage } from '../../../../types/chat.js';
import { getContainer } from '../../../di-container.js';

export interface ChunkingOptions {
  maxChunks?: number;
  includeCitations?: boolean;
}

export interface ExtractedData {
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

export class ProcessLongTextAnalysisUseCase {
  /**
   * 执行超长文本分析
   */
  async execute(
    message: string,
    userId: string,
    conversationId: string,
    clientAssistantMessageId: string | undefined,
    modelType: 'local' | 'volcano',
    sseWriter: SSEStreamWriter,
    options: ChunkingOptions = {}
  ): Promise<void> {
    console.log('📦 [Long Text Analysis] 开始处理超长文本...');
    
    try {
      // 1. Split：切分文本
      const chunks = splitTextIntoChunks(message, {
        maxChunks: options.maxChunks || 30,
      });
      
      await sseWriter.sendEvent({
        type: 'chunking_init',
        totalChunks: chunks.length,
        estimatedSeconds: chunks.length * 5,
      });
      
      // 2. Map：分析每个chunk
      const extractedDataList: ExtractedData[] = [];
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        if (sseWriter.isClosed()) {
          console.log('⚠️  [Long Text Analysis] 客户端已断开，停止处理');
          return;
        }
        
        await sseWriter.sendEvent({
          type: 'chunking_progress',
          stage: 'map',
          chunkIndex: i,
          totalChunks: chunks.length,
        });
        
        console.log(`🔍 [Long Text Analysis] 分析第 ${i + 1}/${chunks.length} 段...`);
        
        const chunkData = await this.processChunk(chunk, i, chunks.length);
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
      
      console.log('🔄 [Long Text Analysis] 合并分析结果...');
      const mergedData = this.mergeExtractedData(extractedDataList);
      
      // 4. Final：生成最终评审（流式输出）
      await sseWriter.sendEvent({
        type: 'chunking_progress',
        stage: 'final',
      });
      
      console.log('📝 [Long Text Analysis] 生成最终评审报告...');
      
      const accumulatedText = await this.generateFinalReport(
        mergedData,
        message,
        chunks.length,
        sseWriter
      );
      
      // 5. 保存到数据库
      if (accumulatedText) {
        await this.saveToDatabase(
          accumulatedText,
          conversationId,
          userId,
          clientAssistantMessageId,
          modelType
        );
      }
      
    } catch (error: any) {
      console.error('❌ [Long Text Analysis] 处理失败:', error);
      throw error;
    }
  }

  /**
   * 处理单个chunk（Map阶段）
   */
  private async processChunk(
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
      
      return this.parseExtractedData(fullResponse, chunkIndex);
    } catch (error) {
      console.error(`❌ [Long Text Analysis] Chunk ${chunkIndex} 处理失败:`, error);
      return this.getEmptyExtractedData();
    }
  }

  /**
   * 解析提取的数据
   */
  private parseExtractedData(response: string, chunkIndex: number): ExtractedData {
    // 尝试从markdown代码块中提取JSON
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        const jsonStr = jsonMatch[1];
        const parsed = JSON.parse(jsonStr);
        return this.normalizeExtractedData(parsed);
      } catch {
        // 继续尝试其他解析方法
      }
    }
    
    // 尝试直接解析整个响应
    try {
      const parsed = JSON.parse(response);
      return this.normalizeExtractedData(parsed);
    } catch {
      console.warn(`⚠️  [Long Text Analysis] Chunk ${chunkIndex} JSON 解析失败，返回空数据`);
      return this.getEmptyExtractedData();
    }
  }

  /**
   * 规范化提取的数据
   */
  private normalizeExtractedData(parsed: any): ExtractedData {
    return {
      goals: parsed.extracted?.goals || [],
      milestones: parsed.extracted?.milestones || [],
      tasks: parsed.extracted?.tasks || [],
      metrics: parsed.extracted?.metrics || [],
      risks: parsed.extracted?.risks || [],
      unknowns: parsed.extracted?.unknowns || [],
    };
  }

  /**
   * 获取空的提取数据
   */
  private getEmptyExtractedData(): ExtractedData {
    return {
      goals: [],
      milestones: [],
      tasks: [],
      metrics: [],
      risks: [],
      unknowns: [],
    };
  }

  /**
   * 合并多个chunk的提取数据（Reduce阶段）
   */
  private mergeExtractedData(dataList: ExtractedData[]): ExtractedData {
    const merged: ExtractedData = this.getEmptyExtractedData();
    
    const normalize = (str: string) => str.trim().toLowerCase().replace(/\s+/g, ' ');
    
    const seenGoals = new Set<string>();
    const seenMilestones = new Set<string>();
    const seenMetrics = new Set<string>();
    const seenUnknowns = new Set<string>();
    const seenTaskTitles = new Set<string>();
    const seenRisks = new Set<string>();
    
    for (const data of dataList) {
      // 合并goals
      for (const goal of data.goals) {
        const key = normalize(goal);
        if (!seenGoals.has(key)) {
          seenGoals.add(key);
          merged.goals.push(goal);
        }
      }
      
      // 合并milestones
      for (const milestone of data.milestones) {
        const key = normalize(milestone);
        if (!seenMilestones.has(key)) {
          seenMilestones.add(key);
          merged.milestones.push(milestone);
        }
      }
      
      // 合并tasks
      for (const task of data.tasks) {
        const key = normalize(task.title);
        if (!seenTaskTitles.has(key)) {
          seenTaskTitles.add(key);
          merged.tasks.push(task);
        }
      }
      
      // 合并metrics
      for (const metric of data.metrics) {
        const key = normalize(metric);
        if (!seenMetrics.has(key)) {
          seenMetrics.add(key);
          merged.metrics.push(metric);
        }
      }
      
      // 合并risks
      for (const risk of data.risks) {
        const key = normalize(risk.risk);
        if (!seenRisks.has(key)) {
          seenRisks.add(key);
          merged.risks.push(risk);
        }
      }
      
      // 合并unknowns
      for (const unknown of data.unknowns) {
        const key = normalize(unknown);
        if (!seenUnknowns.has(key)) {
          seenUnknowns.add(key);
          merged.unknowns.push(unknown);
        }
      }
    }
    
    console.log(
      `✅ [Long Text Analysis] 合并完成: ${merged.goals.length} 目标, ` +
      `${merged.tasks.length} 任务, ${merged.risks.length} 风险`
    );
    
    return merged;
  }

  /**
   * 生成最终报告（Final阶段）
   */
  private async generateFinalReport(
    mergedData: ExtractedData,
    originalMessage: string,
    totalChunks: number,
    sseWriter: SSEStreamWriter
  ): Promise<string> {
    const finalPrompt = buildReducePrompt(mergedData, originalMessage, totalChunks);
    const messages: ChatMessage[] = [
      { role: 'user', content: finalPrompt }
    ];
    
    const stream = await callVolcengineModel(messages);
    
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
            console.log('✅ [Long Text Analysis] 最终评审完成');
            break;
          }
        }
      }
    }
    
    return accumulatedText;
  }

  /**
   * 保存到数据库
   */
  private async saveToDatabase(
    accumulatedText: string,
    conversationId: string,
    userId: string,
    clientAssistantMessageId: string | undefined,
    modelType: 'local' | 'volcano'
  ): Promise<void> {
    const { thinking, content } = extractThinkingAndContent(accumulatedText);
    
    const container = getContainer();
    const createMessageUseCase = container.getCreateMessageUseCase();
    const updateConversationUseCase = container.getUpdateConversationUseCase();
    
    await createMessageUseCase.execute(
      conversationId,
      userId,
      'assistant',
      content || accumulatedText,
      clientAssistantMessageId,
      modelType,
      thinking
    );
    
    const conversation = await container.getGetConversationUseCase().execute(conversationId, userId);
    if (conversation) {
      await updateConversationUseCase.execute(
        conversationId,
        userId,
        { messageCount: conversation.messageCount + 1 }
      );
    }
    
    console.log('✅ [Long Text Analysis] 消息已保存到数据库');
  }
}

