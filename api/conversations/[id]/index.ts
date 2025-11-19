// Single Conversation API
import { connectToDatabase } from '../../db/connection.js';
import { ConversationService } from '../../services/conversationService.js';
import { MessageService } from '../../services/messageService.js';

// Initialize database connection
connectToDatabase().catch(console.error);

/**
 * DELETE /api/conversations/:id - Delete conversation
 */
export const del = async (c: any) => {
  try {
    const conversationId = c.req.param('id');
    const userId = c.req.query('userId');

    if (!userId) {
      return { success: false, error: 'User ID is required' };
    }

    if (!conversationId) {
      return { success: false, error: 'Conversation ID is required' };
    }

    // Delete conversation
    const deleted = await ConversationService.deleteConversation(userId, conversationId);

    if (!deleted) {
      return { success: false, error: 'Conversation not found or already deleted' };
    }

    return {
      success: true,
      message: 'Conversation deleted successfully',
    };
  } catch (error: any) {
    console.error('Error deleting conversation:', error);
    return { success: false, error: error.message || 'Failed to delete conversation' };
  }
};

/**
 * PUT /api/conversations/:id - Update conversation title
 */
export const put = async (c: any) => {
  try {
    const conversationId = c.req.param('id');
    const body = c.data || {};
    const { userId, title } = body;

    if (!userId) {
      return { success: false, error: 'User ID is required' };
    }

    if (!conversationId) {
      return { success: false, error: 'Conversation ID is required' };
    }

    if (!title) {
      return { success: false, error: 'Title is required' };
    }

    // Update conversation title
    const updated = await ConversationService.updateConversationTitle(userId, conversationId, title);

    if (!updated) {
      return { success: false, error: 'Conversation not found' };
    }

    return {
      success: true,
      message: 'Conversation title updated successfully',
    };
  } catch (error: any) {
    console.error('Error updating conversation:', error);
    return { success: false, error: error.message || 'Failed to update conversation' };
  }
};

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

