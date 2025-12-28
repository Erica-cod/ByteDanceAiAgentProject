# 环境配置示例

> 本文档提供美国和中国服务器的环境变量配置示例

---

## 📋 使用说明

1. 根据部署地区选择对应的配置
2. 复制配置内容到 `.env.local` 文件
3. 替换所有 `your_xxx` 为实际值
4. 不要提交 `.env.local` 到 Git

---

## 🇺🇸 美国服务器配置

```env
# ============================================================
# 美国服务器环境配置
# ============================================================

# ==================== 地区标识 ====================
REGION=US
SERVER_NAME=us-server

# ==================== 数据库配置 ====================
# MongoDB连接字符串（指向中国服务器）
MONGODB_URI=mongodb://aiagent_user:your_password@cn-server.yourapp.com:27017/aiagent

# 注意：
# - 跨区访问会有 150-200ms 延迟
# - 但对于多Agent状态保存（每轮才一次，总共5次），延迟占比 < 1%
# - 用户无感知

# ==================== SSE并发限制 ====================
# 保护美国服务器的本地资源（内存实现，不需要Redis）
MAX_SSE_CONNECTIONS=200
MAX_SSE_CONNECTIONS_PER_USER=1

# 说明：
# - 这是美国服务器的本地限制，与中国服务器独立
# - 不需要全局统一，因为保护的是各自的本地资源
# - 详见：docs/ARCHITECTURE_DECISION.md

# ==================== LLM配置 ====================
# 方案1：火山引擎豆包大模型
VOLCENGINE_API_URL=https://ark.cn-beijing.volces.com/api/v3
VOLCENGINE_API_KEY=your_volcengine_api_key
VOLCENGINE_ENDPOINT_ID=your_endpoint_id

# 方案2：OpenAI（美国用户延迟更低，推荐）
# OPENAI_API_KEY=sk-...
# OPENAI_BASE_URL=https://api.openai.com/v1

# ==================== 应用配置 ====================
PORT=8000
NODE_ENV=production

# ==================== 日志配置 ====================
LOG_LEVEL=info
LOG_REGION=US

# ==================== SSE心跳配置 ====================
# SSE心跳间隔（毫秒），防止反向代理/负载均衡因空闲超时断开连接
SSE_HEARTBEAT_MS=15000

# ==================== 多Agent配置 ====================
# 多Agent最大轮次
MULTI_AGENT_MAX_ROUNDS=5

# ==================== Redis配置（已弃用） ====================
# ⚠️ 注意：多Agent状态保存已迁移到MongoDB，不再需要Redis
# 原因：低频操作（6.7次/秒）、需要持久化、数据规模小且可预测
# 详见：docs/ARCHITECTURE_DECISION.md
#
# 如果需要启用Redis（用于学习/测试）：
# REDIS_HOST=localhost
# REDIS_PORT=6379
# REDIS_PASSWORD=your_redis_password
# REDIS_COMPRESSION=true
# REDIS_ASYNC_WRITE=true

# ==================== 安全配置 ====================
# CORS允许的源（前端域名）
CORS_ORIGIN=https://yourapp.com,https://us.yourapp.com

# ==================== 监控配置（可选） ====================
# Sentry错误追踪
# SENTRY_DSN=https://your-sentry-dsn
# SENTRY_ENVIRONMENT=production-us

# ==================== 架构说明 ====================
# 当前配置基于以下架构决策：
# 
# 1. SSE限流：内存实现
#    - 原因：保护本地资源，不需要全局同步
#    - 性能：< 0.1ms，零依赖，零单点故障
# 
# 2. 多Agent状态：MongoDB
#    - 原因：低频操作、需要持久化、查询能力
#    - 跨区延迟：150-200ms（占比 < 1%，可忽略）
# 
# 3. 数据中心：中国
#    - 原因：主要用户在中国，数据统一管理
#    - 支持：用户全球漫游
# 
# 详见：docs/ARCHITECTURE_DECISION.md
```

---

## 🇨🇳 中国服务器配置

