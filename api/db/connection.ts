import { MongoClient, Db } from 'mongodb';

let client: MongoClient | null = null;
let db: Db | null = null;
let connecting: Promise<Db> | null = null;

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-agent';

// ✅ MongoDB 连接池配置（针对200并发用户优化）
const MONGO_OPTIONS = {
  maxPoolSize: 300,           // 最大连接数：200用户 + 50%预留 = 300
  minPoolSize: 20,            // 最小连接数：保持20个热连接
  maxIdleTimeMS: 60000,       // 空闲连接60秒后回收
  serverSelectionTimeoutMS: 5000,  // 服务器选择超时5秒
  socketTimeoutMS: 45000,     // Socket超时45秒
  connectTimeoutMS: 10000,    // 连接超时10秒
  retryWrites: true,          // 自动重试写入
  retryReads: true,           // 自动重试读取
  // w 参数已在连接字符串中设置（w=majority），这里不重复设置避免类型冲突
};

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
      client = new MongoClient(MONGODB_URI, MONGO_OPTIONS);
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

    // Multi-Agent Sessions collection indexes (新增)
    // TTL索引：自动清理过期的会话（5分钟后）
    await db.collection('multi_agent_sessions').createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: 'ttl_index' }
    );
    // 查询索引：提高按sessionId和userId查询的性能
    await db.collection('multi_agent_sessions').createIndex(
      { sessionId: 1, userId: 1 },
      { name: 'session_user_index' }
    );
    // 唯一索引：确保同一个sessionId只有一条记录
    await db.collection('multi_agent_sessions').createIndex(
      { sessionId: 1 },
      { unique: true, name: 'session_unique_index' }
    );

    // ✅ Stream Progress collection indexes (续流功能)
    // 消息ID索引（唯一）
    await db.collection('stream_progress').createIndex(
      { messageId: 1 },
      { unique: true, name: 'message_id_unique' }
    );
    // 用户ID索引
    await db.collection('stream_progress').createIndex(
      { userId: 1 },
      { name: 'user_id_index' }
    );
    // 会话ID索引
    await db.collection('stream_progress').createIndex(
      { conversationId: 1 },
      { name: 'conversation_id_index' }
    );
    // TTL索引：30分钟后自动清理
    await db.collection('stream_progress').createIndex(
      { lastUpdateAt: 1 },
      { expireAfterSeconds: 1800, name: 'stream_progress_ttl' }
    );

    console.log('✅ Database indexes created (包括多Agent会话TTL索引 + 续流进度TTL索引)');
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

