# 🔐 02-Security-System（安全系统）

## 📌 模块简介

本文件夹包含了无登录系统的完整安全架构设计。在没有传统用户登录系统的情况下，如何保护用户数据、确保对话隐私、防止数据泄露？这是本模块要解决的核心问题。

## 📚 核心文档

### 1. SECURITY_NO_LOGIN_SYSTEM.md（20KB）⭐⭐
**无登录安全系统完整方案**

这是本模块的**核心文档**，详细记录了整个安全系统的设计思路。

**包含内容：**
- 🎯 **问题场景**：为什么需要无登录系统？
- 🔍 **解决方案分析**：对比了多种方案
- 🛠️ **技术选型**：最终选择的技术栈
- 💻 **完整实现**：包含所有代码示例

**核心技术：**
1. **设备指纹识别**（Device Fingerprint）
   - Canvas 指纹
   - WebGL 指纹
   - 浏览器特征
   - 硬件信息
   - 组合哈希生成唯一 ID

2. **加密对话缓存**
   - 对话数据本地加密存储
   - 基于设备密钥的加密
   - IndexedDB 安全存储
   - 自动过期清理

3. **无状态 Token 机制**
   - JWT Token 的使用
   - Token 的生成和验证
   - 防止 Token 伪造

4. **数据隔离**
   - 不同设备的数据完全隔离
   - 服务端不存储明文对话
   - 定期清理过期数据

### 2. CORS_CONFIGURATION.md（8KB）
**CORS 跨域配置指南**

**包含内容：**
- CORS 的基本原理
- 为什么需要配置 CORS？
- 生产环境的 CORS 配置
- 常见 CORS 错误的解决

**配置要点：**
```typescript
// CORS 配置示例
{
  origin: process.env.ALLOWED_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}
```

**安全考量：**
- ✅ 限制允许的域名
- ✅ 不使用 `*` 通配符
- ✅ 启用 credentials 传递 Cookie
- ✅ 限制允许的 HTTP 方法

### 3. CORS_UPDATE_SUMMARY.md（9KB）
**CORS 配置更新总结**

**包含内容：**
- CORS 配置的演进历程
- 遇到的问题和解决方案
- 多环境配置的管理
- Preflight 请求的优化

**更新历程：**
1. **第一版**：允许所有域名（开发阶段）
2. **第二版**：限制特定域名（测试阶段）
3. **第三版**：环境变量配置（生产阶段）
4. **最终版**：动态域名验证（当前版本）

### 4. SSO_OAUTH2_BFF_DESIGN.md（新增）⭐⭐
**基于 OAuth2/OIDC + Modern.js BFF 的 SSO 登录体系设计**

用于把当前“弱登录 + 设备防刷”升级为标准 SSO 登录体系，重点覆盖：
- ✅ OIDC 授权码 + PKCE 标准流程
- ✅ BFF 同源 Cookie Session（前端不落地敏感 Token）
- ✅ state/nonce/CSRF/Cookie 安全细节
- ✅ 与现有 `deviceIdHash` 风控信号融合、匿名数据迁移思路

## 🎯 关键技术点

### 设备指纹技术

#### 工作原理
```typescript
// 生成设备指纹
const fingerprint = await generateFingerprint({
  canvas: getCanvasFingerprint(),
  webgl: getWebGLFingerprint(),
  browser: getBrowserInfo(),
  hardware: getHardwareInfo(),
  timezone: getTimezone()
});

// 生成稳定的设备 ID
const deviceId = hashFingerprint(fingerprint);
```

#### 特点
- ✅ **稳定性**：同一设备生成相同 ID
- ✅ **唯一性**：不同设备 ID 不同
- ✅ **隐私性**：不收集个人信息
- ⚠️ **限制**：隐私模式下可能变化

### 加密存储

#### 加密流程
```typescript
// 1. 生成设备密钥
const deviceKey = await generateDeviceKey(deviceId);

// 2. 加密对话数据
const encrypted = await encrypt(conversationData, deviceKey);

// 3. 存储到 IndexedDB
await saveToIndexedDB(conversationId, encrypted);

// 4. 读取时解密
const decrypted = await decrypt(encrypted, deviceKey);
```

#### 安全特性
- 🔒 **AES-256 加密**：行业标准加密算法
- 🔑 **设备唯一密钥**：每个设备有独立密钥
- 💾 **本地存储**：数据不上传到服务器
- ⏰ **自动过期**：超过 30 天自动删除

### Token 机制

#### Token 生成
```typescript
// 生成包含设备信息的 Token
const token = jwt.sign(
  {
    deviceId,
    conversationId,
    timestamp: Date.now()
  },
  SECRET_KEY,
  { expiresIn: '7d' }
);
```

