# 🚀 高并发优化快速入门指南

## 📋 核心问题回顾

**场景：** 200-500 人同时使用多 Agent 编排

**主要瓶颈：**
1. 🔴 **LLM API 调用**（最大瓶颈）- 并发过高会打爆火山引擎 API
2. ⚠️ **工具调用**（中等瓶颈）- 搜索工具可能超过限流
3. ✅ **数据库查询**（低瓶颈）- MongoDB 性能充足
4. ✅ **SSE 连接**（低瓶颈）- 已有队列管理
5. ✅ **CPU/内存**（低瓶颈）- 资源消耗可控

---

## ⚡ 立即可用的解决方案（已实现）

### 1. LLM 请求队列 ✅

**位置：** `api/_clean/infrastructure/llm/llm-request-queue.ts`

**功能：**
- ✅ 限制并发（默认 50）
- ✅ 控制 RPM（默认 500）
- ✅ 优先级队列（Host > Planner > Critic > Reporter）
- ✅ 超时控制
- ✅ 完整监控

**使用方式：**

```typescript
// 在 Agent 中使用
import { getGlobalLLMQueue } from '../_clean/infrastructure/llm/llm-request-queue.js';

class PlannerAgent {
  async generate(userQuery: string, context: any) {
    const queue = getGlobalLLMQueue();
    
    // 加入队列，自动排队和限流
    const result = await queue.enqueue(
      async () => {
        // 实际的 LLM API 调用
        return await volcengineService.chatCompletion(messages);
      },
      {
        agentType: 'planner',  // 设置优先级
        userId: context.userId,
        conversationId: context.conversationId,
        timeout: 30000,        // 30秒超时
      }
    );
    
    return result;
  }
}
```

**监控 API：**

```bash
# 查看队列状态
GET /api/queue/status

# 查看队列中的请求
GET /api/queue/items

# 暂停队列（紧急）
POST /api/queue/pause

# 恢复队列
POST /api/queue/resume

# 清空队列（慎用）
DELETE /api/queue/clear
```

---

### 2. V2 工具系统保护 ✅

**位置：** `api/tools/v2/`

**已有保护：**
- ✅ 限流器（并发 + 频率）
- ✅ 缓存管理器（智能缓存）
- ✅ 熔断器（自动降级）

**快速优化：** 调整限流配置

```typescript
// api/tools/v2/plugins/search-web.plugin.ts

export const searchWebPlugin: ToolPlugin = {
  rateLimit: {
    maxConcurrent: 100,    // ⬆️ 从 50 提升到 100
    maxPerMinute: 300,     // ⬆️ 从 100 提升到 300
    timeout: 10000,
  },
  
  cache: {
    enabled: true,
    ttl: 600,              // ⬆️ 从 300 延长到 600 秒（10 分钟）
    keyStrategy: 'params',
  },
};
```

---

### 3. SSE 连接管理 ✅

**位置：** `api/_clean/infrastructure/streaming/sse-limiter.ts`

**已有功能：**
- ✅ 并发连接限制（默认 200）
- ✅ 队列管理
- ✅ Token 机制
- ✅ 预估等待时间

**使用方式：** 已自动集成在 SSE Handler 中

---

## 🔧 配置调优（环境变量）

在 `.env` 文件中添加：

```bash
# LLM 请求队列
LLM_MAX_CONCURRENT=50        # LLM API 最大并发（根据 API 配额调整）
LLM_MAX_RPM=500             # 每分钟最大请求数
LLM_TIMEOUT=60000           # 超时时间（毫秒）

# SSE 连接
SSE_MAX_CONCURRENT=200      # 最大 SSE 连接数
SSE_HEARTBEAT_MS=15000      # 心跳间隔（毫秒）

# MongoDB
MONGO_MAX_POOL_SIZE=100     # 连接池大小
MONGO_MIN_POOL_SIZE=10      # 最小连接数

# 工具限流（可选，也可以在代码中配置）
SEARCH_MAX_CONCURRENT=100
SEARCH_MAX_RPM=300
SEARCH_CACHE_TTL=600
```

---

## 📊 监控和观测

### 1. 队列状态监控

