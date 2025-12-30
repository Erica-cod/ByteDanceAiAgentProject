/**
 * 性能指标收集器
 * 
 * 用途：
 * - 监控系统性能
 * - 发现性能瓶颈
 * - 支持生产环境调优
 */

interface Metrics {
  // SSE连接指标
  activeSSEConnections: number;
  sseConnectionsTotal: number;
  sseConnectionErrors: number;
  
  // 数据库指标
  dbQueryCount: number;
  dbQueryDuration: number[];
  dbErrors: number;
  
  // LLM指标
  llmRequestCount: number;
  llmRequestDuration: number[];
  llmTokensUsed: number;
  llmErrors: number;
  
  // 工具调用指标
  toolCallCount: number;
  toolCallErrors: number;
  
  // 内存指标
  memoryUsage: NodeJS.MemoryUsage;
}

class MetricsCollector {
  private metrics: Metrics = {
    activeSSEConnections: 0,
    sseConnectionsTotal: 0,
    sseConnectionErrors: 0,
    dbQueryCount: 0,
    dbQueryDuration: [],
    dbErrors: 0,
    llmRequestCount: 0,
    llmRequestDuration: [],
    llmTokensUsed: 0,
    llmErrors: 0,
    toolCallCount: 0,
    toolCallErrors: 0,
    memoryUsage: process.memoryUsage(),
  };
  
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private isEnabled: boolean;
  
  constructor() {
    // 检查是否启用监控
    this.isEnabled = process.env.ENABLE_PERFORMANCE_MONITORING !== 'false';
    
    if (this.isEnabled) {
      // 每60秒打印一次统计
      this.statsTimer = setInterval(() => this.printStats(), 60000);
      console.log('📊 性能监控已启用');
    }
  }
  
  recordSSEConnection() {
    if (!this.isEnabled) return;
    this.metrics.activeSSEConnections++;
    this.metrics.sseConnectionsTotal++;
  }
  
  recordSSEDisconnection() {
    if (!this.isEnabled) return;
    this.metrics.activeSSEConnections = Math.max(0, this.metrics.activeSSEConnections - 1);
  }
  
  recordSSEError() {
    if (!this.isEnabled) return;
    this.metrics.sseConnectionErrors++;
  }
  
  recordDBQuery(durationMs: number) {
    if (!this.isEnabled) return;
    this.metrics.dbQueryCount++;
    this.metrics.dbQueryDuration.push(durationMs);
    
    // 只保留最近1000条记录
    if (this.metrics.dbQueryDuration.length > 1000) {
      this.metrics.dbQueryDuration.shift();
    }
  }
  
  recordDBError() {
    if (!this.isEnabled) return;
    this.metrics.dbErrors++;
  }
  
  recordLLMRequest(durationMs: number, tokensUsed: number = 0) {
    if (!this.isEnabled) return;
    this.metrics.llmRequestCount++;
    this.metrics.llmRequestDuration.push(durationMs);
    this.metrics.llmTokensUsed += tokensUsed;
    
    if (this.metrics.llmRequestDuration.length > 1000) {
      this.metrics.llmRequestDuration.shift();
    }
  }
  
  recordLLMError() {
    if (!this.isEnabled) return;
    this.metrics.llmErrors++;
  }
  
  recordToolCall() {
    if (!this.isEnabled) return;
    this.metrics.toolCallCount++;
  }
  
  recordToolCallError() {
    if (!this.isEnabled) return;
    this.metrics.toolCallErrors++;
  }
  