```env
# ============================================================
# 中国服务器环境配置
# ============================================================

# ==================== 地区标识 ====================
REGION=CN
SERVER_NAME=cn-server

# ==================== 数据库配置 ====================
# MongoDB连接字符串（本地）
MONGODB_URI=mongodb://aiagent_user:your_password@localhost:27017/aiagent

# 注意：
# - 中国服务器运行MongoDB主节点
# - 所有数据持久化在这里
# - 美国服务器会跨区访问这个数据库

# ==================== SSE并发限制 ====================
# 保护中国服务器的本地资源（内存实现，不需要Redis）
MAX_SSE_CONNECTIONS=200
MAX_SSE_CONNECTIONS_PER_USER=1

# 说明：
# - 这是中国服务器的本地限制，与美国服务器独立
# - 两个地区可以各自承载200并发，总共400并发
# - 详见：docs/ARCHITECTURE_DECISION.md

# ==================== LLM配置 ====================
# 火山引擎豆包大模型（中国区域）
VOLCENGINE_API_URL=https://ark.cn-beijing.volces.com/api/v3
VOLCENGINE_API_KEY=your_volcengine_api_key
VOLCENGINE_ENDPOINT_ID=your_endpoint_id

# 注意：中国用户访问国内LLM延迟低

# ==================== 应用配置 ====================
PORT=8000
NODE_ENV=production

# ==================== 日志配置 ====================
LOG_LEVEL=info
LOG_REGION=CN

# ==================== SSE心跳配置 ====================
# SSE心跳间隔（毫秒），防止反向代理/负载均衡因空闲超时断开连接
SSE_HEARTBEAT_MS=15000

# ==================== 多Agent配置 ====================
# 多Agent最大轮次
MULTI_AGENT_MAX_ROUNDS=5

# ==================== Redis配置（已弃用） ====================
# ⚠️ 注意：多Agent状态保存已迁移到MongoDB，不再需要Redis
# 原因：低频操作（6.7次/秒）、需要持久化、数据规模小且可预测
# 详见：docs/ARCHITECTURE_DECISION.md
#
# 如果需要启用Redis（用于学习/测试）：
# REDIS_HOST=localhost
# REDIS_PORT=6379
# REDIS_PASSWORD=your_redis_password
# REDIS_COMPRESSION=true
# REDIS_ASYNC_WRITE=true

# ==================== 安全配置 ====================
# CORS允许的源（前端域名）
CORS_ORIGIN=https://yourapp.com,https://cn.yourapp.com

# MongoDB配置
MONGODB_BIND_IP=0.0.0.0  # 允许美国服务器访问（注意配置防火墙）
MONGODB_AUTH_ENABLED=true

# ==================== 监控配置（可选） ====================
# Sentry错误追踪
# SENTRY_DSN=https://your-sentry-dsn
# SENTRY_ENVIRONMENT=production-cn

# ==================== 架构说明 ====================
# 当前配置基于以下架构决策：
# 
# 1. SSE限流：内存实现
#    - 原因：保护本地资源，不需要全局同步
#    - 性能：< 0.1ms，零依赖，零单点故障
# 
# 2. 多Agent状态：MongoDB（本地）
#    - 原因：低频操作、需要持久化、查询能力
#    - 性能：5-10ms 本地访问
# 
# 3. 数据中心：中国（主节点）
#    - 存储：所有用户数据、对话历史、Agent状态
#    - 访问：中国本地 + 美国跨区
# 
# 详见：docs/ARCHITECTURE_DECISION.md
```

---

## 🔧 MongoDB配置

### 中国服务器 MongoDB 配置文件

```yaml
# /etc/mongod.conf

# 网络配置
net:
  port: 27017
  bindIp: 0.0.0.0  # 允许外部访问（生产环境需配置防火墙）

# 安全配置
security:
  authorization: enabled  # 启用认证

# 存储配置
storage:
  dbPath: /var/lib/mongodb
  journal:
    enabled: true

# 日志配置
systemLog:
  destination: file
  path: /var/log/mongodb/mongod.log
  logAppend: true
  logRotate: reopen

# 副本集配置（可选，用于高级方案）
# replication:
#   replSetName: rs0
```

