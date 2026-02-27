// User ID management utilities

import { fetchWithCsrf } from './fetchWithCsrf';

const USER_ID_KEY = 'ai_agent_user_id';

/**
 * Get or create user ID
 * Stores in localStorage for persistence
 */
export function getUserId(): string {
  let userId = localStorage.getItem(USER_ID_KEY);
  
  if (!userId) {
    // Generate a simple UUID
    userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem(USER_ID_KEY, userId);
    console.log('✅ Generated new user ID:', userId);
  }
  
  return userId;
}

/**
 * Initialize user in backend
 */
export async function initializeUser(userId: string): Promise<boolean> {
  try {
    const response = await fetchWithCsrf('/api/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        metadata: {
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString()
        }
      })
    });

    const data = await response.json();
    
    if (data.success) {
      console.log('✅ User initialized in backend:', data.data.userId);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('❌ Failed to initialize user:', error);
    return false;
  }
}

/**
 * Clear user ID (for testing/logout)
 */
export function clearUserId(): void {
  localStorage.removeItem(USER_ID_KEY);
  console.log('🗑️ User ID cleared');
}