  private printStats() {
    if (!this.isEnabled) return;
    
    console.log('\n📊 ===== 性能统计 (过去60秒) =====');
    console.log(`🔌 活跃SSE连接: ${this.metrics.activeSSEConnections}`);
    console.log(`📊 总SSE连接数: ${this.metrics.sseConnectionsTotal}, 错误: ${this.metrics.sseConnectionErrors}`);
    
    if (this.metrics.dbQueryDuration.length > 0) {
      const avgDbTime = this.metrics.dbQueryDuration.reduce((a, b) => a + b, 0) / this.metrics.dbQueryDuration.length;
      const maxDbTime = Math.max(...this.metrics.dbQueryDuration);
      const minDbTime = Math.min(...this.metrics.dbQueryDuration);
      console.log(`💾 数据库查询: ${this.metrics.dbQueryCount} 次`);
      console.log(`   平均 ${avgDbTime.toFixed(1)}ms, 最大 ${maxDbTime.toFixed(1)}ms, 最小 ${minDbTime.toFixed(1)}ms`);
      console.log(`   错误: ${this.metrics.dbErrors} 次`);
    }
    
    if (this.metrics.llmRequestDuration.length > 0) {
      const avgLLMTime = this.metrics.llmRequestDuration.reduce((a, b) => a + b, 0) / this.metrics.llmRequestDuration.length;
      const maxLLMTime = Math.max(...this.metrics.llmRequestDuration);
      console.log(`🤖 LLM调用: ${this.metrics.llmRequestCount} 次`);
      console.log(`   平均 ${(avgLLMTime/1000).toFixed(1)}s, 最大 ${(maxLLMTime/1000).toFixed(1)}s`);
      console.log(`   Token使用: ${this.metrics.llmTokensUsed}, 错误: ${this.metrics.llmErrors} 次`);
    }
    
    if (this.metrics.toolCallCount > 0) {
      console.log(`🔧 工具调用: ${this.metrics.toolCallCount} 次, 错误: ${this.metrics.toolCallErrors} 次`);
    }
    
    const mem = process.memoryUsage();
    const heapUsedMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
    const heapTotalMB = (mem.heapTotal / 1024 / 1024).toFixed(1);
    const heapUsagePercent = ((mem.heapUsed / mem.heapTotal) * 100).toFixed(1);
    console.log(`💾 内存使用: ${heapUsedMB}MB / ${heapTotalMB}MB (${heapUsagePercent}%)`);
    
    // ⚠️ 告警检查
    const alertThresholds = {
      sseConnections: Number.parseInt(process.env.MAX_SSE_CONNECTIONS || '200', 10) * 0.9,
      heapUsagePercent: 85,
      sseErrorRate: 0.03, // 3%
      dbErrorRate: 0.05,  // 5%
    };
    
    if (this.metrics.activeSSEConnections > alertThresholds.sseConnections) {
      console.warn(`⚠️  警告：SSE连接数过高 (${this.metrics.activeSSEConnections} > ${alertThresholds.sseConnections})`);
    }
    
    if (parseFloat(heapUsagePercent) > alertThresholds.heapUsagePercent) {
      console.warn(`⚠️  警告：内存使用率过高 (${heapUsagePercent}%)`);
    }
    
    const sseErrorRate = this.metrics.sseConnectionsTotal > 0 
      ? this.metrics.sseConnectionErrors / this.metrics.sseConnectionsTotal 
      : 0;
    if (sseErrorRate > alertThresholds.sseErrorRate) {
      console.warn(`⚠️  警告：SSE错误率过高 (${(sseErrorRate * 100).toFixed(1)}%)`);
    }
    
    console.log('=====================================\n');
    
    // 重置周期性计数器（保留累积指标）
    this.metrics.dbQueryCount = 0;
    this.metrics.llmRequestCount = 0;
    this.metrics.toolCallCount = 0;
  }
  
  getMetrics(): Metrics {
    return { 
      ...this.metrics, 
      memoryUsage: process.memoryUsage() 
    };
  }
  
  getSnapshot() {
    const mem = process.memoryUsage();
    const dbAvgTime = this.metrics.dbQueryDuration.length > 0
      ? this.metrics.dbQueryDuration.reduce((a, b) => a + b, 0) / this.metrics.dbQueryDuration.length
      : 0;
    const llmAvgTime = this.metrics.llmRequestDuration.length > 0
      ? this.metrics.llmRequestDuration.reduce((a, b) => a + b, 0) / this.metrics.llmRequestDuration.length
      : 0;
    
    return {
      sse: {
        active: this.metrics.activeSSEConnections,
        total: this.metrics.sseConnectionsTotal,
        errors: this.metrics.sseConnectionErrors,
        errorRate: this.metrics.sseConnectionsTotal > 0 
          ? (this.metrics.sseConnectionErrors / this.metrics.sseConnectionsTotal * 100).toFixed(2) + '%'
          : '0%',
      },
      database: {
        queries: this.metrics.dbQueryCount,
        avgTime: dbAvgTime.toFixed(1) + 'ms',
        errors: this.metrics.dbErrors,
      },
      llm: {
        requests: this.metrics.llmRequestCount,
        avgTime: (llmAvgTime / 1000).toFixed(1) + 's',
        tokensUsed: this.metrics.llmTokensUsed,
        errors: this.metrics.llmErrors,
      },
      tools: {
        calls: this.metrics.toolCallCount,
        errors: this.metrics.toolCallErrors,
      },
      memory: {
        heapUsed: (mem.heapUsed / 1024 / 1024).toFixed(1) + 'MB',
        heapTotal: (mem.heapTotal / 1024 / 1024).toFixed(1) + 'MB',
        usage: ((mem.heapUsed / mem.heapTotal) * 100).toFixed(1) + '%',
      },
    };
  }
  
  reset() {
    this.metrics = {
      activeSSEConnections: 0,
      sseConnectionsTotal: 0,
      sseConnectionErrors: 0,
      dbQueryCount: 0,
      dbQueryDuration: [],
      dbErrors: 0,
      llmRequestCount: 0,
      llmRequestDuration: [],
      llmTokensUsed: 0,
      llmErrors: 0,
      toolCallCount: 0,
      toolCallErrors: 0,
      memoryUsage: process.memoryUsage(),
    };
    console.log('📊 性能指标已重置');
  }
  
  stop() {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
      console.log('📊 性能监控已停止');
    }
  }
}

// 导出单例
export const metricsCollector = new MetricsCollector();

