# 全球化部署指南 (美国/中国双服务器)

> 本指南说明如何部署美国和中国双服务器架构，为全球用户提供低延迟体验。

---

## 📋 目录

1. [架构概览](#架构概览)
2. [部署方案](#部署方案)
3. [配置说明](#配置说明)
4. [DNS路由配置](#dns路由配置)
5. [监控和故障转移](#监控和故障转移)
6. [成本估算](#成本估算)

---

## 🌍 架构概览

### 整体架构图

```plaintext
┌─────────────────────────────────────────────────────────────┐
│                     全球用户                                  │
│          👤👤👤 (美国)      👤👤👤 (中国)                      │
└──────────────┬─────────────────────┬────────────────────────┘
               │                     │
               │ DNS智能路由          │
               │ (GeoDNS)            │
               │                     │
        ┌──────▼─────────┐    ┌─────▼──────────┐
        │  美国服务器     │    │  中国服务器     │
        │  us-server     │    │  cn-server     │
        │                │    │                │
        │ Node.js + Nginx│    │ Node.js + Nginx│
        │                │    │                │
        │ SSE限流(内存)  │    │ SSE限流(内存)  │
        │ activeGlobal   │    │ activeGlobal   │
        │ = 50 (独立)    │    │ = 80 (独立)    │
        └────────┬───────┘    └────────┬───────┘
                 │                     │
                 │  跨区访问            │ 本地访问
                 │  延迟 150-200ms     │ 延迟 5-10ms
                 │                     │
                 └──────────┬──────────┘
                            ↓
                   ┌─────────────────┐
                   │ MongoDB(中国)   │ ← 中心化数据库
                   │                 │
                   │ - 用户数据      │
                   │ - 对话历史      │
                   │ - Agent状态     │
                   └─────────────────┘
```

### 关键设计决策

| 组件 | 部署策略 | 理由 |
|------|---------|------|
| **Node.js服务** | 美国 + 中国各1台 | 提供低延迟SSE流式响应 |
| **SSE限流** | 各地区内存独立 | 保护各自的本地资源，不需要全局同步 |
| **MongoDB** | 中国单节点 | 数据统一，支持用户全球漫游 |
| **LLM API** | 各地区调用最近节点 | 降低LLM响应延迟 |

---

## 🚀 部署方案

### 方案1：基础方案（推荐开始）

**架构：** 中心化数据库 + 双地区应用服务器

**特点：**
- ✅ 实现简单，运维成本低
- ✅ 美国用户：本地SSE流式响应（低延迟）
- ✅ 中国用户：本地所有操作（最低延迟）
- ⚠️ 美国服务器访问MongoDB有跨区延迟（150-200ms）
  - 但占比 < 1%，用户无感知

**适用场景：**
- MVP阶段
- 日活用户 < 10000
- 预算有限

**成本：**
- 美国服务器：$20-50/月
- 中国服务器：￥100-300/月
- MongoDB：包含在中国服务器
- 总计：$30-80/月

---

### 方案2：MongoDB副本集（高级优化）

**架构：** MongoDB副本集 + 双地区应用服务器

**特点：**
- ✅ 美国服务器读本地副本（低延迟）
- ✅ 写入自动同步到中国主节点
- ✅ 自动故障转移
- ⚠️ 运维复杂度增加
- ⚠️ 成本增加（需要多个MongoDB实例）

**适用场景：**
- 日活用户 > 10000
- 对延迟极度敏感
- 有专业运维团队

**成本：**
- 美国服务器 + MongoDB副本：$50-100/月
- 中国服务器 + MongoDB主节点：￥300-600/月
- 总计：$80-150/月

---

### 方案3：MongoDB Atlas（云托管）

**架构：** MongoDB Atlas全球分布式 + 双地区应用服务器

**特点：**
- ✅ MongoDB自动全球分布
- ✅ 智能路由到最近节点
- ✅ 自动备份和故障转移
- ✅ 零运维（MongoDB官方托管）
- ⚠️ 成本较高

**适用场景：**
- 规模化生产环境
- 需要全球分布式数据库
- 不想自己运维数据库

**成本：**
- MongoDB Atlas：$57-150/月（M10集群起步）
- 美国服务器：$20-50/月
- 中国服务器：￥100-300/月
- 总计：$100-250/月

---

## ⚙️ 配置说明

### 1. 服务器配置

#### 美国服务器 (us-server)

```bash
# 服务器规格
CPU: 2核
内存: 4GB
带宽: 100Mbps
操作系统: Ubuntu 22.04 LTS

# 推荐云服务商
- AWS EC2 (us-east-1)
- DigitalOcean (New York)
- Vultr (New Jersey)
- Linode (Newark)
```

#### 中国服务器 (cn-server)

```bash
# 服务器规格
CPU: 2核
内存: 4GB
带宽: 5Mbps (中国带宽较贵)
操作系统: Ubuntu 22.04 LTS

# 推荐云服务商
- 阿里云 (华东-上海)
- 腾讯云 (华东-上海)
- 华为云 (华东-上海)
```

---

### 2. 环境变量配置

#### 美国服务器 (.env.us)

```env
# ==================== 地区标识 ====================
REGION=US
SERVER_NAME=us-server

# ==================== 数据库配置 ====================
# 指向中国MongoDB（跨区访问）
MONGODB_URI=mongodb://cn-server.yourapp.com:27017/aiagent
MONGODB_USER=admin
MONGODB_PASSWORD=your_secure_password

# ==================== SSE并发限制 ====================
# 保护美国服务器的本地资源
MAX_SSE_CONNECTIONS=200
MAX_SSE_CONNECTIONS_PER_USER=1

# ==================== LLM配置 ====================
# 使用美国区域的LLM服务
VOLCENGINE_API_URL=https://ark.cn-beijing.volces.com/api/v3
VOLCENGINE_API_KEY=your_api_key
VOLCENGINE_ENDPOINT_ID=your_endpoint_id

# ==================== 应用配置 ====================
PORT=8000
NODE_ENV=production

# ==================== 日志配置 ====================
LOG_LEVEL=info
LOG_REGION=US
```

#### 中国服务器 (.env.cn)

```env
# ==================== 地区标识 ====================
REGION=CN
SERVER_NAME=cn-server

# ==================== 数据库配置 ====================
# 本地MongoDB
MONGODB_URI=mongodb://localhost:27017/aiagent
MONGODB_USER=admin
MONGODB_PASSWORD=your_secure_password

# ==================== SSE并发限制 ====================
# 保护中国服务器的本地资源
MAX_SSE_CONNECTIONS=200
MAX_SSE_CONNECTIONS_PER_USER=1

# ==================== LLM配置 ====================
# 使用中国区域的LLM服务
VOLCENGINE_API_URL=https://ark.cn-beijing.volces.com/api/v3
VOLCENGINE_API_KEY=your_api_key
VOLCENGINE_ENDPOINT_ID=your_endpoint_id

# ==================== 应用配置 ====================
PORT=8000
NODE_ENV=production

# ==================== 日志配置 ====================
LOG_LEVEL=info
LOG_REGION=CN
```

---

### 3. MongoDB配置

#### 中国服务器 (主数据库)

```bash
# 安装MongoDB
sudo apt update
sudo apt install -y mongodb-org

# 配置MongoDB绑定到公网（允许美国服务器访问）
sudo nano /etc/mongod.conf
```

```yaml
# /etc/mongod.conf
net:
  port: 27017
  bindIp: 0.0.0.0  # 允许外部访问（生产环境需配置防火墙）

security:
  authorization: enabled  # 启用认证

replication:
  replSetName: rs0  # 如果使用副本集
```

```bash
# 启动MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod

# 创建管理员用户
mongosh
> use admin
> db.createUser({
    user: "admin",
    pwd: "your_secure_password",
    roles: ["root"]
  })

# 创建应用数据库和用户
> use aiagent
> db.createUser({
    user: "aiagent_user",
    pwd: "your_secure_password",
    roles: [{ role: "readWrite", db: "aiagent" }]
  })
```

#### 创建TTL索引（重要！）

```bash
# 登录MongoDB
mongosh -u admin -p your_secure_password --authenticationDatabase admin

# 切换到应用数据库
use aiagent

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

### 4. 防火墙配置

#### 中国服务器防火墙

```bash
# 允许美国服务器IP访问MongoDB
sudo ufw allow from <美国服务器IP> to any port 27017

# 允许HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# 允许SSH（仅管理员IP）
sudo ufw allow from <管理员IP> to any port 22

# 启用防火墙
sudo ufw enable
```

#### 美国服务器防火墙

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

## 🌐 DNS路由配置

### 方案1：手动DNS（简单）

用户手动选择地区：

```typescript
// 前端代码
const API_ENDPOINTS = {
  US: 'https://us.yourapp.com',
  CN: 'https://cn.yourapp.com',
};

// 用户选择或自动检测
const region = detectUserRegion(); // 'US' or 'CN'
const apiUrl = API_ENDPOINTS[region];
```

### 方案2：GeoDNS（推荐）

使用DNS服务商的地理位置路由：

```plaintext
域名: api.yourapp.com

DNS记录配置（Cloudflare/AWS Route53）:
┌─────────────────────────────────────────────┐
│ api.yourapp.com → GeoDNS路由                 │
│  ├─ 北美洲 → us-server.yourapp.com (美国IP) │
│  └─ 亚洲   → cn-server.yourapp.com (中国IP) │
└─────────────────────────────────────────────┘

用户访问: api.yourapp.com
- 美国用户 → 自动解析到美国服务器IP
- 中国用户 → 自动解析到中国服务器IP
```

**推荐DNS服务商：**

1. **Cloudflare** (推荐)
   - 免费提供GeoDNS
   - 全球CDN加速
   - 配置简单

2. **AWS Route 53**
   - 地理路由策略
   - 健康检查
   - 按查询付费

3. **DNSPod** (中国)
   - 中国境内解析快
   - 支持智能线路

---

## 📊 监控和故障转移

### 1. 健康检查端点

```typescript
// api/lambda/health.ts
export async function get() {
  const region = process.env.REGION || 'UNKNOWN';
  
  // 检查MongoDB连接
  let dbStatus = 'ok';
  try {
    const db = await getDatabase();
    await db.command({ ping: 1 });
  } catch (error) {
    dbStatus = 'error';
  }
  
  // 检查SSE限流器状态
  const sseStats = {
    activeGlobal: getActiveGlobalCount(),
    maxGlobal: getMaxGlobalLimit(),
  };
  
  return {
    status: dbStatus === 'ok' ? 'healthy' : 'unhealthy',
    region,
    timestamp: new Date().toISOString(),
    database: dbStatus,
    sse: sseStats,
  };
}
```

### 2. 监控脚本

```bash
#!/bin/bash
# monitor.sh - 监控两台服务器健康状态

check_server() {
  local url=$1
  local name=$2
  
  response=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url/api/health")
  
  if [ "$response" = "200" ]; then
    echo "✅ $name is healthy"
    return 0
  else
    echo "❌ $name is down (HTTP $response)"
    # 发送告警（邮件/钉钉/Slack）
    send_alert "$name is down"
    return 1
  fi
}

# 检查美国服务器
check_server "https://us.yourapp.com" "US Server"

# 检查中国服务器
check_server "https://cn.yourapp.com" "CN Server"

# 检查跨区连接（美国→中国MongoDB）
check_cross_region_db
```

### 3. 自动故障转移（可选）

```nginx
# Nginx配置 - 自动故障转移
upstream backend {
  # 主服务器（本地）
  server localhost:8000 max_fails=3 fail_timeout=30s;
  
  # 备用服务器（另一个地区）
  server other-region.yourapp.com:8000 backup;
}

server {
  listen 80;
  server_name yourapp.com;
  
  location / {
    proxy_pass http://backend;
    proxy_next_upstream error timeout http_500 http_502 http_503;
  }
}
```

---

## 💰 成本估算

### 方案1：基础方案（月成本）

| 项目 | 美国 | 中国 | 总计 |
|------|------|------|------|
| 服务器 | $30 | ￥200 ($28) | $58 |
| 带宽 | 包含 | ￥50 ($7) | $7 |
| MongoDB | - | 包含 | - |
| CDN/DNS | $0 (Cloudflare免费) | - | $0 |
| **月总计** | - | - | **$65** |
| **年总计** | - | - | **$780** |

### 方案2：MongoDB副本集（月成本）

| 项目 | 美国 | 中国 | 总计 |
|------|------|------|------|
| 服务器 | $50 | ￥300 ($42) | $92 |
| 带宽 | 包含 | ￥100 ($14) | $14 |
| MongoDB副本集 | $30 | ￥200 ($28) | $58 |
| CDN/DNS | $0 | - | $0 |
| **月总计** | - | - | **$164** |
| **年总计** | - | - | **$1,968** |

### 方案3：MongoDB Atlas（月成本）

| 项目 | 成本 |
|------|------|
| MongoDB Atlas M10 | $57 |
| 美国服务器 | $30 |
| 中国服务器 | ￥200 ($28) |
| 带宽 | ￥50 ($7) |
| **月总计** | **$122** |
| **年总计** | **$1,464** |

---

## 🔧 部署步骤

### 步骤1：准备服务器

```bash
# 两台服务器都执行
sudo apt update && sudo apt upgrade -y
sudo apt install -y nodejs npm nginx git
sudo npm install -g pm2
```

### 步骤2：部署中国服务器（含MongoDB）

```bash
# 1. 安装MongoDB
sudo apt install -y mongodb-org

# 2. 配置MongoDB（见上文）
sudo nano /etc/mongod.conf

# 3. 启动MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod

# 4. 克隆代码
git clone https://github.com/yourusername/yourapp.git
cd yourapp

# 5. 安装依赖
npm install

# 6. 配置环境变量
cp .env.cn .env.local
nano .env.local  # 填写实际配置

# 7. 构建项目
npm run build

# 8. 启动应用
pm2 start npm --name "aiagent-cn" -- run start
pm2 save
pm2 startup

# 9. 配置Nginx
sudo nano /etc/nginx/sites-available/aiagent
```

```nginx
# /etc/nginx/sites-available/aiagent
server {
    listen 80;
    server_name cn.yourapp.com;

    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # SSE支持
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }
}
```

```bash
# 启用站点
sudo ln -s /etc/nginx/sites-available/aiagent /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# 配置SSL（推荐）
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d cn.yourapp.com
```

### 步骤3：部署美国服务器

```bash
# 1. 克隆代码
git clone https://github.com/yourusername/yourapp.git
cd yourapp

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.us .env.local
nano .env.local  # 填写实际配置（MongoDB指向中国服务器）

# 4. 测试MongoDB连接
node -e "
const { MongoClient } = require('mongodb');
const client = new MongoClient(process.env.MONGODB_URI);
client.connect().then(() => {
  console.log('✅ MongoDB连接成功');
  client.close();
}).catch(console.error);
"

# 5. 构建和启动（同中国服务器）
npm run build
pm2 start npm --name "aiagent-us" -- run start
pm2 save
pm2 startup

# 6. 配置Nginx（同中国服务器，域名改为us.yourapp.com）
```

### 步骤4：配置DNS

```bash
# Cloudflare DNS配置
A    us.yourapp.com    →  <美国服务器IP>
A    cn.yourapp.com    →  <中国服务器IP>

# GeoDNS配置
CNAME api.yourapp.com  →  北美洲: us.yourapp.com
                          亚洲:   cn.yourapp.com
```

### 步骤5：验证部署

```bash
# 测试美国服务器
curl https://us.yourapp.com/api/health

# 测试中国服务器
curl https://cn.yourapp.com/api/health

# 测试GeoDNS（从不同地区访问）
curl https://api.yourapp.com/api/health
```

---

## 📈 性能监控

### 关键指标

```typescript
// 需要监控的指标
{
  // SSE并发
  "sse_active_connections": 50,
  "sse_max_connections": 200,
  "sse_utilization": "25%",
  
  // MongoDB延迟（美国→中国）
  "mongodb_latency_us_to_cn": "180ms",
  "mongodb_latency_cn_local": "5ms",
  
  // 多Agent状态保存
  "multiagent_save_frequency": "6.7/s",
  "multiagent_active_sessions": 45,
  
  // 服务器资源
  "cpu_usage": "35%",
  "memory_usage": "2.1GB/4GB",
  "disk_usage": "15GB/40GB"
}
```

---

## 🎯 总结

**推荐配置（大多数项目）：**

```plaintext
✅ 方案1：基础方案
  - 成本：$65/月
  - 复杂度：低
  - 适用场景：MVP、小中型项目
  - 用户体验：优秀（美国用户本地SSE，跨区延迟<1%）
```

**扩展路径：**

```plaintext
阶段1: 单服务器（中国） → $30/月
阶段2: 双服务器（美国+中国） → $65/月
阶段3: MongoDB副本集 → $164/月
阶段4: MongoDB Atlas全球分布式 → $122/月
```

---

**文档版本：** v1.0  
**最后更新：** 2024-12  
**负责人：** DevOps Team

