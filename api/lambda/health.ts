/**
 * 健康检查端点
 * 路由: /api/health
 * 
 * 用途：
 * - Docker健康检查
 * - 负载均衡器健康探测
 * - 监控系统状态检查
 */

import { getDatabase } from '../db/connection.js';

export async function get() {
  const startTime = Date.now();
  
  try {
    // 检查数据库连接
    const db = await getDatabase();
    await db.command({ ping: 1 });
    
    const responseTime = Date.now() - startTime;
    
    // 收集基本指标
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();
    
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(uptime),
      checks: {
        database: {
          status: 'ok',
          responseTime: `${responseTime}ms`,
        },
        memory: {
          heapUsed: `${(memUsage.heapUsed / 1024 / 1024).toFixed(1)}MB`,
          heapTotal: `${(memUsage.heapTotal / 1024 / 1024).toFixed(1)}MB`,
          usage: `${((memUsage.heapUsed / memUsage.heapTotal) * 100).toFixed(1)}%`,
        },
      },
    };
  } catch (error: any) {
    console.error('❌ 健康检查失败:', error);
    
    return new Response(
      JSON.stringify({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
      { 
        status: 503, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
}