### 创建数据库用户

```bash
# 登录MongoDB
mongosh

# 创建管理员用户
use admin
db.createUser({
  user: "admin",
  pwd: "your_secure_admin_password",
  roles: ["root"]
})

# 创建应用数据库用户
use aiagent
db.createUser({
  user: "aiagent_user",
  pwd: "your_secure_app_password",
  roles: [
    { role: "readWrite", db: "aiagent" }
  ]
})

# 创建TTL索引（自动清理过期的多Agent会话）
db.multi_agent_sessions.createIndex(
  { "expiresAt": 1 },
  { expireAfterSeconds: 0 }
)

# 创建查询索引
db.multi_agent_sessions.createIndex(
  { "sessionId": 1, "userId": 1 }
)

# 验证索引
db.multi_agent_sessions.getIndexes()
```

---

## 🔐 防火墙配置

### 中国服务器防火墙

```bash
# 允许美国服务器IP访问MongoDB
sudo ufw allow from <美国服务器IP> to any port 27017

# 允许HTTP/HTTPS（Nginx）
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# 允许SSH（仅管理员IP）
sudo ufw allow from <管理员IP> to any port 22

# 启用防火墙
sudo ufw enable

# 查看状态
sudo ufw status verbose
```

### 美国服务器防火墙

```bash
# 允许HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# 允许SSH（仅管理员IP）
sudo ufw allow from <管理员IP> to any port 22

# 启用防火墙
sudo ufw enable
```

---

## 🧪 测试连接

### 测试美国服务器访问中国MongoDB

```bash
# 在美国服务器上执行
node -e "
const { MongoClient } = require('mongodb');
const uri = 'mongodb://aiagent_user:your_password@cn-server.yourapp.com:27017/aiagent';
const client = new MongoClient(uri);

async function test() {
  try {
    await client.connect();
    console.log('✅ MongoDB连接成功');
    
    const db = client.db('aiagent');
    const result = await db.command({ ping: 1 });
    console.log('✅ Ping成功:', result);
    
    // 测试写入延迟
    const collection = db.collection('test');
    const start = Date.now();
    await collection.insertOne({ test: true, timestamp: new Date() });
    const latency = Date.now() - start;
    console.log('📊 写入延迟:', latency, 'ms');
    
    await client.close();
  } catch (error) {
    console.error('❌ 连接失败:', error);
  }
}

test();
"
```

---

## 📊 监控脚本

### 健康检查脚本

```bash
#!/bin/bash
# health-check.sh - 监控服务器健康状态

# 配置
US_SERVER="https://us.yourapp.com"
CN_SERVER="https://cn.yourapp.com"
ALERT_WEBHOOK="https://your-webhook-url"  # 钉钉/Slack/企业微信

# 检查服务器健康
check_server() {
  local url=$1
  local name=$2
  
  response=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url/api/health")
  
  if [ "$response" = "200" ]; then
    echo "✅ $name 健康"
    return 0
  else
    echo "❌ $name 异常 (HTTP $response)"
    send_alert "$name 异常: HTTP $response"
    return 1
  fi
}

# 发送告警
send_alert() {
  local message=$1
  curl -X POST "$ALERT_WEBHOOK" \
    -H 'Content-Type: application/json' \
    -d "{\"text\":\"$message\"}"
}

# 执行检查
echo "$(date): 开始健康检查"
check_server "$US_SERVER" "美国服务器"
check_server "$CN_SERVER" "中国服务器"
echo "---"
```

### 配置定时任务

```bash
# 编辑crontab
crontab -e

# 每分钟检查一次
* * * * * /path/to/health-check.sh >> /var/log/health-check.log 2>&1
```

---

## 📚 相关文档

- [架构决策文档](./ARCHITECTURE_DECISION.md) - 技术选型说明
- [全球化部署指南](./GLOBAL_DEPLOYMENT_GUIDE.md) - 详细部署步骤
- [数据库设计](./DATABASE_DESIGN.md) - 数据库结构说明

---

**文档版本：** v1.0  
**最后更新：** 2024-12  
**负责人：** DevOps Team

