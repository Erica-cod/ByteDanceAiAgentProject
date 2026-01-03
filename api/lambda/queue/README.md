# 📊 LLM 请求队列监控 API

## 📋 概述

这些 API 端点用于监控和管理 LLM 请求队列的状态。

---

## 🔗 API 端点

### 1. 获取队列状态

**请求：**
```bash
GET /api/queue/status
```

**响应示例：**
```json
{
  "status": "ok",
  "timestamp": 1704192000000,
  "queue": {
    "queueLength": 25,
    "activeRequests": 45,
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
    "currentConcurrency": 45,
    "maxConcurrency": 50,
    "utilizationRate": "90%",
    "lastProcessedAt": 1704191900000,
    "uptime": 3600000
  }
}
```

**字段说明：**
- `queueLength`: 队列中等待的请求数
- `activeRequests`: 当前正在处理的请求数
- `totalProcessed`: 总处理请求数
- `totalSuccess`: 成功处理的请求数
- `totalFailed`: 失败的请求数
- `totalTimeout`: 超时的请求数
- `averageWaitTime`: 平均等待时间（毫秒）
- `averageProcessTime`: 平均处理时间（毫秒）
- `p95WaitTime`: P95 等待时间（毫秒）
- `p95ProcessTime`: P95 处理时间（毫秒）
- `currentRPM`: 当前每分钟请求数
- `maxRPM`: 最大每分钟请求数
- `currentConcurrency`: 当前并发数
- `maxConcurrency`: 最大并发数
- `utilizationRate`: 利用率
- `lastProcessedAt`: 最后处理时间戳
- `uptime`: 队列运行时间（毫秒）

---

### 2. 获取队列中的请求

**请求：**
```bash
GET /api/queue/items
```

**响应示例：**
```json
{
  "status": "ok",
  "timestamp": 1704192000000,
  "items": [
    {
      "id": "req_1704192000000_abc123",
      "agentType": "planner",
      "priority": 80,
      "waitTime": 2500
    },
    {
      "id": "req_1704192000001_def456",
      "agentType": "critic",
      "priority": 60,
      "waitTime": 2000
    }
  ],
  "count": 2
}
```

**用途：** 调试和监控队列中等待的请求

---

### 3. 暂停队列

**请求：**
```bash
POST /api/queue/pause
```

**响应示例：**
```json
{
  "status": "ok",
  "message": "队列已暂停",
  "timestamp": 1704192000000
}
```

**用途：** 紧急情况下暂停队列处理

**注意：** 
- 暂停后，新的请求会继续入队，但不会被处理
- 正在处理的请求会继续完成
- 使用 `resume` 恢复处理

---

### 4. 恢复队列

**请求：**
```bash
POST /api/queue/resume
```

**响应示例：**
```json
{
  "status": "ok",
  "message": "队列已恢复",
  "timestamp": 1704192000000
}
```

**用途：** 恢复已暂停的队列

---

### 5. 清空队列

**请求：**
```bash
POST /api/queue/clear
```

**响应示例：**
```json
{
  "status": "ok",
  "message": "队列已清空，拒绝了 25 个等待中的请求",
  "clearedCount": 25,
  "timestamp": 1704192000000
}
```

**用途：** 紧急情况下清空队列，拒绝所有等待的请求

**⚠️ 警告：**
- 这是一个危险操作！
- 会拒绝所有等待中的请求
- 用户会收到错误响应
- 仅在紧急情况下使用
- **生产环境应该添加管理员权限验证**

---

## 🚀 使用示例

### 使用 curl

```bash
# 查看队列状态
curl http://localhost:3000/api/queue/status

# 查看队列中的请求
curl http://localhost:3000/api/queue/items

# 暂停队列
curl -X POST http://localhost:3000/api/queue/pause

# 恢复队列
curl -X POST http://localhost:3000/api/queue/resume

# 清空队列（慎用）
curl -X POST http://localhost:3000/api/queue/clear
```

### 使用 JavaScript/TypeScript

```typescript
// 查看队列状态
const statusResponse = await fetch('/api/queue/status');
const status = await statusResponse.json();
console.log('队列状态:', status.queue);

// 暂停队列
const pauseResponse = await fetch('/api/queue/pause', {
  method: 'POST',
});
const pauseResult = await pauseResponse.json();
console.log(pauseResult.message);

// 恢复队列
const resumeResponse = await fetch('/api/queue/resume', {
  method: 'POST',
});
const resumeResult = await resumeResponse.json();
console.log(resumeResult.message);
```

---

## 📊 监控仪表板示例

### 实时监控脚本

```bash
#!/bin/bash
# monitor-queue.sh

while true; do
  clear
  echo "=========================================="
  echo "LLM 请求队列实时监控"
  echo "=========================================="
  echo ""
  
  curl -s http://localhost:3000/api/queue/status | jq '.queue'
  
  echo ""
  echo "=========================================="
  echo "按 Ctrl+C 退出"
  echo "=========================================="
  
  sleep 2
done
```

### 使用 watch 命令

```bash
# 每秒刷新一次队列状态
watch -n 1 "curl -s http://localhost:3000/api/queue/status | jq '.queue'"
```

