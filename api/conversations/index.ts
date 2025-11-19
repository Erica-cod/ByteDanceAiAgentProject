// Conversations API
import { connectToDatabase } from '../db/connection.js';
import { ConversationService } from '../services/conversationService.js';
import { MessageService } from '../services/messageService.js';

// Initialize database connection
connectToDatabase().catch(console.error);

/**
 * POST /api/conversations - Create new conversation
 */
export const post = async (c: any) => {
  try {
    const body = c.data || {};
    const { userId, title } = body;

    if (!userId) {
      return {
        success: false,
        error: 'userId is required'
      };
    }

    const conversation = await ConversationService.createConversation(userId, title);

    return {
      success: true,
      data: conversation
    };
  } catch (error: any) {
    console.error('❌ Create conversation error:', error);
    return {
      success: false,
      error: error.message || 'Failed to create conversation'
    };
  }
};

/**
 * GET /api/conversations - Get user's conversations
 */
export const get = async (c: any) => {
  try {
    const userId = c.req.query('userId');
    const limit = parseInt(c.req.query('limit') || '20');
    const skip = parseInt(c.req.query('skip') || '0');

    if (!userId) {
      return {
        success: false,
        error: 'userId is required'
      };
    }

    const result = await ConversationService.getUserConversations(userId, limit, skip);

    return {
      success: true,
      data: result
    };
  } catch (error: any) {
    console.error('❌ Get conversations error:', error);
    return {
      success: false,
      error: error.message || 'Failed to get conversations'
    };
  }
};

