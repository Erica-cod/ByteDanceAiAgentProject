# 🚀 多Agent系统高并发解决方案

## 📊 问题分析：200-500 人同时使用多 Agent 的压力

### 场景假设

```
用户规模: 200-500 人同时在线
使用模式: 多 Agent 编排（Planner → Critic → Host → Reporter）
平均响应时间: 30-60 秒/次对话
请求频率: 每个用户 2-3 次/分钟
```

### 压力计算

```javascript
// 峰值并发计算
用户数: 500 人
平均请求间隔: 30 秒
并发请求数 = 500 / 2 = 250 个同时进行的对话

// 多Agent调用量
每个对话的Agent调用次数:
- Planner: 1-3 轮 × 4 个Agent = 4-12 次LLM调用
- 平均每个对话: 8 次LLM调用
- 总计: 250 × 8 = 2000 次LLM调用同时进行

// 工具调用量（假设30%的对话使用工具）
工具调用: 250 × 0.3 × 3次/对话 = 225 次工具调用/分钟
```

---

## 🔥 核心瓶颈分析

### 1. **LLM API 调用（最大瓶颈）**

#### 问题
```typescript
// 当前架构：顺序调用
for (let round = 1; round <= maxRounds; round++) {
  await planner.generate();  // 等待 5-10秒
  await critic.generate();   // 等待 5-10秒
  await host.generate();     // 等待 5-10秒
  await reporter.generate(); // 等待 5-10秒
}
// 总耗时: 20-40秒 × 轮次数
```

**压力点：**
- ❌ 火山引擎 API 限流：TPM（Tokens Per Minute）和 RPM（Requests Per Minute）
- ❌ 500 用户 × 8 次调用 = 4000 RPM（可能超过配额）
- ❌ 顺序调用导致延迟累积

#### 解决方案

**方案 1：LLM API 请求队列 + 限流**

```typescript
// api/infrastructure/llm/llm-request-queue.ts

class LLMRequestQueue {
  private queue: Array<{
    id: string;
    execute: () => Promise<any>;
    priority: number;
  }> = [];
  
  private concurrent = 0;
  private maxConcurrent = 50; // 根据API配额设置
  private rpm = 0;
  private maxRPM = 500;

  async enqueue(request: () => Promise<any>, priority = 0) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        id: `req_${Date.now()}`,
        execute: async () => {
          try {
            const result = await request();
            resolve(result);
          } catch (error) {
            reject(error);
          }
        },
        priority,
      });
      
      this.processQueue();
    });
  }

  private async processQueue() {
    // 检查并发和频率限制
    if (this.concurrent >= this.maxConcurrent || this.rpm >= this.maxRPM) {
      return;
    }

    // 按优先级排序
    this.queue.sort((a, b) => b.priority - a.priority);
    
    const item = this.queue.shift();
    if (!item) return;

    this.concurrent++;
    this.rpm++;
    
    try {
      await item.execute();
    } finally {
      this.concurrent--;
      // 1分钟后重置RPM计数
      setTimeout(() => this.rpm--, 60000);
      this.processQueue();
    }
  }
}

// 全局单例
export const llmQueue = new LLMRequestQueue();
```

**使用：**
```typescript
// 在Agent中使用队列
const response = await llmQueue.enqueue(
  () => volcengineService.chatCompletion(messages),
  priority: 1 // Host优先级高
);
```

**方案 2：流式 + 并行优化**

```typescript
// 当前：顺序执行（慢）
const plannerResult = await planner.generate();  // 10秒
const criticResult = await critic.generate();    // 10秒
// 总计：20秒

// 优化：部分并行（快）
// Critic不依赖完整的Planner结果，可以边生成边分析
const [plannerResult, criticResult] = await Promise.all([
  planner.generateStream(),  // 流式生成
  critic.generateStream(),   // 同时开始
]);
// 总计：~10秒（节省50%时间）
```

---

### 2. **数据库查询（MongoDB）**

#### 问题
```typescript
// 高并发场景
500 用户 × 2-3 次查询/分钟 = 1000-1500 次查询/分钟
MongoDB 单实例理论上限: 10K-100K 次/秒
当前使用: 1500/60 = 25 次/秒
```