```bash
# 实时查看队列状态
curl http://localhost:3000/api/queue/status

# 返回示例
{
  "status": "ok",
  "timestamp": 1704192000000,
  "queue": {
    "queueLength": 25,
    "activeRequests": 50,
    "totalProcessed": 1250,
    "totalSuccess": 1225,
    "totalFailed": 15,
    "totalTimeout": 10,
    "averageWaitTime": 2500,
    "averageProcessTime": 8000,
    "p95WaitTime": 5000,
    "p95ProcessTime": 15000,
    "currentRPM": 450,
    "maxRPM": 500,
    "currentConcurrency": 50,
    "maxConcurrency": 50,
    "utilizationRate": "100%"
  }
}
```

### 2. 工具系统监控

```typescript
// 查看工具指标
import { toolExecutor } from './api/tools/v2/index.js';

const metrics = toolExecutor.getMetrics('search_web');
console.log(metrics);
// {
//   name: 'search_web',
//   status: 'healthy',
//   totalCalls: 1000,
//   successCalls: 980,
//   cacheHitRate: '60%',
//   averageLatency: 234,
//   errorRate: '2%'
// }
```

### 3. 健康检查

```bash
# 系统健康检查
GET /api/health

# 返回
{
  "status": "healthy",
  "services": {
    "llmQueue": "healthy",
    "database": "healthy",
    "tools": "healthy"
  },
  "metrics": {
    "activeUsers": 350,
    "queueLength": 25,
    "cpu": "45%",
    "memory": "60%"
  }
}
```

---

## 🎯 性能目标

### Phase 1：立即优化（使用已实现的方案）

| 指标 | 目标 | 实现方式 |
|------|------|----------|
| **并发用户** | 200-300 | LLM 队列 + 工具限流 |
| **响应时间** | < 40秒 | 队列优先级 + 缓存 |
| **错误率** | < 2% | 熔断器 + 降级 |
| **实施时间** | 1-2 天 | 配置调整 + 代码集成 |

### Phase 2：架构优化（需要额外部署）

| 指标 | 目标 | 实现方式 |
|------|------|----------|
| **并发用户** | 400-500 | PM2 多实例 + 负载均衡 |
| **响应时间** | < 30秒 | Agent 并行 + Redis 缓存 |
| **错误率** | < 1% | 完整监控 + 自动告警 |
| **实施时间** | 2-4 周 | 架构改造 |

---

## 🚀 快速实施步骤

### 步骤 1：集成 LLM 请求队列（30 分钟）

**1. 在 Agent 中使用队列**

```typescript
// api/agents/baseAgent.ts

import { getGlobalLLMQueue } from '../_clean/infrastructure/llm/llm-request-queue.js';

export class BaseAgent {
  protected async callLLM(
    messages: any[],
    agentType: 'planner' | 'critic' | 'host' | 'reporter'
  ) {
    const queue = getGlobalLLMQueue();
    
    return await queue.enqueue(
      () => this.volcengineService.chatCompletion(messages),
      {
        agentType,
        userId: this.context.userId,
        conversationId: this.context.conversationId,
        timeout: 30000,
      }
    );
  }
}
```

**2. 更新 4 个 Agent**

```typescript
// api/agents/plannerAgent.ts
const result = await this.callLLM(messages, 'planner');

// api/agents/criticAgent.ts
const result = await this.callLLM(messages, 'critic');

// api/agents/hostAgent.ts
const result = await this.callLLM(messages, 'host');

// api/agents/reporterAgent.ts
const result = await this.callLLM(messages, 'reporter');
```

### 步骤 2：调整工具限流（5 分钟）

```typescript
// api/tools/v2/plugins/search-web.plugin.ts

rateLimit: {
  maxConcurrent: 100,  // ⬆️ 提升
  maxPerMinute: 300,   // ⬆️ 提升
  timeout: 10000,
},

cache: {
  enabled: true,
  ttl: 600,            // ⬆️ 延长
  keyStrategy: 'params',
},
```

### 步骤 3：添加监控（10 分钟）

```typescript
// 在 server.ts 或 app.ts 中
import './api/lambda/queue-monitoring.js';

// 监控 API 会自动注册
```

### 步骤 4：压力测试（1 小时）

```bash
# 使用 Apache Bench 或 Artillery 进行压测
npm install -g artillery

# 创建测试配置
cat > load-test.yml <<EOF
config:
  target: 'http://localhost:3000'
  phases:
    - duration: 60
      arrivalRate: 10  # 10个用户/秒
      name: "Warm up"
    - duration: 300
      arrivalRate: 50  # 50个用户/秒（模拟300并发）
      name: "Peak load"
scenarios:
  - name: "Multi-agent chat"
    flow:
      - post:
          url: "/api/chat"
          json:
            message: "帮我制定学习计划"
            mode: "multi_agent"
EOF

# 运行测试
artillery run load-test.yml
```

