// User Management API
import { connectToDatabase } from '../db/connection.js';
import { UserService } from '../services/userService.js';

// Initialize database connection
connectToDatabase().catch(console.error);

/**
 * POST /api/user - Get or create user
 */
export const post = async (c: any) => {
  try {
    const body = c.data || {};
    const { userId, metadata } = body;

    const user = await UserService.getOrCreateUser(userId, metadata);

    return {
      success: true,
      data: {
        userId: user.userId,
        createdAt: user.createdAt,
        lastActiveAt: user.lastActiveAt
      }
    };
  } catch (error: any) {
    console.error('❌ User API error:', error);
    return {
      success: false,
      error: error.message || 'Failed to process user request'
    };
  }
};

/**
 * GET /api/user - Get user profile
 */
export const get = async (c: any) => {
  try {
    const userId = c.req.query('userId');
    
    if (!userId) {
      return {
        success: false,
        error: 'userId is required'
      };
    }

    const user = await UserService.getUserById(userId);

    if (!user) {
      return {
        success: false,
        error: 'User not found'
      };
    }

    return {
      success: true,
      data: {
        userId: user.userId,
        username: user.username,
        createdAt: user.createdAt,
        lastActiveAt: user.lastActiveAt
      }
    };
  } catch (error: any) {
    console.error('❌ User GET API error:', error);
    return {
      success: false,
      error: error.message || 'Failed to get user'
    };
  }
};

