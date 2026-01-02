# 🚀 10-Deployment（部署运维）

## 📌 模块简介

本文件夹包含了全球化部署、环境配置、CI/CD 流程的完整方案。如何将项目部署到生产环境？如何管理多环境配置？

## 📚 核心文档

### 1. GLOBAL_DEPLOYMENT_GUIDE.md（18KB）⭐
**全球化部署指南**

**部署架构：**
```
                    Internet
                       ↓
              [Load Balancer]
                       ↓
        ┌──────────────┼──────────────┐
        ↓              ↓               ↓
   [Web Server 1] [Web Server 2] [Web Server 3]
        ↓              ↓               ↓
   [API Service]  [API Service]  [API Service]
        └──────────────┼───────────────┘
                       ↓
              [Redis Cluster]
                       ↓
            [PostgreSQL Master]
                       ↓
            [PostgreSQL Slaves]
```

**部署步骤：**

#### 1. 环境准备
```bash
# 安装 Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# 安装 Redis
apt-get install -y redis-server

# 安装 PostgreSQL
apt-get install -y postgresql postgresql-contrib

# 安装 Nginx
apt-get install -y nginx
```

#### 2. 构建应用
```bash
# 安装依赖
npm ci

# 构建前端
npm run build:client

# 构建后端
npm run build:server

# 生成产物
dist/
  ├── client/      # 前端静态文件
  └── server/      # 后端 JS 文件
```

#### 3. 配置 Nginx
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    
    # 重定向到 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;
    
    # SSL 证书
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    # 前端静态文件
    location / {
        root /var/www/app/client;
        try_files $uri $uri/ /index.html;
        
        # 缓存策略
        location ~* \.(js|css|png|jpg|jpeg|gif|ico)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
    
    # API 代理
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        
        # WebSocket / SSE 支持
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # 超时设置
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
        
        # 请求头
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### 4. PM2 进程管理
```javascript
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'ai-agent-api',
      script: './dist/server/index.js',
      instances: 4,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      max_memory_restart: '1G'
    }
  ]
};
```

```bash
# 启动应用
pm2 start ecosystem.config.js

# 查看状态
pm2 status

# 查看日志
pm2 logs ai-agent-api

# 重启
pm2 restart ai-agent-api

# 停止
pm2 stop ai-agent-api
```

#### 5. Docker 部署
```dockerfile
# Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:18-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

EXPOSE 3000

CMD ["node", "dist/server/index.js"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - REDIS_HOST=redis
      - DB_HOST=postgres
    depends_on:
      - redis
      - postgres
    restart: unless-stopped
    
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped
    
  postgres:
    image: postgres:15-alpine
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_DB=aiagent
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  redis_data:
  postgres_data:
```

```bash
# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

#### 6. 健康检查
```typescript
// health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    services: {
      redis: await checkRedis(),
      postgres: await checkPostgres(),
      llm: await checkLLM()
    }
  });
});
```

#### 7. 监控告警
```typescript
// 性能监控
import { register, collectDefaultMetrics } from 'prom-client';

collectDefaultMetrics();

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// 错误追踪
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1
});
```

### 2. ENV_CONFIG_EXAMPLES.md（11KB）⭐
**环境配置示例**

**环境变量管理：**

```bash
# .env.example
# ========== 应用配置 ==========
NODE_ENV=production
PORT=3000
APP_URL=https://yourdomain.com

# ========== 数据库配置 ==========
DB_HOST=localhost
DB_PORT=5432
DB_NAME=aiagent
DB_USER=user
DB_PASSWORD=password

# ========== Redis 配置 ==========
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# ========== LLM 配置 ==========
VOLC_API_KEY=your_volcengine_api_key
VOLC_MODEL=doubao-pro-32k

# ========== 搜索配置 ==========
TAVILY_API_KEY=your_tavily_api_key

