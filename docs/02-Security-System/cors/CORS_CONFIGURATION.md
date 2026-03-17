# CORS 配置指南

## 📌 什么是 CORS？

CORS（Cross-Origin Resource Sharing，跨域资源共享）是一种浏览器安全机制，用于控制网页从一个域向另一个域发起请求。

当前端和后端运行在**不同的域名或端口**时，浏览器会阻止请求，除非后端明确允许跨域访问。

---

## 🔍 你的项目是否需要配置 CORS？

### ✅ **不需要配置（BFF 一体化架构）**

如果你使用 **BFF（Backend for Frontend）架构**部署：
- **前端和后端在同一个服务上**（推荐）
- 使用 Docker 部署，前后端都在 `localhost:8080`
- 使用 Modern.js 的开发服务器 `npm run dev`（前后端同端口）

**这些情况下不会出现 CORS 问题**，因为前端使用相对路径 `/api/...` 调用 API，属于同源请求。

**关于 BFF 架构：**
- BFF 是一种将前后端集成在同一项目的架构模式
- 类似框架：Next.js、Nuxt.js、SvelteKit、Remix 等
- 天然避免 CORS 问题（同源请求）
- Modern.js 的 BFF 特色：函数式 Lambda 路由 + 类型安全 + Rust 构建

### ⚠️ **需要配置的场景**

以下情况需要配置 CORS：

1. **前后端分离部署**
   - 前端：`https://example.com`
   - 后端：`https://api.example.com`

2. **使用 CDN 托管前端**
   - 前端：`https://cdn.example.com`
   - 后端：`https://example.com`

3. **开发环境分离运行**
   - 前端：`localhost:3000`
   - 后端：`localhost:8080`

4. **移动端或第三方应用调用 API**
   - 原生 App 通过 WebView 调用
   - 第三方网站集成你的 API

---

## 🛠️ CORS 配置方法

### 1️⃣ 环境变量配置

项目已集成 CORS 支持，只需配置环境变量：

#### **开发环境（允许所有源）**

`.env` 或 `.env.development`:
```env
# 开发环境：允许所有源（默认）
# NODE_ENV=development 时自动启用
```

#### **生产环境（指定允许的源）**

`.env.production`:
```env
# 生产环境：指定允许的源（推荐）
CORS_ORIGIN=https://example.com,https://www.example.com,https://m.example.com

# 或者允许所有源（不推荐）
# CORS_ORIGIN=*
```

### 2️⃣ Docker 部署配置

`docker-compose.yml`:
```yaml
services:
  app:
    environment:
      - CORS_ORIGIN=https://example.com,https://cdn.example.com
```

或使用 `.env.production` 文件（推荐）：
```yaml
services:
  app:
    env_file:
      - .env.production
```

### 3️⃣ 验证配置

启动服务后，检查响应头：

```bash
# 测试 API 是否返回 CORS 头
curl -I -H "Origin: https://example.com" http://localhost:8080/api/health
```

应该看到以下响应头：
```
Access-Control-Allow-Origin: https://example.com
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-Queue-Token
Access-Control-Allow-Credentials: true
```

---

## 🎯 CORS 功能说明

### 已支持的功能

✅ **动态 Origin 检查**
- 根据环境变量动态验证请求来源
- 开发环境自动允许所有源
- 生产环境可配置白名单

✅ **预检请求处理**
- 自动处理 OPTIONS 请求
- 返回正确的 CORS 响应头

✅ **自定义响应头暴露**
- 允许前端读取自定义头：`X-Queue-Token`, `X-Queue-Position`, `Retry-After`

✅ **凭证支持**
- 允许携带 Cookie 和认证信息

✅ **SSE 流式响应支持**
- 聊天流式响应也包含 CORS 头

### 受保护的 API 端点

所有 API 端点都已添加 CORS 支持：

- ✅ `/api/chat` - 聊天接口
- ✅ `/api/conversations` - 对话管理
- ✅ `/api/user` - 用户管理
- ✅ `/api/device` - 设备追踪
- ✅ `/api/health` - 健康检查
- ✅ `/api/upload/*` - 文件上传
- ✅ 其他所有 API 端点

---

## 🔒 安全建议

### 1️⃣ 生产环境配置

