/**
 * GET /api/messages/:messageId/content
 * 获取消息内容（支持分段加载）
 * 
 * Query参数:
 * - userId: 用户ID
 * - start: 起始位置（默认0）
 * - length: 长度（默认1000）
 */

import { getContainer } from '../../../_clean/di-container.js';

export async function get({ params, query }: { params: any; query: any }) {
  const { messageId } = params;
  const { userId, start = 0, length = 1000 } = query;
  
  if (!messageId || !userId) {
    return {
      status: 400,
      data: { error: '缺少必需参数' },
    };
  }
  
  try {
    const startNum = typeof start === 'string' ? parseInt(start) : start;
    const lengthNum = typeof length === 'string' ? parseInt(length) : length;
    
    if (isNaN(startNum) || isNaN(lengthNum) || startNum < 0 || lengthNum <= 0) {
      return {
        status: 400,
        data: { error: '参数格式错误' },
      };
    }
    
    const container = getContainer();
    const getMessageContentRangeUseCase = container.getGetMessageContentRangeUseCase();
    
    const result = await getMessageContentRangeUseCase.execute({
      messageId,
      userId,
      start: startNum,
      length: lengthNum,
    });
    
    if (!result) {
      return {
        status: 404,
        data: { error: '消息不存在' },
      };
    }
    
    return {
      status: 200,
      data: {
        content: result.content,
        start: result.start,
        length: result.length,
        total: result.total,
        hasMore: result.hasMore,
      },
    };
    
  } catch (error: any) {
    console.error('获取消息内容失败:', error);
    return {
      status: 500,
      data: { error: error.message || '获取失败' },
    };
  }
}

