/**
 * 指标查询端点
 * 路由: /api/metrics
 * 
 * ✅ 使用 Clean Architecture
 * 
 * 用途：
 * - 查看实时性能指标
 * - 监控系统运行状态
 * - 调试性能问题
 */

import { getContainer } from '../_clean/di-container.js';

export async function get() {
  try {
    // ✅ Clean Architecture
    const container = getContainer();
    const getMetricsSnapshotUseCase = container.getGetMetricsSnapshotUseCase();
    const snapshot = await getMetricsSnapshotUseCase.execute();
    
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      metrics: snapshot,
    };
  } catch (error: any) {
    console.error('❌ 获取指标失败:', error);
    
    return new Response(
      JSON.stringify({
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
}