**❌ 不推荐（不安全）：**
```env
CORS_ORIGIN=*  # 允许任何域名访问
```

**✅ 推荐（安全）：**
```env
CORS_ORIGIN=https://example.com,https://www.example.com
```

### 2️⃣ 配置原则

1. **最小权限原则**
   - 只允许必要的域名
   - 避免使用通配符 `*`

2. **使用 HTTPS**
   - 生产环境务必使用 HTTPS
   - 避免混合内容问题

3. **验证来源**
   - 定期审查允许的域名列表
   - 及时移除不再使用的域名

4. **测试覆盖**
   - 测试预期的域名能正常访问
   - 测试未授权的域名被正确拦截

### 3️⃣ 多环境配置示例

```env
# 开发环境 (.env.development)
NODE_ENV=development
# 自动允许所有源

# 测试环境 (.env.test)
NODE_ENV=production
CORS_ORIGIN=https://test.example.com

# 预生产环境 (.env.staging)
NODE_ENV=production
CORS_ORIGIN=https://staging.example.com

# 生产环境 (.env.production)
NODE_ENV=production
CORS_ORIGIN=https://example.com,https://www.example.com,https://m.example.com
```

---

## 🐛 常见问题排查

### 问题 1: 浏览器报 CORS 错误

**错误信息：**
```
Access to fetch at 'http://localhost:8080/api/chat' from origin 'http://localhost:3000' 
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present.
```

**解决方案：**
1. 检查环境变量是否配置
2. 确认服务已重启（环境变量修改后需要重启）
3. 验证 Origin 是否在白名单中

### 问题 2: OPTIONS 请求失败

**现象：**
浏览器发送 OPTIONS 预检请求，但收到 404 或 405 错误

**解决方案：**
确认 API 文件已导出 `options` 函数（项目已自动处理）

### 问题 3: 自定义响应头无法读取

**现象：**
前端无法读取 `X-Queue-Token` 等自定义头

**解决方案：**
检查响应是否包含 `Access-Control-Expose-Headers`（项目已自动处理）

### 问题 4: 携带 Cookie 失败

**现象：**
请求无法携带认证 Cookie

**解决方案：**
1. 确保响应包含 `Access-Control-Allow-Credentials: true`（项目已处理）
2. 前端请求需设置 `credentials: 'include'`：
   ```javascript
   fetch('/api/chat', {
     method: 'POST',
     credentials: 'include',  // 关键设置
     body: JSON.stringify(data)
   })
   ```

---

## 📊 测试 CORS 配置

### 测试脚本

创建 `test-cors.html` 文件：

```html
<!DOCTYPE html>
<html>
<head>
  <title>CORS 测试</title>
</head>
<body>
  <h1>CORS 配置测试</h1>
  <button onclick="testCORS()">测试 API</button>
  <pre id="result"></pre>

  <script>
    async function testCORS() {
      const result = document.getElementById('result');
      
      try {
        const response = await fetch('http://localhost:8080/api/health', {
          method: 'GET',
          credentials: 'include'
        });
        
        const data = await response.json();
        result.textContent = JSON.stringify(data, null, 2);
        
        console.log('CORS 头:', {
          'Access-Control-Allow-Origin': response.headers.get('Access-Control-Allow-Origin'),
          'Access-Control-Allow-Credentials': response.headers.get('Access-Control-Allow-Credentials')
        });
      } catch (error) {
        result.textContent = '错误: ' + error.message;
      }
    }
  </script>
</body>
</html>
```

在不同的端口打开此文件（如 `localhost:3000`），点击按钮测试。

---

## 📚 相关资源

- [MDN - CORS 文档](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/CORS)
- [Modern.js BFF 文档](https://modernjs.dev/guides/advanced-features/bff.html)
- 项目文档：`docs/ENV_CONFIG_EXAMPLES.md`

---

## 🎉 总结

1. **默认部署无需配置** - 前后端同服务不会有 CORS 问题
2. **分离部署需配置** - 设置 `CORS_ORIGIN` 环境变量
3. **安全第一** - 生产环境明确指定允许的域名
4. **已全面支持** - 所有 API 端点都已集成 CORS

**如有问题，请参考本文档或提交 Issue。**

