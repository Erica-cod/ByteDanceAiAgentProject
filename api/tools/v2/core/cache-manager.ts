/**
 * 工具缓存管理器
 * 
 * 功能：
 * - 基于参数的智能缓存
 * - 支持 TTL 过期
 * - 自动清理过期缓存
 */

import crypto from 'crypto';
import type { CacheConfig, ToolContext } from './types.js';

interface CacheEntry {
  result: any;
  timestamp: number;
  expiresAt: number;
  hits: number;
}

export class CacheManager {
  private cache: Map<string, CacheEntry> = new Map();
  private configs: Map<string, CacheConfig> = new Map();
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
  };

  constructor() {
    // 每 5 分钟清理一次过期缓存
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * 设置工具的缓存配置
   */
  setConfig(toolName: string, config: CacheConfig): void {
    this.configs.set(toolName, config);
  }

  /**
   * 生成缓存键
   */
  private generateKey(
    toolName: string,
    params: any,
    context: ToolContext,
    config: CacheConfig
  ): string {
    let keyData: any;

    switch (config.keyStrategy) {
      case 'user':
        // 按用户缓存（同一用户同样的参数返回缓存）
        keyData = { userId: context.userId, params };
        break;
      
      case 'custom':
        // 自定义策略
        if (config.keyGenerator) {
          return config.keyGenerator(params, context);
        }
        // 降级到默认策略
        keyData = params;
        break;
      
      case 'params':
      default:
        // 只按参数缓存（不区分用户）
        keyData = params;
        break;
    }

    const dataStr = JSON.stringify(keyData);
    const hash = crypto.createHash('md5').update(dataStr).digest('hex');
    return `${toolName}:${hash}`;
  }

  /**
   * 获取缓存
   */
  get(toolName: string, params: any, context: ToolContext): any | null {
    const config = this.configs.get(toolName);
    
    // 缓存未启用
    if (!config || !config.enabled) {
      return null;
    }

    const key = this.generateKey(toolName, params, context, config);
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    
    // 检查是否过期
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }
    
    // 命中
    entry.hits++;
    this.stats.hits++;
    console.log(`✅ 缓存命中: ${toolName} (已使用 ${entry.hits} 次)`);
    
    return {
      ...entry.result,
      fromCache: true,
    };
  }

  /**
   * 设置缓存
   */
  set(toolName: string, params: any, context: ToolContext, result: any): void {
    const config = this.configs.get(toolName);
    
    // 缓存未启用
    if (!config || !config.enabled) {
      return;
    }

    const key = this.generateKey(toolName, params, context, config);
    const now = Date.now();
    
    this.cache.set(key, {
      result,
      timestamp: now,
      expiresAt: now + config.ttl * 1000,
      hits: 0,
    });
    
    this.stats.sets++;
    console.log(`💾 缓存已设置: ${toolName}，有效期 ${config.ttl}秒`);
  }

  /**
   * 清除指定工具的所有缓存
   */
  clear(toolName: string): number {
    let cleared = 0;
    
    for (const [key, _] of this.cache.entries()) {
      if (key.startsWith(`${toolName}:`)) {
        this.cache.delete(key);
        cleared++;
      }
    }
    
    if (cleared > 0) {
      console.log(`🧹 清除了 ${cleared} 个 "${toolName}" 的缓存`);
    }
    
    return cleared;
  }

  /**
   * 清除所有缓存
   */
  clearAll(): void {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`🧹 清除了所有缓存，共 ${size} 个`);
  }

  /**
   * 清理过期缓存
   */
  cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 清理了 ${cleaned} 个过期缓存`);
    }
  }

  /**
   * 获取缓存统计
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total * 100).toFixed(1) : '0.0';
    
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      sets: this.stats.sets,
      hitRate: `${hitRate}%`,
    };
  }

  /**
   * 获取指定工具的缓存统计
   */
  getToolStats(toolName: string) {
    let count = 0;
    let totalHits = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (key.startsWith(`${toolName}:`)) {
        count++;
        totalHits += entry.hits;
      }
    }
    
    return {
      count,
      totalHits,
      averageHits: count > 0 ? (totalHits / count).toFixed(1) : '0.0',
    };
  }
}

// 单例实例
export const cacheManager = new CacheManager();