**压力评估：** ⚠️ **中等压力**（还有很大余量）

#### 解决方案

**方案 1：连接池优化**

```typescript
// api/db/connection.ts

const client = new MongoClient(uri, {
  maxPoolSize: 100,        // ✅ 连接池大小（默认100）
  minPoolSize: 10,         // ✅ 最小连接数
  maxIdleTimeMS: 30000,    // ✅ 空闲连接超时
  waitQueueTimeoutMS: 5000, // ✅ 等待超时
  retryWrites: true,       // ✅ 自动重试
  w: 'majority',           // ✅ 写入确认
});
```

**方案 2：查询优化 + 索引**

```typescript
// 为高频查询字段添加索引
await conversations.createIndex({ userId: 1, createdAt: -1 });
await messages.createIndex({ conversationId: 1, createdAt: -1 });
await plans.createIndex({ userId: 1, createdAt: -1 });

// 使用投影（只查询需要的字段）
const conversation = await conversations.findOne(
  { conversationId },
  { projection: { title: 1, messages: 1 } } // 只返回需要的字段
);

// 批量查询（减少往返次数）
const messages = await messagesCollection.find({
  conversationId: { $in: conversationIds }
}).toArray();
```

**方案 3：读写分离（可选）**

```typescript
// 如果MongoDB配置了副本集
const client = new MongoClient(uri, {
  readPreference: 'secondaryPreferred', // 优先从从节点读取
});
```

---

### 3. **SSE 长连接（内存和网络）**

#### 问题
```typescript
// 当前架构
500 个用户 × 1 个SSE连接 = 500 个长连接
每个连接内存: ~10KB
总内存: 500 × 10KB = 5MB（✅ 可接受）

// 但是：
- 每个连接占用一个 Node.js 事件循环槽位
- 心跳包占用网络带宽: 500 × 每15秒 = 33次心跳/秒
```

**压力评估：** ⚠️ **中等压力**

#### 解决方案

**方案 1：连接限流**

```typescript
// api/_clean/infrastructure/streaming/sse-limiter.ts（已有）

class SSELimiter {
  private maxConcurrent = 200; // ✅ 限制最大并发SSE连接
  private queue: Array<QueueItem> = [];

  async acquire() {
    if (this.current >= this.maxConcurrent) {
      // 加入队列，返回token和预估等待时间
      return {
        ok: false,
        queueToken: generateToken(),
        estimatedWaitTime: calculateWaitTime(),
      };
    }
    
    this.current++;
    return { ok: true };
  }
}
```

**方案 2：心跳优化**

```typescript
// 动态心跳间隔（已实现）
const HEARTBEAT_MS = process.env.SSE_HEARTBEAT_MS || 15000;

// 可以根据服务器负载动态调整
function getHeartbeatInterval() {
  const load = os.loadavg()[0]; // 1分钟平均负载
  
  if (load > 8) return 30000;      // 高负载：30秒
  if (load > 4) return 20000;      // 中负载：20秒
  return 15000;                    // 低负载：15秒
}
```

**方案 3：连接复用（WebSocket 升级）**

```typescript
// 可选：使用 WebSocket 代替 SSE
// 好处：双向通信、更低开销
// 缺点：需要改造前后端

// api/infrastructure/websocket/ws-manager.ts
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ 
  port: 8080,
  maxPayload: 100 * 1024, // 100KB
  perMessageDeflate: true,  // 压缩
});

wss.on('connection', (ws) => {
  ws.on('message', (data) => {
    // 处理消息
  });
});
```

---

### 4. **外部 API 调用（工具系统）**

#### 问题
```typescript
// v2工具系统已有保护机制
搜索工具: 50 并发，100 次/分钟
计划工具: 100 并发，500 次/分钟

// 高并发场景
500 用户 × 30% 使用工具 × 3 次/对话 = 450 次工具调用/分钟
搜索工具占比: 450 × 40% = 180 次/分钟 ❌ 超过限制（100次/分钟）
```

**压力评估：** 🔴 **高压力**

#### 解决方案

