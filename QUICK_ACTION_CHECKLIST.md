# 🚀 快速行动清单

## 已完成的优化 ✅

- [x] **MongoDB连接池配置**（`api/db/connection.ts`）
  - 最大连接数：300
  - 最小连接数：20
  - 添加超时和重试配置

- [x] **工具调用超时保护**（`api/handlers/sseHandler.ts`）
  - 总时间限制：60秒
  - 防止死循环卡死用户

- [x] **健康检查端点**（`api/lambda/health.ts`）
  - 路由：`/api/health`
  - 检查数据库连接和系统状态

- [x] **性能监控系统**（`api/services/metricsCollector.ts`）
  - 自动收集性能指标
  - 每60秒打印统计
  - 自动告警阈值检测

- [x] **监控查询端点**（`api/lambda/metrics.ts`）
  - 路由：`/api/metrics`
  - 查看实时性能数据

---

## 需要立即执行的步骤 ⚠️

### 1. 集成监控代码（10分钟）

在关键位置添加监控调用：

**a) 在 `api/lambda/chat.ts` 中添加SSE监控**：

```typescript
// 在文件顶部导入
import { metricsCollector } from '../services/metricsCollector.js';

// 在 acquireSSESlot 成功后
if (slot.ok === true) {
  metricsCollector.recordSSEConnection(); // ✅ 添加这行
  
  // 在 slot.release 中也要减少计数
  const originalRelease = slot.release;
  slot.release = () => {
    originalRelease();
    metricsCollector.recordSSEDisconnection(); // ✅ 添加这行
  };
}
```

**b) 在 `api/services/messageService.ts` 中添加数据库监控**：

```typescript
import { metricsCollector } from './metricsCollector.js';

// 在每个数据库查询前后
const startTime = Date.now();
try {
  const result = await db.collection('messages').find(...).toArray();
  metricsCollector.recordDBQuery(Date.now() - startTime); // ✅ 添加这行
  return result;
} catch (error) {
  metricsCollector.recordDBError(); // ✅ 添加这行
  throw error;
}
```

**c) 在 `api/services/volcengineService.ts` 中添加LLM监控**：

```typescript
import { metricsCollector } from './metricsCollector.js';

// 在LLM调用前后
const startTime = Date.now();
try {
  const response = await fetch(...);
  const duration = Date.now() - startTime;
  // 估算token（如果有实际值更好）
  const tokens = Math.ceil(responseText.length / 3);
  metricsCollector.recordLLMRequest(duration, tokens); // ✅ 添加这行
  return response;
} catch (error) {
  metricsCollector.recordLLMError(); // ✅ 添加这行
  throw error;
}
```

### 2. 配置MongoDB Atlas（30分钟）

```bash
# 1. 登录 MongoDB Atlas: https://cloud.mongodb.com/

# 2. 创建两个集群：
#    美国集群：us-east-1 (N. Virginia), M10
#    中国集群：ap-southeast-1 (Singapore), M10

# 3. 获取连接字符串并更新环境变量：
MONGODB_URI="mongodb+srv://username:password@cluster.mongodb.net/ai-agent?retryWrites=true&w=majority"

# 4. 配置网络访问白名单：
#    - 添加你的服务器IP
#    - 或使用 0.0.0.0/0（开发阶段）

# 5. 创建数据库用户并授权
```

### 3. 配置环境变量（5分钟）

创建 `.env.production` 文件：

```bash
# 基础配置
NODE_ENV=production
PORT=8080

# MongoDB（使用你的实际连接字符串）
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/ai-agent?retryWrites=true&w=majority&maxPoolSize=300&minPoolSize=20

# AI模型
ARK_API_KEY=你的火山引擎API密钥
ARK_API_URL=https://ark.cn-beijing.volces.com/api/v3/chat/completions
ARK_MODEL=doubao-1-5-thinking-pro-250415

# 搜索服务
TAVILY_API_KEY=你的Tavily API密钥

# 并发控制
MAX_SSE_CONNECTIONS=200
MAX_SSE_CONNECTIONS_PER_USER=1

# 监控
ENABLE_PERFORMANCE_MONITORING=true
SSE_HEARTBEAT_MS=15000
```

### 4. 测试部署（10分钟）

```bash
# 1. 构建项目
npm run build

# 2. 启动服务
npm run serve

# 3. 测试健康检查
curl http://localhost:8080/api/health

# 期望响应：
# {
#   "status": "healthy",
#   "checks": { "database": { "status": "ok" } }
# }

# 4. 测试监控端点
curl http://localhost:8080/api/metrics

# 5. 测试正常对话
# 在浏览器中访问并发送消息
```

---

## 压力测试（可选，但强烈建议）

### 使用 k6 进行负载测试

