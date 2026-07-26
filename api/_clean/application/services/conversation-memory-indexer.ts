import { createHash } from 'node:crypto';
import type { MessageEntity } from '../../domain/entities/message.entity.js';
import type { IMemoryRepository } from '../interfaces/repositories/memory.repository.interface.js';
import type { IEmbeddingService } from '../../infrastructure/llm/embedding.service.js';
import type { MemoryItem } from '../../../db/models.js';

const CHUNK_SIZE = 1_200;
const CHUNK_OVERLAP = 120;
const EMBEDDING_VERSION = 'v1';

export interface IConversationMemoryIndexer {
  indexMessage(message: MessageEntity): Promise<void>;
  indexMessageInBackground(message: MessageEntity): void;
}

export class ConversationMemoryIndexer implements IConversationMemoryIndexer {
  constructor(
    private readonly memoryRepository: IMemoryRepository,
    private readonly embeddingService: IEmbeddingService
  ) {}

  indexMessageInBackground(message: MessageEntity): void {
    void this.indexMessage(message).catch(error => {
      console.warn(
        `⚠️ [MemoryIndex] 消息 ${message.messageId} 建索引失败，主流程继续:`,
        error
      );
    });
  }

  async indexMessage(message: MessageEntity): Promise<void> {
    if (!this.memoryRepository.replaceMemoryItemsForMessage) return;

    const chunks = splitMessage(message.content);
    if (chunks.length === 0) return;

    let embeddings: number[][] | undefined;
    let embeddingStatus: MemoryItem['embeddingStatus'] = 'unavailable';
    if (this.embeddingService.isConfigured()) {
      try {
        embeddings = await this.embeddingService.getBatchEmbeddings(chunks);
        embeddingStatus = 'ready';
      } catch (error) {
        embeddingStatus = 'failed';
        console.warn(
          `⚠️ [MemoryIndex] Embedding失败，保留全文检索索引:`,
          error
        );
      }
    }

    const now = new Date();
    const importance = calculateImportance(message.role, message.content);
    const items: MemoryItem[] = chunks.map((text, chunkIndex) => ({
      memoryId: `${message.messageId}:${chunkIndex}`,
      messageId: message.messageId,
      conversationId: message.conversationId,
      userId: message.userId,
      role: message.role,
      kind: 'message_chunk',
      chunkIndex,
      text,
      contentHash: createHash('sha256').update(text).digest('hex'),
      embedding: embeddings?.[chunkIndex],
      embeddingModel: embeddings ? this.embeddingService.getModel() : undefined,
      embeddingVersion: EMBEDDING_VERSION,
      embeddingStatus,
      importance,
      status: 'active',
      occurredAt: message.timestamp,
      createdAt: now,
      updatedAt: now,
    }));

    await this.memoryRepository.replaceMemoryItemsForMessage(
      message.messageId,
      message.userId,
      items
    );
  }
}

export function splitMessage(
  content: string,
  chunkSize = CHUNK_SIZE,
  overlap = CHUNK_OVERLAP
): string[] {
  const text = content.trim();
  if (!text) return [];
  if (text.length <= chunkSize) return [text];

  const chunks: string[] = [];
  const step = Math.max(1, chunkSize - overlap);
  for (let start = 0; start < text.length; start += step) {
    const chunk = text.slice(start, start + chunkSize).trim();
    if (chunk) chunks.push(chunk);
    if (start + chunkSize >= text.length) break;
  }
  return chunks;
}

export function calculateImportance(
  role: 'user' | 'assistant' | 'system',
  content: string
): number {
  let score = role === 'user' ? 0.55 : role === 'system' ? 0.8 : 0.35;
  const importantPatterns =
    /(记住|以后|始终|必须|不要|偏好|目标|截止|deadline|remember|always|prefer|must)/i;
  if (importantPatterns.test(content)) score += 0.25;
  if (content.length >= 80 && content.length <= 1_500) score += 0.05;
  return Math.min(1, score);
}
