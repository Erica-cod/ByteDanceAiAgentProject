/**
 * LRU (Least Recently Used) 配置
 * 
 * 用于控制 MongoDB 和 LocalStorage 的数据清理策略
 * 平衡存储压力和用户体验
 */

export interface LRUConfig {
  /** MongoDB 端配置 */
  mongodb: {
    /** 每个用户保留的最大活跃对话数（超过则归档最旧的） */
    maxActiveConversationsPerUser: number;
    
    /** 对话多久未访问会被自动归档（天数） */
    autoArchiveAfterDays: number;
    
    /** 归档对话多久后彻底删除（天数，0 表示永不删除） */
    deleteArchivedAfterDays: number;
    
    /** 每个用户保留的归档对话数量上限（超过则删除最旧的） */
    maxArchivedConversationsPerUser: number;
    
    /** 定期清理任务的执行间隔（小时） */
    cleanupIntervalHours: number;
  };

  /** LocalStorage 端配置 */
  localStorage: {
    /** 缓存的对话数量上限（超过则清理最少访问的） */
    maxCachedConversations: number;
    
    /** 每个对话最多缓存的消息数 */
    maxMessagesPerConversation: number;
    
    /** 缓存多久未访问会被清理（天数） */
    cacheExpireDays: number;
    
    /** LocalStorage 使用率阈值（超过则强制清理） */
    storageUsageThreshold: number; // 0.8 = 80%
  };
}

/**
 * 默认 LRU 配置（适合中小规模应用）
 */
export const DEFAULT_LRU_CONFIG: LRUConfig = {
  mongodb: {
    maxActiveConversationsPerUser: 50,        // 每用户最多 50 个活跃对话
    autoArchiveAfterDays: 30,                 // 30 天未访问自动归档
    deleteArchivedAfterDays: 180,             // 归档 6 个月后删除（0=永不删除）
    maxArchivedConversationsPerUser: 100,     // 每用户最多 100 个归档对话
    cleanupIntervalHours: 24,                 // 每天清理一次
  },
  localStorage: {
    maxCachedConversations: 20,               // 最多缓存 20 个对话
    maxMessagesPerConversation: 500,          // 每个对话最多 500 条消息
    cacheExpireDays: 7,                       // 7 天未访问清理缓存
    storageUsageThreshold: 0.8,               // 使用率超过 80% 强制清理
  },
};

/**
 * 生产环境配置（更激进的清理策略）
 */
export const PRODUCTION_LRU_CONFIG: LRUConfig = {
  mongodb: {
    maxActiveConversationsPerUser: 30,        // 每用户最多 30 个活跃对话
    autoArchiveAfterDays: 14,                 // 14 天未访问自动归档
    deleteArchivedAfterDays: 90,              // 归档 3 个月后删除
    maxArchivedConversationsPerUser: 50,      // 每用户最多 50 个归档对话
    cleanupIntervalHours: 12,                 // 每 12 小时清理一次
  },
  localStorage: {
    maxCachedConversations: 10,               // 最多缓存 10 个对话
    maxMessagesPerConversation: 300,          // 每个对话最多 300 条消息
    cacheExpireDays: 3,                       // 3 天未访问清理缓存
    storageUsageThreshold: 0.75,              // 使用率超过 75% 强制清理
  },
};

/**
 * 获取当前环境的 LRU 配置
 */
export function getLRUConfig(): LRUConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  return isProduction ? PRODUCTION_LRU_CONFIG : DEFAULT_LRU_CONFIG;
}