创建 `test/load-test.js`：

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 50 },   // 1分钟内增加到50用户
    { duration: '3m', target: 100 },  // 3分钟内增加到100用户
    { duration: '2m', target: 150 },  // 2分钟内增加到150用户
    { duration: '1m', target: 0 },    // 1分钟内降到0
  ],
  thresholds: {
    http_req_duration: ['p(95)<10000'], // 95%的请求在10秒内完成
    http_req_failed: ['rate<0.05'],     // 错误率低于5%
  },
};

export default function () {
  const payload = JSON.stringify({
    message: '你好，请介绍一下自己',
    modelType: 'volcano',
    userId: `test_user_${__VU}`, // 每个虚拟用户不同ID
    deviceId: `device_${__VU}`,
    mode: 'single',
  });

  const res = http.post('http://localhost:8080/api/chat', payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'has conversationId': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.conversationId !== undefined;
      } catch {
        return false;
      }
    },
  });

  sleep(10); // 每个用户每10秒发送一次请求
}
```

运行测试：

```bash
# 安装 k6
# MacOS: brew install k6
# Linux: 参考 https://k6.io/docs/getting-started/installation/

# 运行测试
k6 run test/load-test.js
```

---

## 上线前最后检查 ✓

- [ ] MongoDB Atlas集群已创建并可访问
- [ ] 环境变量已配置且正确
- [ ] 健康检查端点返回正常
- [ ] 监控系统已集成并工作
- [ ] 压力测试通过（可选但建议）
- [ ] 日志系统正常输出
- [ ] SSL证书已配置（生产环境）
- [ ] 备份策略已设置
- [ ] 告警规则已配置（邮件/短信）

---

## 部署到生产环境

### Docker部署

```bash
# 1. 构建镜像
docker build -t ai-agent:v1.0 .

# 2. 推送到镜像仓库（可选）
docker tag ai-agent:v1.0 yourregistry/ai-agent:v1.0
docker push yourregistry/ai-agent:v1.0

# 3. 在服务器上启动
docker run -d \
  --name ai-agent \
  -p 8080:8080 \
  --env-file .env.production \
  --restart unless-stopped \
  ai-agent:v1.0

# 4. 查看日志
docker logs -f ai-agent

# 5. 监控容器状态
docker stats ai-agent
```

### 使用 Docker Compose（推荐）

```bash
# 1. 上传 docker-compose.yml 和 .env.production 到服务器

# 2. 启动服务
docker-compose up -d

# 3. 查看状态
docker-compose ps

# 4. 查看日志
docker-compose logs -f app

# 5. 更新服务
docker-compose pull
docker-compose up -d
```

---

## 监控和维护

### 每天检查

```bash
# 查看健康状态
curl https://yourdomain.com/api/health

# 查看性能指标
curl https://yourdomain.com/api/metrics

# 查看日志（最近100行）
docker logs --tail 100 ai-agent
```

### 每周检查

- 查看MongoDB Atlas性能面板
- 检查磁盘使用率
- 审查错误日志
- 检查备份是否正常

### 告警设置

在 MongoDB Atlas 中设置：
- CPU使用率 > 80%
- 内存使用率 > 85%
- 连接数 > 270
- 磁盘使用率 > 80%

---

## 紧急故障处理

### 服务无响应

```bash
# 1. 检查服务状态
docker ps

# 2. 查看日志
docker logs ai-agent

# 3. 重启服务
docker restart ai-agent

# 4. 如果重启无效，重新部署
docker-compose down
docker-compose up -d
```

### 数据库连接失败

```bash
# 1. 检查MongoDB Atlas状态
# 访问 https://cloud.mongodb.com/

# 2. 检查网络白名单
# 确认服务器IP在白名单中

# 3. 测试连接
mongosh "你的连接字符串"

# 4. 检查连接池
curl http://localhost:8080/api/metrics
```

### 内存溢出

```bash
# 1. 查看内存使用
docker stats

# 2. 增加Node.js内存限制
# 在 .env.production 中添加：
NODE_OPTIONS=--max-old-space-size=6144

# 3. 重启服务
docker-compose restart
```

---

## 🎯 总结

**立即要做的**（1小时内）：
1. ✅ 集成监控代码（10分钟）
2. ✅ 配置MongoDB Atlas（30分钟）
3. ✅ 配置环境变量（5分钟）
4. ✅ 测试部署（10分钟）

**上线前要做的**（1天内）：
1. 压力测试（2小时）
2. 设置告警（30分钟）
3. 配置SSL和域名（1小时）
4. 最后检查清单（30分钟）

**上线后要做的**（持续）：
1. 监控系统状态（每天）
2. 检查性能指标（每周）
3. 审查用户反馈（每周）
4. 优化慢查询（按需）

祝你部署成功！🚀