### 步骤 5：监控和调优（持续）

```bash
# 实时监控队列
watch -n 1 "curl -s http://localhost:3000/api/queue/status | jq '.queue'"

# 实时监控工具
watch -n 1 "curl -s http://localhost:3000/api/tool-system/status | jq"
```

---

## ⚠️ 常见问题和解决方案

### Q1: LLM API 仍然被限流

**症状：** 出现 429 错误

**解决：**
1. 降低 `LLM_MAX_CONCURRENT`（50 → 30）
2. 降低 `LLM_MAX_RPM`（500 → 300）
3. 联系火山引擎提升配额

### Q2: 队列长度持续增长

**症状：** `queueLength` 一直增加，不下降

**解决：**
1. 检查 LLM API 是否正常（可能挂了）
2. 增加并发数（如果 API 配额允许）
3. 启用熔断器快速失败
4. 返回降级响应

### Q3: 响应时间过长

**症状：** 用户等待 > 60秒

**解决：**
1. 优化 Prompt（减少 Token）
2. 开启 Agent 并行（部分 Agent 可以并行）
3. 增加缓存命中率（延长 TTL）
4. 使用更快的 LLM 模型

### Q4: 内存占用过高

**症状：** Node.js 进程内存 > 2GB

**解决：**
1. 增加堆内存：`--max-old-space-size=4096`
2. 定期清理过期会话
3. 限制队列长度上限
4. 使用 PM2 多实例分散负载

---

## 📈 性能优化建议

### 优先级 1：立即实施

- ✅ **集成 LLM 请求队列**（核心优化）
- ✅ **调整工具限流配置**
- ✅ **添加监控 API**

### 优先级 2：短期优化

- ⚠️ **部署 PM2 多实例**
- ⚠️ **配置 Nginx 负载均衡**
- ⚠️ **优化数据库索引**

### 优先级 3：长期规划

- 💡 **容器化部署（Docker + K8s）**
- 💡 **数据库集群（MongoDB 副本集）**
- 💡 **引入 Redis 缓存（可选）**

---

## 🎉 预期效果

### 实施 Phase 1 后

```
✅ 支持 200-300 并发用户
✅ 响应时间 < 40秒
✅ 错误率 < 2%
✅ LLM API 调用稳定
✅ 工具调用不超限
✅ 实时监控队列状态
```

### 成本节省

```
优化前:
- API 调用: 600次/分钟 × $0.002 = $1.2/分钟
- 缓存命中率: 20%

优化后:
- API 调用: 300次/分钟 × $0.002 = $0.6/分钟
- 缓存命中率: 60%
- 节省: 50%成本
```

---

## 🔗 相关文档

- [详细解决方案](./HIGH_CONCURRENCY_SOLUTION.md)
- [LLM 队列实现](../../api/_clean/infrastructure/llm/llm-request-queue.ts)
- [使用示例](../../api/_clean/infrastructure/llm/llm-queue-usage-example.ts)
- [监控 API](../../api/lambda/queue-monitoring.ts)
- [V2 工具系统](../../api/tools/v2/README.md)

---

## ✅ 检查清单

### 代码集成
- [ ] 在 BaseAgent 中集成 LLM 队列
- [ ] 更新 4 个 Agent 使用队列
- [ ] 调整工具限流配置
- [ ] 添加监控 API 端点

### 配置
- [ ] 设置环境变量（`.env`）
- [ ] 调整 MongoDB 连接池
- [ ] 配置 PM2（可选）
- [ ] 配置 Nginx（可选）

### 测试
- [ ] 单元测试（队列基本功能）
- [ ] 压力测试（模拟 200-500 并发）
- [ ] 监控验证（查看实时指标）
- [ ] 错误处理测试（超时、失败等）

### 上线
- [ ] 灰度发布（10% 流量）
- [ ] 监控指标（1-2 天）
- [ ] 全量发布
- [ ] 持续监控和优化

---

**结论：** 使用已实现的 LLM 请求队列 + V2 工具系统保护，可以快速支持 200-300 并发用户，无需大规模架构改造。核心是：**限流 + 队列 + 缓存 + 监控**。

需要帮助？查看 [完整文档](./HIGH_CONCURRENCY_SOLUTION.md) 或运行 [使用示例](../../api/_clean/infrastructure/llm/llm-queue-usage-example.ts)！

