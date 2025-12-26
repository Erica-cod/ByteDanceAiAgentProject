import { MongoClient, Db } from 'mongodb';

let client: MongoClient | null = null;
let db: Db | null = null;
let connecting: Promise<Db> | null = null;

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-agent';

export async function connectToDatabase(): Promise<Db> {
  if (db) {
    return db;
  }

  // 如果正在连接中，返回相同的 Promise
  if (connecting) {
    return connecting;
  }

  connecting = (async () => {
    try {
      client = new MongoClient(MONGODB_URI);
      await client.connect();
      db = client.db();
      
      console.log('✅ MongoDB connected successfully');
      
      // Create indexes
      await createIndexes();
      
      return db;
    } catch (error) {
      console.error('❌ MongoDB connection failed:', error);
      connecting = null;
      throw error;
    }
  })();

  return connecting;
}

async function createIndexes() {
  if (!db) return;

  try {
    // Users collection indexes
    await db.collection('users').createIndex({ userId: 1 }, { unique: true });
    await db.collection('users').createIndex({ createdAt: 1 });

    // Conversations collection indexes
    await db.collection('conversations').createIndex({ conversationId: 1 }, { unique: true });
    await db.collection('conversations').createIndex({ userId: 1, updatedAt: -1 });
    await db.collection('conversations').createIndex({ userId: 1, isActive: 1 });

    // Messages collection indexes
    await db.collection('messages').createIndex({ messageId: 1 }, { unique: true });
    await db.collection('messages').createIndex({ conversationId: 1, timestamp: 1 });
    await db.collection('messages').createIndex({ userId: 1 });
    // 幂等写入用：同一会话/用户下，同一个 clientMessageId 只允许出现一次（只对有 clientMessageId 的文档建索引）
    await db
      .collection('messages')
      .createIndex(
        { conversationId: 1, userId: 1, clientMessageId: 1 }, 
        { 
          unique: true, 
          partialFilterExpression: { clientMessageId: { $exists: true, $ne: null } }
        }
      );

    // Plans collection indexes
    await db.collection('plans').createIndex({ planId: 1 }, { unique: true });
    await db.collection('plans').createIndex({ userId: 1, updatedAt: -1 });
    await db.collection('plans').createIndex({ userId: 1, isActive: 1 });

    console.log('✅ Database indexes created');
  } catch (error) {
    console.error('❌ Failed to create indexes:', error);
  }
}

export async function closeDatabase(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('MongoDB connection closed');
  }
}

export async function getDatabase(): Promise<Db> {
  if (!db && !connecting) {
    // 如果数据库未连接且没有在连接中，自动连接
    await connectToDatabase();
  } else if (connecting) {
    // 如果正在连接中，等待连接完成
    await connecting;
  }
  
  if (!db) {
    throw new Error('Database connection failed');
  }
  
  return db;
}

