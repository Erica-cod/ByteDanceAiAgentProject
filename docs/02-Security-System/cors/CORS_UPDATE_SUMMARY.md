# CORS 功能更新总结

## 📅 更新日期
2026-01-01

## 🎯 更新目标
为 AI Agent 项目添加完整的 CORS（跨域资源共享）支持，以应对前后端分离部署、API 独立访问等场景。

---

## ✅ 已完成的更新

### 1️⃣ 核心 CORS 模块

#### 新增文件：`api/lambda/_utils/cors.ts`
提供统一的 CORS 处理功能：

- ✅ `getAllowedOrigins()` - 读取环境变量，获取允许的源列表
- ✅ `getCorsHeaders()` - 生成 CORS 响应头
- ✅ `addCorsHeaders()` - 为 Response 对象添加 CORS 头
- ✅ `handleOptionsRequest()` - 处理 OPTIONS 预检请求
- ✅ `createJsonResponse()` - 创建带 CORS 头的 JSON 响应

**特性：**
- 开发环境自动允许所有源（`NODE_ENV=development`）
- 生产环境基于环境变量白名单验证
- 支持多源配置（逗号分隔）
- 自动暴露自定义响应头（`X-Queue-Token` 等）

### 2️⃣ 更新响应工具

#### 更新文件：`api/lambda/_utils/response.ts`

**新增功能：**
- ✅ `successResponse()` - 现在返回带 CORS 头的 Response 对象
- ✅ `errorResponse()` - 现在返回带 CORS 头的 Response 对象
- ✅ `messageResponse()` - 现在返回带 CORS 头的 Response 对象

**保留兼容：**
- ✅ 添加 `*Legacy` 版本的函数，保持向后兼容

### 3️⃣ 更新所有 API 端点

所有 Lambda API 文件都已更新以支持 CORS：

#### ✅ `/api/chat` (`chat.ts`)
- 添加 `options()` 处理预检请求
- 为 JSON 响应添加 CORS 头
- 为 SSE 流式响应添加 CORS 头
- 处理队列限流响应的 CORS 头
- 从请求中提取 `Origin` 头

#### ✅ `/api/conversations` (`conversations.ts`)
- 添加 `options()` 处理预检请求
- `get()` 和 `post()` 方法添加 CORS 支持

#### ✅ `/api/user` (`user.ts`)
- 添加 `options()` 处理预检请求
- `get()` 和 `post()` 方法添加 CORS 支持

#### ✅ `/api/device` (`device.ts`)
- 添加 `options()` 处理预检请求
- `get()`, `post()`, `del()` 方法添加 CORS 支持
- 使用 `createJsonResponse()` 统一响应格式

#### ✅ `/api/health` (`health.ts`)
- 添加 `options()` 处理预检请求
- 健康检查响应添加 CORS 头

### 4️⃣ 文档更新

#### 新增文档：`docs/CORS_CONFIGURATION.md`
完整的 CORS 配置指南，包括：
- CORS 基础概念解释
- 何时需要配置 CORS
- 环境变量配置方法
- Docker 部署配置
- 安全建议
- 常见问题排查
- 测试方法

#### 新增文档：`docs/CORS_UPDATE_SUMMARY.md`（本文档）
记录所有 CORS 相关的更新内容

---

## 🔧 配置方法

### 环境变量

#### 开发环境（默认允许所有源）
```env
NODE_ENV=development
# 自动允许所有源，无需额外配置
```

#### 生产环境（指定白名单）
```env
NODE_ENV=production
CORS_ORIGIN=https://example.com,https://www.example.com,https://m.example.com
```

### Docker 配置

`docker-compose.yml`:
```yaml
services:
  app:
    environment:
      - NODE_ENV=production
      - CORS_ORIGIN=https://example.com,https://cdn.example.com
```

或使用 `.env.production` 文件。

---

## 📊 CORS 功能特性

### 支持的 HTTP 方法
- ✅ GET
- ✅ POST
- ✅ PUT
- ✅ DELETE
- ✅ OPTIONS（预检请求）

### 允许的请求头
- ✅ Content-Type
- ✅ Authorization
- ✅ X-Queue-Token
- ✅ X-Queue-Position
- ✅ X-Queue-Estimated-Wait

### 暴露的响应头
- ✅ X-Queue-Token
- ✅ X-Queue-Position
- ✅ X-Queue-Estimated-Wait
- ✅ Retry-After

### 其他特性
- ✅ 支持携带凭证（Credentials）
- ✅ 缓存预检请求（24小时）
- ✅ 动态 Origin 验证
- ✅ SSE 流式响应支持

---

## 🔒 安全考虑

### 1️⃣ 默认安全策略

- **开发环境：** 允许所有源（方便开发调试）
- **生产环境：** 默认不允许任何跨域（需明确配置）

### 2️⃣ 推荐做法

**✅ 推荐：**
```env
# 明确指定允许的域名
CORS_ORIGIN=https://example.com,https://www.example.com
```

**❌ 不推荐（生产环境）：**
```env
# 允许所有域名（不安全）
CORS_ORIGIN=*
```

