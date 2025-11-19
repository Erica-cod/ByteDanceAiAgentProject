import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../db/connection';
import { User } from '../db/models';

export class UserService {
  /**
   * Get or create user by userId
   */
  static async getOrCreateUser(userId?: string, metadata?: any): Promise<User> {
    const db = getDatabase();
    const collection = db.collection<User>('users');

    // If no userId provided, generate a new one
    if (!userId) {
      userId = uuidv4();
    }

    // Try to find existing user
    let user = await collection.findOne({ userId });

    if (!user) {
      // Create new user
      const newUser: User = {
        userId,
        createdAt: new Date(),
        lastActiveAt: new Date(),
        metadata: metadata || {}
      };

      await collection.insertOne(newUser);
      return newUser;
    }

    // Update last active time
    await collection.updateOne(
      { userId },
      { $set: { lastActiveAt: new Date() } }
    );

    return user;
  }

  /**
   * Get user by userId
   */
  static async getUserById(userId: string): Promise<User | null> {
    const db = getDatabase();
    const collection = db.collection<User>('users');
    return await collection.findOne({ userId });
  }

  /**
   * Update user profile
   */
  static async updateUser(userId: string, updates: Partial<User>): Promise<boolean> {
    const db = getDatabase();
    const collection = db.collection<User>('users');
    
    const result = await collection.updateOne(
      { userId },
      { $set: { ...updates, lastActiveAt: new Date() } }
    );

    return result.modifiedCount > 0;
  }
}