---

## 🎯 监控指标说明

### 关键指标

| 指标 | 正常范围 | 警告阈值 | 危险阈值 |
|------|----------|----------|----------|
| **queueLength** | 0-20 | 20-50 | > 50 |
| **utilizationRate** | 50-80% | 80-95% | > 95% |
| **averageWaitTime** | < 3秒 | 3-10秒 | > 10秒 |
| **averageProcessTime** | < 10秒 | 10-30秒 | > 30秒 |
| **errorRate** | < 1% | 1-5% | > 5% |
| **currentRPM** | < 400 | 400-490 | > 490 |

### 告警规则建议

```typescript
// 示例告警逻辑
const status = await getQueueStatus();

// 队列积压告警
if (status.queue.queueLength > 50) {
  alert('队列积压严重！当前 ' + status.queue.queueLength + ' 个请求等待');
}

// 利用率告警
const utilization = parseFloat(status.queue.utilizationRate);
if (utilization > 95) {
  alert('队列利用率过高！当前 ' + utilization + '%');
}

// RPM 告警
if (status.queue.currentRPM > 490) {
  alert('接近 RPM 上限！当前 ' + status.queue.currentRPM + '/' + status.queue.maxRPM);
}

// 错误率告警
const errorRate = status.queue.totalFailed / status.queue.totalProcessed;
if (errorRate > 0.05) {
  alert('错误率过高！当前 ' + (errorRate * 100).toFixed(1) + '%');
}
```

---

## 🔧 故障排查

### 场景 1：队列长度持续增长

**症状：** `queueLength` 一直增加

**原因：**
1. 并发数不足
2. 处理速度慢
3. LLM API 故障

**解决：**
```bash
# 1. 查看利用率
curl http://localhost:3000/api/queue/status | jq '.queue.utilizationRate'

# 2. 如果利用率 < 50%，可能是 RPM 限制
# 增加 RPM 限制（修改 .env）
LLM_MAX_RPM=800

# 3. 如果利用率 100%，增加并发数
LLM_MAX_CONCURRENT=100
```

### 场景 2：请求超时过多

**症状：** `totalTimeout` 增长快

**原因：**
1. LLM API 响应慢
2. 超时设置太短
3. 网络问题

**解决：**
```bash
# 增加超时时间
LLM_TIMEOUT=90000  # 90秒
```

### 场景 3：错误率高

**症状：** `totalFailed` 占比大

**原因：**
1. LLM API 限流
2. 参数错误
3. 网络不稳定

**解决：**
```bash
# 1. 检查日志
# 2. 降低并发和 RPM
LLM_MAX_CONCURRENT=30
LLM_MAX_RPM=300

# 3. 暂停队列，排查问题
curl -X POST http://localhost:3000/api/queue/pause
```

---

## 🔐 安全建议

### 生产环境配置

1. **添加权限验证**

```typescript
// api/lambda/queue/clear.ts
export const post = async ({ headers }: any) => {
  // 验证管理员权限
  const apiKey = headers['x-admin-key'];
  if (apiKey !== process.env.ADMIN_API_KEY) {
    return {
      status: 'error',
      message: '权限不足',
      timestamp: Date.now(),
    };
  }
  
  // ... 执行清空操作
};
```

2. **限制访问 IP**

```nginx
# nginx.conf
location /api/queue/ {
  # 只允许内网访问
  allow 10.0.0.0/8;
  allow 172.16.0.0/12;
  allow 192.168.0.0/16;
  deny all;
  
  proxy_pass http://nodejs_backend;
}
```

3. **添加访问日志**

```typescript
export const post = async ({ headers }: any) => {
  const ip = headers['x-forwarded-for'] || headers['x-real-ip'];
  console.log(`[Admin] 队列操作: clear, IP: ${ip}, Time: ${new Date().toISOString()}`);
  
  // ... 执行操作
};
```

---

## 📚 相关文档

- [LLM 请求队列实现](../../_clean/infrastructure/llm/llm-request-queue.ts)
- [高并发解决方案](../../../docs/06-Performance-Optimization/HIGH_CONCURRENCY_SOLUTION.md)
- [快速入门指南](../../../docs/06-Performance-Optimization/QUICK_START_HIGH_CONCURRENCY.md)

---

## 🆘 常见问题

### Q: 如何在前端实时监控队列状态？

**A:** 使用轮询或 WebSocket

```typescript
// 轮询方式（简单）
setInterval(async () => {
  const response = await fetch('/api/queue/status');
  const status = await response.json();
  updateDashboard(status.queue);
}, 2000); // 每2秒刷新
```

### Q: 清空队列会影响正在处理的请求吗？

**A:** 不会。`clear()` 只会拒绝**等待中**的请求，正在处理的请求会继续完成。

### Q: 暂停队列后如何恢复？

**A:** 调用 `POST /api/queue/resume`

### Q: 队列状态会持久化吗？

**A:** 不会。队列状态存储在内存中，服务重启后会丢失。这是正常的设计，队列是临时状态。

---

**最后更新：** 2025-01-03