# ========== 安全配置 ==========
JWT_SECRET=your_jwt_secret_key_change_in_production
CORS_ORIGIN=https://yourdomain.com

# ========== 监控配置 ==========
SENTRY_DSN=your_sentry_dsn
```

**多环境配置：**

```typescript
// config/index.ts
const config = {
  development: {
    api: 'http://localhost:3000',
    debug: true,
    logLevel: 'debug'
  },
  
  staging: {
    api: 'https://staging.yourdomain.com',
    debug: true,
    logLevel: 'info'
  },
  
  production: {
    api: 'https://yourdomain.com',
    debug: false,
    logLevel: 'error'
  }
};

export default config[process.env.NODE_ENV || 'development'];
```

**配置验证：**

```typescript
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']),
  PORT: z.string().transform(Number),
  DB_HOST: z.string(),
  DB_PORT: z.string().transform(Number),
  REDIS_HOST: z.string(),
  VOLC_API_KEY: z.string().min(1, 'VOLC_API_KEY is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters')
});

const env = envSchema.parse(process.env);
```

## 🎯 关键技术点

### CI/CD 流程

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run tests
        run: npm test
        
      - name: Build
        run: npm run build
        
      - name: Deploy to server
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_KEY }}
          script: |
            cd /var/www/app
            git pull origin main
            npm ci
            npm run build
            pm2 reload all
```

### 零停机部署

```bash
# 使用 PM2 的 cluster 模式
pm2 reload all

# 使用蓝绿部署
# 1. 部署新版本到备用服务器
# 2. 测试新版本
# 3. 切换 Load Balancer 到新版本
# 4. 保留旧版本作为备份
```

### 数据库迁移

```bash
# 使用 Prisma Migrate
npx prisma migrate deploy

# 或使用自定义脚本
node scripts/migrate.js
```

## 💡 面试要点

### 1. 部署架构选择
**问题：如何设计部署架构？**
- **单机部署**：适合小流量
- **多机部署 + Load Balancer**：高可用
- **容器化 + K8s**：大规模、自动扩缩容
- **Serverless**：按需付费、自动扩展

### 2. 如何保证高可用？
- **多副本**：至少 2 个实例
- **负载均衡**：分散流量
- **健康检查**：自动摘除故障节点
- **自动恢复**：PM2 / K8s 自动重启
- **数据备份**：定期备份数据库

### 3. 环境配置管理
**问题：如何管理不同环境的配置？**
- **环境变量**：使用 .env 文件
- **配置中心**：Consul、etcd
- **密钥管理**：AWS Secrets Manager
- **版本控制**：配置变更可追溯

### 4. 监控告警
**问题：如何监控生产环境？**
- **性能监控**：Prometheus + Grafana
- **日志收集**：ELK Stack
- **错误追踪**：Sentry
- **告警通知**：企业微信、钉钉

### 5. 安全最佳实践
- **HTTPS**：强制 HTTPS
- **防火墙**：限制入站端口
- **定期更新**：及时修复漏洞
- **最小权限**：应用不用 root 运行
- **密钥轮换**：定期更换密钥

## 🔗 相关模块

- **02-Security-System**：CORS 和安全配置
- **08-Data-Management**：数据库和 Redis 配置

## 📊 部署效果

### 性能指标
- ⚡ 响应时间 < 200ms (P95)
- ⚡ 并发支持 1000+ QPS
- ⚡ 可用性 99.9%

### 运维效率
- ✅ CI/CD 自动化部署
- ✅ 零停机更新
- ✅ 5 分钟内回滚
- ✅ 完整的监控告警

---

**建议阅读顺序：**
1. `GLOBAL_DEPLOYMENT_GUIDE.md` - 部署步骤
2. `ENV_CONFIG_EXAMPLES.md` - 配置管理

**相关文档：**
- 项目根目录的 `DEPLOYMENT_GUIDE.md`
- 项目根目录的 `DOCKER_DEPLOYMENT.md`