**方案 1：调整限流配置**

```typescript
// api/tools/v2/plugins/search-web.plugin.ts

export const searchWebPlugin: ToolPlugin = {
  rateLimit: {
    maxConcurrent: 100,    // ⬆️ 提升到 100
    maxPerMinute: 300,     // ⬆️ 提升到 300
    timeout: 10000,
  },
  
  cache: {
    enabled: true,
    ttl: 600,              // ⬆️ 延长到 10 分钟（相同查询更可能命中）
    keyStrategy: 'params',
  },
};
```

**方案 2：智能缓存策略**

```typescript
// 为常见查询预热缓存
const hotQueries = [
  'AI 技术发展',
  'Python 教程',
  '今日新闻',
];

// 后台定时预热
setInterval(async () => {
  for (const query of hotQueries) {
    await toolExecutor.execute('search_web', { query }, context);
  }
}, 5 * 60 * 1000); // 每5分钟预热一次
```

**方案 3：降级策略**

```typescript
// api/tools/v2/core/tool-executor.ts

async execute(toolName, params, context, options) {
  // 检查熔断器
  if (circuitBreaker.getState(toolName) === 'open') {
    // 降级：返回缓存或默认结果
    return {
      success: true,
      data: { message: '服务繁忙，请稍后重试' },
      degraded: true,
    };
  }
  
  // 正常执行
  return await this.executeNormal(toolName, params, context);
}
```

---

### 5. **CPU 和内存**

#### 问题
```typescript
// 多Agent协作内存消耗
每个会话状态: ~50KB（包含历史消息）
500 个并发会话: 500 × 50KB = 25MB ✅ 可接受

// CPU消耗
- JSON 解析/序列化: 中等
- 流式处理: 低（异步I/O）
- 文本处理: 低
```

**压力评估：** ✅ **低压力**

#### 解决方案

**方案 1：V8 内存优化**

```bash
# 启动时增加堆内存
node --max-old-space-size=4096 server.js  # 4GB堆内存
```

**方案 2：会话状态清理**

```typescript
// 定期清理过期会话
setInterval(async () => {
  const cutoff = Date.now() - 30 * 60 * 1000; // 30分钟前
  
  await conversations.deleteMany({
    updatedAt: { $lt: cutoff },
    status: 'completed',
  });
  
  console.log('🧹 已清理过期会话');
}, 10 * 60 * 1000); // 每10分钟清理一次
```

---

## 🏗️ 完整架构方案

### 架构图

```
                    [负载均衡器 - Nginx]
                            |
        +-------------------+-------------------+
        |                   |                   |
   [服务器 1]          [服务器 2]          [服务器 3]
   Node.js             Node.js             Node.js
        |                   |                   |
        +-------------------+-------------------+
                            |
              +-------------+-------------+
              |             |             |
         [MongoDB]     [Redis Cache]  [LLM API Queue]
       (主要存储)      (可选缓存)      (请求队列)
```

### 各层职责

#### 1. **负载均衡层（Nginx）**

```nginx
# nginx.conf

upstream nodejs_backend {
  least_conn;  # 最少连接数算法
  
  server 127.0.0.1:3000 weight=1 max_fails=3 fail_timeout=30s;
  server 127.0.0.1:3001 weight=1 max_fails=3 fail_timeout=30s;
  server 127.0.0.1:3002 weight=1 max_fails=3 fail_timeout=30s;
  
  keepalive 64;  # 保持连接池
}

server {
  listen 80;
  
  location /api/ {
    proxy_pass http://nodejs_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    
    # SSE 优化
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 600s;
  }
}
```

#### 2. **应用层（Node.js）**

**启动多实例（使用 PM2）**

```bash
# pm2 启动配置
pm2 start server.js -i 3  # 启动3个实例
pm2 start server.js -i max  # 根据CPU核心数自动
```

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'ai-agent',
    script: './server.js',
    instances: 3,
    exec_mode: 'cluster',
    max_memory_restart: '2G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
  }],
};
```

#### 3. **数据层（MongoDB + Redis）**

**MongoDB 配置**
```javascript
// 副本集配置（高可用）
const client = new MongoClient(uri, {
  replicaSet: 'rs0',
  maxPoolSize: 100,
  readPreference: 'secondaryPreferred',
});
```

**Redis 配置（可选）**
```javascript
// 用于高频缓存
const redis = new Redis({
  host: 'localhost',
  port: 6379,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
});
```

---

## 📊 性能指标和监控

### 关键指标

```typescript
// api/monitoring/metrics.ts

