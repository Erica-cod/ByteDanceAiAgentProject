// Single Conversation API
import { connectToDatabase } from '../../db/connection';
import { ConversationService } from '../../services/conversationService';
import { MessageService } from '../../services/messageService';

// Initialize database connection
connectToDatabase().catch(console.error);

/**
 * GET /api/conversations/:id - Get conversation details with messages
 */
export const get = async (c: any) => {
  try {
    const conversationId = c.req.param('id');
    const userId = c.req.query('userId');
    const limit = parseInt(c.req.query('limit') || '50');
    const skip = parseInt(c.req.query('skip') || '0');

    if (!userId) {
      return {
        success: false,
        error: 'userId is required'
      };
    }

    // Get conversation
    const conversation = await ConversationService.getConversation(conversationId, userId);
    
    if (!conversation) {
      return {
        success: false,
        error: 'Conversation not found or access denied'
      };
    }

    // Get messages
    const messagesResult = await MessageService.getConversationMessages(
      conversationId,
      userId,
      limit,
      skip
    );

    return {
      success: true,
      data: {
        conversation,
        messages: messagesResult.messages,
        total: messagesResult.total
      }
    };
  } catch (error: any) {
    console.error('❌ Get conversation error:', error);
    return {
      success: false,
      error: error.message || 'Failed to get conversation'
    };
  }
};

/**
 * DELETE /api/conversations/:id - Delete conversation
 */
export const del = async (c: any) => {
  try {
    const conversationId = c.req.param('id');
    const userId = c.req.query('userId');

    if (!userId) {
      return {
        success: false,
        error: 'userId is required'
      };
    }

    const deleted = await ConversationService.deleteConversation(conversationId, userId);

    if (!deleted) {
      return {
        success: false,
        error: 'Failed to delete conversation'
      };
    }

    return {
      success: true,
      message: 'Conversation deleted successfully'
    };
  } catch (error: any) {
    console.error('❌ Delete conversation error:', error);
    return {
      success: false,
      error: error.message || 'Failed to delete conversation'
    };
  }
};