### 3️⃣ 白名单验证

- 只有在白名单中的源才会收到 `Access-Control-Allow-Origin` 头
- 未授权的请求会被浏览器阻止
- 支持多个域名配置（逗号分隔）

---

## 🧪 测试验证

### 1️⃣ 手动测试

```bash
# 测试 CORS 头是否存在
curl -I -H "Origin: https://example.com" http://localhost:8080/api/health

# 预期响应头：
# Access-Control-Allow-Origin: https://example.com
# Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
# Access-Control-Allow-Credentials: true
```

### 2️⃣ 浏览器测试

使用不同端口打开前端页面（如 `localhost:3000`），测试 API 调用：

```javascript
fetch('http://localhost:8080/api/health')
  .then(res => res.json())
  .then(data => console.log('成功:', data))
  .catch(err => console.error('CORS 错误:', err));
```

### 3️⃣ OPTIONS 预检测试

```bash
curl -X OPTIONS -H "Origin: https://example.com" \
  -H "Access-Control-Request-Method: POST" \
  http://localhost:8080/api/chat

# 预期响应码：204 No Content
```

---

## 📈 影响范围

### ✅ 无影响的场景（向后兼容）

- **同源部署：** 前后端在同一域名/端口（现有部署方式）
- **Docker 部署：** 使用 `docker-compose.yml` 的默认配置
- **开发环境：** `npm run dev` 启动的本地开发服务器

这些场景下，CORS 功能**自动透明运行**，无需任何配置。

### ✅ 支持的新场景

- **前后端分离部署：** 前端和 API 在不同域名
- **CDN 托管前端：** 前端资源在 CDN，API 在服务器
- **移动端调用：** 原生 App 通过 WebView 调用 API
- **第三方集成：** 其他网站集成你的 API

---

## 🎯 使用建议

### 1️⃣ 默认部署（无需配置）

如果你的部署方式是前后端在同一服务：
- ✅ **无需任何配置**
- ✅ CORS 功能自动工作
- ✅ 不会影响现有功能

### 2️⃣ 分离部署（需要配置）

如果前后端分离部署：

1. **设置环境变量：**
   ```env
   CORS_ORIGIN=https://your-frontend-domain.com
   ```

2. **重启服务：**
   ```bash
   npm run serve
   # 或
   docker-compose restart app
   ```

3. **验证配置：**
   ```bash
   curl -I -H "Origin: https://your-frontend-domain.com" \
     http://your-api-domain.com/api/health
   ```

### 3️⃣ 多域名支持

支持多个前端域名：
```env
CORS_ORIGIN=https://www.example.com,https://m.example.com,https://app.example.com
```

---

## 📝 代码变更清单

### 新增文件
- ✅ `api/lambda/_utils/cors.ts` - CORS 核心模块
- ✅ `docs/CORS_CONFIGURATION.md` - 配置指南
- ✅ `docs/CORS_UPDATE_SUMMARY.md` - 更新总结

### 修改文件
- ✅ `api/lambda/_utils/response.ts` - 响应工具更新
- ✅ `api/lambda/chat.ts` - 聊天 API
- ✅ `api/lambda/conversations.ts` - 对话管理 API
- ✅ `api/lambda/user.ts` - 用户管理 API
- ✅ `api/lambda/device.ts` - 设备追踪 API
- ✅ `api/lambda/health.ts` - 健康检查 API

### 无需修改
- ✅ `modern.config.ts` - Modern.js 配置（保持原样）
- ✅ 其他业务逻辑文件

---

## ✨ 主要改进

1. **统一 CORS 处理**
   - 所有 API 端点统一的 CORS 配置
   - 避免重复代码

2. **灵活配置**
   - 环境变量控制
   - 开发/生产环境自适应

3. **安全可靠**
   - 白名单验证
   - 默认拒绝策略（生产环境）

4. **完全兼容**
   - 不影响现有功能
   - 向后兼容

5. **完善文档**
   - 详细的配置指南
   - 常见问题排查

---

## 🚀 下一步建议

1. **测试验证**
   - 在开发环境测试跨域请求
   - 验证白名单功能

2. **生产配置**
   - 根据实际域名配置 `CORS_ORIGIN`
   - 使用 HTTPS

3. **监控日志**
   - 观察是否有 CORS 相关错误
   - 审查访问来源

4. **定期审查**
   - 定期检查允许的域名列表
   - 移除不再使用的域名

---

## 📚 相关文档

- [CORS 配置指南](./CORS_CONFIGURATION.md)
- [环境变量配置示例](./ENV_CONFIG_EXAMPLES.md)
- [部署指南](../DEPLOYMENT_GUIDE.md)

---

## ❓ 问题反馈

如果遇到 CORS 相关问题：

1. 查阅 `docs/CORS_CONFIGURATION.md` 的常见问题部分
2. 检查环境变量配置
3. 查看服务器日志
4. 提交 GitHub Issue

---

**更新完成！现在你的 AI Agent 项目已全面支持 CORS。** 🎉

