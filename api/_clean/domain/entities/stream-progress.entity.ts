/**
 * 流式生成进度实体
 * 用于在前端断开连接时，继续接收模型输出并暂存，等待前端重连后续传
 */
export interface StreamProgress {
  /** 消息ID（关联到 messages 表） */
  messageId: string;

  /** 用户ID */
  userId: string;

  /** 会话ID */
  conversationId: string;

  /** 已累积的完整文本内容 */
  accumulatedText: string;

  /** 思考过程（如果有） */
  thinking?: string;

  /** 搜索来源（如果有） */
  sources?: Array<{ title: string; url: string }>;

  /** 模型类型 */
  modelType: 'local' | 'volcano';

  /** 流式生成状态 */
  status: 'streaming' | 'completed' | 'error';

  /** 前端最后接收到的位置（字符索引） */
  lastSentPosition: number;

  /** 最后更新时间（用于 TTL 索引） */
  lastUpdateAt: Date;

  /** 创建时间 */
  createdAt: Date;

  /** 错误信息（如果失败） */
  error?: string;
}