interface PerformanceMetrics {
  // 请求指标
  totalRequests: number;
  activeRequests: number;
  queuedRequests: number;
  
  // 响应时间
  averageResponseTime: number;  // 目标: < 30秒
  p95ResponseTime: number;      // 目标: < 60秒
  p99ResponseTime: number;      // 目标: < 90秒
  
  // 错误率
  errorRate: number;            // 目标: < 1%
  timeoutRate: number;          // 目标: < 0.5%
  
  // 资源使用
  cpuUsage: number;             // 目标: < 70%
  memoryUsage: number;          // 目标: < 80%
  activeConnections: number;    // 目标: < 500
  
  // LLM API
  llmQueueLength: number;       // 目标: < 50
  llmApiErrorRate: number;      // 目标: < 1%
  
  // 数据库
  dbQueryTime: number;          // 目标: < 100ms
  dbConnectionPool: number;     // 目标: < 80%
}
```

### 监控实现

```typescript
// api/monitoring/health-check.ts

export async function getHealthStatus(): Promise<HealthStatus> {
  const metrics = await collectMetrics();
  
  return {
    status: calculateOverallStatus(metrics),
    timestamp: Date.now(),
    metrics: {
      requests: {
        active: metrics.activeRequests,
        queued: metrics.queuedRequests,
        rps: metrics.requestsPerSecond,
      },
      performance: {
        avgResponseTime: metrics.averageResponseTime,
        p95: metrics.p95ResponseTime,
        errorRate: `${metrics.errorRate}%`,
      },
      resources: {
        cpu: `${metrics.cpuUsage}%`,
        memory: `${metrics.memoryUsage}%`,
        connections: metrics.activeConnections,
      },
      services: {
        llmApi: checkLLMApiStatus(),
        database: await checkDatabaseStatus(),
        cache: await checkCacheStatus(),
      },
    },
  };
}

// 健康检查端点
app.get('/api/health', async (req, res) => {
  const health = await getHealthStatus();
  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});
```

---

## 🚀 分阶段实施方案

### Phase 1: 立即优化（0-2 周）

**优先级：🔴 高**

1. ✅ **调整 v2 工具限流配置**
   - 搜索工具：100 → 300 次/分钟
   - 缓存 TTL：5 → 10 分钟

2. ✅ **优化 MongoDB 连接池**
   - maxPoolSize: 50 → 100
   - 添加索引

3. ✅ **实现 LLM 请求队列**
   - 限制并发：50
   - 限制 RPM：500

4. ✅ **添加监控端点**
   - `/api/health`
   - `/api/metrics`

**预期效果：**
- 支持 200-300 并发用户
- 响应时间 < 40秒
- 错误率 < 2%

### Phase 2: 架构优化（2-4 周）

**优先级：⚠️ 中**

1. ✅ **部署多实例**
   - 使用 PM2 启动 3 个实例
   - 配置负载均衡

2. ✅ **引入 Redis 缓存**
   - 热点查询缓存
   - 会话状态缓存

3. ✅ **Agent 并行优化**
   - 部分 Agent 并行执行
   - 流式响应优化

**预期效果：**
- 支持 400-500 并发用户
- 响应时间 < 30秒
- 错误率 < 1%

### Phase 3: 水平扩展（1-2 月）

**优先级：⚡ 低**

1. ✅ **容器化部署**
   - Docker + Kubernetes
   - 自动伸缩

2. ✅ **数据库集群**
   - MongoDB 副本集
   - 读写分离

3. ✅ **CDN 和边缘计算**
   - 静态资源 CDN
   - 边缘节点部署

**预期效果：**
- 支持 1000+ 并发用户
- 响应时间 < 20秒
- 高可用 99.9%

---

## 💰 成本估算

### 当前架构（500 并发用户）

```
服务器（3台）:
- 8核16GB × 3 = $300/月