#### 验证流程
1. **客户端**：携带 Token 发起请求
2. **服务端**：验证 Token 签名和有效期
3. **服务端**：检查设备 ID 是否匹配
4. **服务端**：返回响应或拒绝访问

## 💡 面试要点

### 1. 无登录系统的挑战
**问题：为什么不使用传统的登录系统？**
- **用户体验**：无需注册即可使用，降低门槛
- **隐私保护**：不收集用户个人信息
- **快速上手**：打开即用，提升转化率
- **合规性**：符合隐私保护法规

**问题：无登录系统面临哪些安全挑战？**
- **身份识别**：如何识别不同的用户？
- **数据隔离**：如何防止数据串用？
- **防止伪造**：如何防止身份伪造？
- **对话保护**：如何保护对话隐私？

### 2. 设备指纹技术
**问题：设备指纹是如何工作的？**
- **多维度特征**：Canvas、WebGL、浏览器、硬件信息
- **组合哈希**：将所有特征组合后生成唯一 ID
- **稳定性保证**：即使部分特征变化，ID 仍然稳定
- **隐私保护**：不收集可识别个人身份的信息

**问题：设备指纹的局限性是什么？**
- ⚠️ **隐私模式**：每次打开生成新 ID
- ⚠️ **清除缓存**：可能导致 ID 变化
- ⚠️ **浏览器更新**：某些特征可能改变
- ✅ **解决方案**：配合 LocalStorage 做备份

### 3. 数据加密
**问题：为什么要在客户端加密？**
- **隐私保护**：服务端看不到明文内容
- **数据安全**：即使数据库泄露也无法解密
- **用户信任**：增强用户对隐私保护的信心
- **合规要求**：符合数据保护法规

**问题：加密的具体实现是什么？**
```typescript
// 1. 设备密钥生成
const deviceKey = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', hash: 'SHA-256' },
  baseKey,
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt', 'decrypt']
);

// 2. AES-GCM 加密
const encrypted = await crypto.subtle.encrypt(
  { name: 'AES-GCM', iv },
  deviceKey,
  data
);
```

### 4. CORS 安全
**问题：CORS 是什么？为什么需要配置？**
- **定义**：跨域资源共享（Cross-Origin Resource Sharing）
- **作用**：浏览器的安全机制，防止恶意网站访问 API
- **配置**：服务器需要明确允许哪些域名可以访问
- **安全**：防止 CSRF 攻击

**问题：如何正确配置 CORS？**
- ✅ **生产环境**：只允许特定域名
- ✅ **Credentials**：需要传递 Cookie 时启用
- ✅ **Methods**：只允许需要的 HTTP 方法
- ❌ **避免 `*`**：不要在生产环境使用通配符

### 5. 安全性保障
**问题：如何防止数据泄露？**
1. **传输安全**：HTTPS 加密传输
2. **存储安全**：客户端加密存储
3. **访问控制**：Token 验证
4. **数据隔离**：设备 ID 隔离
5. **定期清理**：过期数据自动删除

**问题：如何防止身份伪造？**
1. **设备指纹**：多维度特征难以伪造
2. **Token 签名**：JWT 签名防止篡改
3. **时间戳**：防止重放攻击
4. **IP 检查**：异常 IP 触发警告

## 🔗 相关模块

- **03-Streaming**：流式传输也需要 Token 验证
- **08-Data-Management**：缓存策略的安全考量
- **10-Deployment**：生产环境的安全配置

## 📊 实现效果

### 安全性提升
- ✅ **零明文存储**：服务端不存储明文对话
- ✅ **设备隔离**：不同设备数据完全隔离
- ✅ **加密传输**：HTTPS + 加密存储双重保护

### 用户体验
- ✅ **无需注册**：打开即用
- ✅ **自动保存**：对话自动保存到本地
- ✅ **跨会话**：关闭浏览器后对话仍在
- ⚠️ **单设备**：更换设备需要重新开始

### 合规性
- ✅ **GDPR 合规**：不收集个人身份信息
- ✅ **隐私保护**：用户完全控制自己的数据
- ✅ **数据主权**：数据存储在用户设备

---

**建议阅读顺序：**
1. `SECURITY_NO_LOGIN_SYSTEM.md` - 理解完整的安全方案
2. `CORS_CONFIGURATION.md` - 学习 CORS 配置
3. `CORS_UPDATE_SUMMARY.md` - 了解配置演进

**相关代码文件：**
- `src/utils/deviceCrypto.ts` - 加密工具
- `src/utils/secureConversationCache.ts` - 安全缓存
- `src/utils/privacyFirstFingerprint.ts` - 设备指纹