MongoDB（副本集）:
- 4核8GB × 3 = $200/月

LLM API（火山引擎）:
- 500 用户 × 8 次调用/天 × $0.002/次 = $8/天 = $240/月

总计: $740/月
```

### 优化后架构

```
服务器（使用 PM2 单机多实例）:
- 16核32GB × 1 = $150/月

MongoDB（单实例）:
- 8核16GB × 1 = $80/月

LLM API（缓存命中率提升到60%）:
- 500 用户 × 8 次调用 × 40% 实际请求 × $0.002 = $96/月

Redis（可选）:
- 2核4GB = $30/月

总计: $356/月（节省 52%）
```

---

## 🎯 总结：核心要点

### ✅ 已有的保护机制

1. **V2 工具系统**
   - ✅ 限流器（并发 + 频率）
   - ✅ 缓存管理器（智能缓存）
   - ✅ 熔断器（自动降级）

2. **SSE 流式响应**
   - ✅ 长连接管理
   - ✅ 心跳保持
   - ✅ 连接限流

3. **队列系统**
   - ✅ 内存队列（适合单实例）
   - ✅ Token 机制
   - ✅ 预估等待时间

### ⚠️ 需要补充的优化

1. **LLM API 请求队列**（优先级：高）
   - 限制并发和 RPM
   - 避免打爆外部 API

2. **多实例部署**（优先级：中）
   - PM2 cluster 模式
   - 负载均衡

3. **Agent 并行优化**（优先级：中）
   - 部分并行执行
   - 减少总延迟

4. **监控和告警**（优先级：高）
   - 实时指标
   - 自动告警

### 📈 性能目标

| 指标 | 当前 | 优化后 Phase 1 | 优化后 Phase 2 |
|------|------|----------------|----------------|
| **并发用户** | 50-100 | 200-300 | 400-500 |
| **响应时间** | 40-60秒 | < 40秒 | < 30秒 |
| **错误率** | 5% | < 2% | < 1% |
| **成本** | $740/月 | $500/月 | $356/月 |

---

## 🔗 相关文档

- [V2 工具系统文档](../../api/tools/v2/README.md)
- [SSE 流式响应架构](../03-Streaming/)
- [多 Agent 编排设计](../04-Multi-Agent/)
- [性能优化总结](./PERFORMANCE-OPTIMIZATION-SUMMARY.md)

---

## 📝 检查清单

### 立即实施

- [ ] 调整 v2 工具限流配置
- [ ] 实现 LLM 请求队列
- [ ] 优化 MongoDB 连接池和索引
- [ ] 添加监控端点
- [ ] 压力测试验证

### 短期优化

- [ ] 部署 PM2 多实例
- [ ] 配置 Nginx 负载均衡
- [ ] 引入 Redis 缓存（可选）
- [ ] Agent 并行优化

### 长期规划

- [ ] 容器化部署
- [ ] Kubernetes 自动伸缩
- [ ] 数据库集群
- [ ] 全链路监控和告警

---

## 🆘 应急预案

### 场景 1：LLM API 被限流

**症状：** 大量 429 错误，响应缓慢

**应急措施：**
1. 启用熔断器，快速失败
2. 增加缓存 TTL（5 → 30 分钟）
3. 返回降级响应："服务繁忙，请稍后重试"

### 场景 2：数据库查询慢

**症状：** 查询时间 > 1秒

**应急措施：**
1. 检查慢查询日志
2. 添加缺失的索引
3. 增加连接池大小
4. 启用 Redis 缓存

### 场景 3：内存溢出

**症状：** Node.js 进程崩溃

**应急措施：**
1. 重启服务（PM2 自动）
2. 增加堆内存：`--max-old-space-size=4096`
3. 清理过期会话
4. 检查内存泄漏

---

**结论：** 通过合理的架构设计和分阶段优化，系统可以稳定支持 200-500 人同时使用多 Agent 编排，且成本可控。核心是：**限流保护 + 缓存优化 + 队列管理 + 水平扩展**。

