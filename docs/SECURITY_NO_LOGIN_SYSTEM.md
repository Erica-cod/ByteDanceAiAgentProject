# 无登录系统安全方案

## 📋 概述

本文档介绍如何在**无登录系统**中实现完整的安全防护，解决以下问题：

1. ✅ **防止设备 Token 被窃取并冒用**
2. ✅ **保护 localStorage 中的对话数据隐私**
3. ✅ **检测和阻止异常行为**
4. ✅ **在无用户账户的情况下提供安全保障**

---

## 🎯 核心原理

### 问题：无登录系统的安全挑战

```
传统系统：
用户登录 → Session Token → 服务端验证 → API 调用
  ✅ 可以验证用户身份
  ✅ 可以发送邮件/短信通知
  ✅ 可以强制退出所有设备

无登录系统：
设备指纹 → localStorage Token → API 调用
  ❌ 没有用户身份
  ❌ 没有联系方式
  ❌ Token 被窃取后无法通知
```

### 解决方案：设备绑定 + 行为分析

```
┌──────────────────────────────────────────────┐
│ 第1层：数据加密（防窃取）                      │
│ - 对话数据加密存储                             │
│ - Token 加密存储                              │
│ - 设备指纹派生密钥                             │
├──────────────────────────────────────────────┤
│ 第2层：设备绑定（防冒用）                      │
│ - Token 绑定 IP + UA                         │
│ - 设备环境变化自动失效                         │
│ - 跨设备无法使用                              │
├──────────────────────────────────────────────┤
│ 第3层：行为分析（防滥用）                      │
│ - 异常频率检测                                │
│ - 异常时间检测                                │
│ - 风险评分系统                                │
├──────────────────────────────────────────────┤
│ 第4层：自动防御（防攻击）                      │
│ - 速率限制                                    │
│ - 临时封禁                                    │
│ - 告警记录                                    │
└──────────────────────────────────────────────┘
```

---

## 🤔 为什么不使用 HttpOnly Cookie？

很多人会问：**为什么不用 HttpOnly Cookie 来保护 Token？**

### HttpOnly Cookie 的优势

HttpOnly Cookie 是一种非常安全的方案：

```http
Set-Cookie: device_token=abc123; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000
```

**三大安全特性：**

1. **HttpOnly** - JavaScript 无法读取，防止 XSS 攻击窃取
   ```javascript
   // ❌ 攻击失败
   document.cookie;  // 看不到 HttpOnly Cookie
   localStorage;     // 也找不到
   ```

2. **Secure** - 仅通过 HTTPS 传输，防止中间人攻击
   ```
   HTTP 请求 → Cookie 不会发送
   HTTPS 请求 → Cookie 自动携带 ✅
   ```

3. **SameSite** - 限制跨站请求，防止 CSRF 攻击
   ```
   同站请求 → 自动携带 Cookie ✅
   跨站请求 → 不携带 Cookie ❌ (防 CSRF)
   ```

### 为什么我们没有采用？

虽然 HttpOnly Cookie 很安全，但**不适合无登录系统**：

#### ❌ 原因 1：BFF 架构下同源请求

```
我们的架构（BFF）：
├── 前端: https://example.com
└── 后端: https://example.com/api  ← 同一域名

HttpOnly Cookie 的主要价值：
├── 前端: https://frontend.com
└── 后端: https://api.backend.com  ← 跨域场景
    Cookie 自动携带，无需手动管理
```

**我们是同源架构，Cookie 的 "自动携带" 优势不明显。**

#### ❌ 原因 2：需要前端读取 Token

```typescript
// 我们的实现：前端需要操作 Token
const deviceId = await getDeviceToken();  // ← 需要读取

// 验证 IP/UA 是否匹配
if (currentIP !== tokenData.ipHash) {
  refreshToken();  // ← 需要更新
}

// 检查 Token 状态
if (riskScore > 50) {
  regenerateToken();  // ← 需要重新生成
}

// 如果用 HttpOnly Cookie：
❌ 前端完全无法读取
❌ 无法做客户端验证
❌ 无法手动刷新
```

**我们需要在前端进行 Token 验证、刷新和状态检查。**

#### ❌ 原因 3：设备指纹必须在前端生成

```typescript
// 设备指纹生成（必须在浏览器）
const fingerprint = {
  canvas: getCanvasFingerprint(),    // ← Canvas API（浏览器）
  gpu: getGPUInfo(),                 // ← WebGL（浏览器）
  screen: `${screen.width}x${screen.height}`,  // ← 浏览器信息
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

// 生成的 Token 需要：
// 1. 在前端存储和管理
// 2. 定期验证和刷新
// 3. 与 IP/UA 绑定检查
// → 这些都需要前端能读取 Token
```

**设备指纹技术的特点决定了必须在前端生成和管理。**

#### ❌ 原因 4：无登录系统的特殊性

```
传统登录系统：
用户输入账号密码
  ↓
服务端验证 + 生成 Session ID
  ↓
HttpOnly Cookie 存储
  ↓
✅ Session 完全由服务端管理
✅ 前端不需要读取
✅ 可以强制退出所有设备

无登录系统（我们）：
浏览器生成设备指纹
  ↓
前端计算 deviceIdHash
  ↓
前端存储 + 前端管理
  ↓
❌ 没有服务端 Session
❌ Token 由前端生成
❌ 需要前端验证和刷新
```

**无登录系统的 Token 管理逻辑与传统 Session 完全不同。**

### 我们的替代方案

既然不能用 HttpOnly Cookie，我们采用**多层防护**达到同等安全效果：

```typescript
// 1️⃣ 加密存储（类似 HttpOnly 的防窃取效果）
const encrypted = await encryptData(tokenData);
localStorage.setItem('token', JSON.stringify(encrypted));
// → XSS 攻击即使窃取，也无法读取明文

// 2️⃣ 设备绑定（类似 SameSite 的防冒用效果）
{
  deviceIdHash: "abc123",
  ipHash: "ip_xyz",      // IP 变化 → 自动失效
  uaHash: "ua_789",      // 浏览器变化 → 自动失效
}
// → 即使窃取 Token，也无法在其他设备使用

// 3️⃣ 短期有效期（限制窃取价值）
if (Date.now() - lastRefreshedAt > 6 * 3600 * 1000) {
  refreshToken();  // 6 小时后自动刷新
}
// → 窃取的 Token 很快过期

// 4️⃣ 异常检测（主动防御）
if (riskScore > 50) {
  return { valid: false, reason: '异常行为' };
}
// → 检测到异常使用立即阻止
```

### 安全性对比表

| 防护目标 | HttpOnly Cookie | 我们的方案 | 结论 |
|---------|----------------|-----------|------|
| **防 XSS 窃取** | ✅ JS 无法读取 | ✅ 加密存储 | 同等效果 |
| **防 CSRF** | ✅ SameSite | ✅ 同源（无需防护） | 更简单 |
| **防跨设备冒用** | ❌ 无防护 | ✅ IP/UA 绑定 | **我们更强** |
| **异常行为检测** | ❌ 无检测 | ✅ 行为分析 | **我们更强** |
| **前端可操作性** | ❌ 无法读取 | ✅ 可读可验证 | **我们更灵活** |
| **适用场景** | ✅ 传统登录系统 | ✅ 无登录系统 | 各有所长 |

### 结论

**HttpOnly Cookie 非常安全，但不适合我们的场景：**

- ✅ **适合：** 传统登录系统、前后端分离、跨域 API
- ❌ **不适合：** BFF 架构、无登录系统、设备指纹管理

**我们的方案通过 "加密存储 + 设备绑定 + 异常检测" 在无登录场景下提供了同等甚至更强的安全保护。**

---

## 🔐 实施方案

### 1. 对话数据加密

#### 原理

```typescript
// ❌ 之前：明文存储（可被窃取）
localStorage.setItem('chat_cache', JSON.stringify({
  messages: [
    { content: "我的密码是 123456" },  // 严重隐私泄露！
  ]
}));

// ✅ 现在：加密存储（即使窃取也无法读取）
const encrypted = await encryptData(messages);  // 使用设备指纹派生的密钥
localStorage.setItem('chat_cache', JSON.stringify(encrypted));
```

#### 安全特性

1. **设备绑定加密**
   - 密钥从设备指纹派生（Canvas、GPU、屏幕等）
   - 只能在同一设备解密
   - 跨设备数据自动失效

2. **AES-GCM 加密**
   - 业界标准加密算法
   - 256 位密钥强度
   - 认证加密（防篡改）

3. **每次加密使用新 IV**
   - 防止重放攻击
   - 相同数据加密结果不同

#### 使用方式

```typescript
// 替换原有的 conversationCache.ts
import {
  readConversationCache,    // 自动解密
  writeConversationCache,    // 自动加密
} from './utils/secureConversationCache.js';

// API 完全兼容，无需修改调用代码
const messages = await readConversationCache(conversationId);
await writeConversationCache(conversationId, updatedMessages);
```

---

### 2. 设备 Token 安全管理

#### 问题分析

```javascript
// ❌ 之前：Token 明文存储
const token = localStorage.getItem('device_id_hash');  
// 攻击者窃取后可以：
// 1. 在任何地方使用（不受限制）
// 2. 长期有效（30天）
// 3. 冒充用户发送请求
```

#### 改进方案

```typescript
// ✅ 现在：多层防护
{
  deviceIdHash: "abc123...",
  ipHash: "ip_xyz",           // 绑定 IP
  uaHash: "ua_789",           // 绑定 User-Agent
  createdAt: 1234567890,
  lastRefreshedAt: ...,       // 定期刷新
  usageCount: 42,             // 使用统计
  // 整个对象被加密存储
}
```

#### 防护机制

1. **IP 绑定**
   ```javascript
   // IP 变化 → Token 失效
   if (currentIP !== tokenData.ipHash) {
     riskScore += 30;
     if (riskScore > 50) {
       return { valid: false, reason: 'IP地址变化' };
     }
   }
   ```

2. **User-Agent 绑定**
   ```javascript
   // 浏览器指纹变化 → 高风险
   if (currentUA !== tokenData.uaHash) {
     riskScore += 40;  // UA变化是严重信号
   }
   ```

3. **短期刷新**
   ```javascript
   // 每 6 小时刷新一次绑定信息
   if (Date.now() - lastRefreshedAt > 6 * 3600 * 1000) {
     refreshToken();  // 更新 IP/UA
   }
   ```

4. **使用频率监控**
   ```javascript
   // 检测异常高频使用
   if (timeSinceLastUse < 1000 && usageCount > 100) {
     riskScore += 20;
   }
   ```

---

### 3. 后端异常检测（无需登录）

#### 实现方式

由于没有用户账户，我们基于**设备ID**建立行为档案：

```typescript
// 后端：MongoDB 存储设备行为档案
interface DeviceBehaviorProfile {
  deviceIdHash: string;
  
  // 正常行为模式
  normalIPRanges: string[];      // 常用 IP 段
  normalActiveHours: number[];   // 常用时间段（0-23）
  avgRequestInterval: number;    // 平均请求间隔
  avgMessageLength: number;      // 平均消息长度
  
  // 统计信息
  totalRequests: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  
  // 风险信息
  riskScore: number;
  suspiciousEvents: Array<{
    type: string;
    timestamp: Date;
    details: any;
  }>;
}
```

#### 异常检测规则

```typescript
async function detectAnomaly(deviceIdHash: string, request: Request) {
  const profile = await getDeviceProfile(deviceIdHash);
  let riskScore = 0;
  
  // 1️⃣ IP 地理位置检测
  const currentLocation = await getIPLocation(request.ip);
  if (!isInNormalRange(currentLocation, profile.normalIPRanges)) {
    riskScore += 30;  // 异地访问
  }
  
  // 2️⃣ 时间模式检测
  const hour = new Date().getHours();
  if (!profile.normalActiveHours.includes(hour)) {
    riskScore += 15;  // 非常用时间
  }
  
  // 3️⃣ 请求频率检测
  const recentRequests = await getRecentRequests(deviceIdHash, 60000);
  if (recentRequests.length > 20) {
    riskScore += 40;  // 异常高频
  }
  
  // 4️⃣ 内容特征检测
  const messageLength = request.body.message.length;
  if (Math.abs(messageLength - profile.avgMessageLength) > 1000) {
    riskScore += 10;  // 异常内容长度
  }
  
  // 决策
  if (riskScore > 70) {
    return { action: 'block', reason: '高风险行为' };
  } else if (riskScore > 40) {
    return { action: 'challenge', reason: '需要额外验证' };
  } else {
    return { action: 'allow' };
  }
}
```

---

## 📊 完整防护架构

### 前端防护

```typescript
// 1. 设备 Token 管理
import { getDeviceToken } from '@/utils/secureDeviceToken';
const token = await getDeviceToken();  // 自动验证、刷新、风险检测

// 2. 对话数据加密
import { writeConversationCache } from '@/utils/secureConversationCache';
await writeConversationCache(id, messages);  // 自动加密

// 3. 发送请求时携带 Token
fetch('/api/chat', {
  method: 'POST',
  headers: {
    'X-Device-Token': token,
    'X-Request-Time': Date.now(),
  },
  body: JSON.stringify({ message, conversationId }),
});
```

### 后端防护

```typescript
// api/lambda/chat.ts
export async function post({ data, headers }) {
  const deviceToken = headers['x-device-token'];
  const requestTime = headers['x-request-time'];
  
  // 1️⃣ 验证 Token
  const device = await db.findDevice(deviceToken);
  if (!device) {
    return errorResponse('设备未注册');
  }
  
  // 2️⃣ 异常检测
  const anomaly = await detectAnomaly(deviceToken, { data, headers });
  if (anomaly.action === 'block') {
    await logSecurityEvent({
      type: 'blocked_request',
      deviceToken,
      reason: anomaly.reason,
    });
    return errorResponse('请求被拒绝', 403);
  }
  
  // 3️⃣ 速率限制
  if (await isRateLimited(deviceToken)) {
    return tooManyRequests('请求过于频繁，请稍后再试');
  }
  
  // 4️⃣ 更新行为档案
  await updateDeviceProfile(deviceToken, { data, headers });
  
  // 5️⃣ 正常处理请求
  return handleChatRequest(data);
}
```

---

## 🚀 部署步骤

### Step 1: 安装加密模块

```bash
# 无需安装额外依赖，使用浏览器原生 Web Crypto API
```

### Step 2: 替换缓存模块

```typescript
// 修改导入路径
// 之前
import { readConversationCache } from '@/utils/conversationCache';

// 之后
import { readConversationCache } from '@/utils/secureConversationCache';
```

### Step 3: 替换 Token 管理

```typescript
// 之前
import { getPrivacyFirstDeviceId } from '@/utils/privacyFirstFingerprint';
const deviceId = await getPrivacyFirstDeviceId();

// 之后
import { getDeviceToken } from '@/utils/secureDeviceToken';
const deviceId = await getDeviceToken();  // 自动验证和刷新
```

### Step 4: 后端添加异常检测

参考 `api/_clean/application/use-cases/security/` 中的实现（待创建）

---

## ⚠️ 重要注意事项

### 1. 设备环境变化会导致数据无法解密

**场景：**
- 用户更换显卡驱动 → GPU 信息变化
- 用户更换浏览器 → Canvas 指纹变化
- 用户重装系统 → 所有特征变化

**后果：**
- 加密密钥变化
- 无法解密旧的对话数据
- Token 失效

**解决方案：**

```typescript
// 提供数据导出功能（未加密版本）
export async function exportConversationData(conversationId: string) {
  const messages = await readConversationCache(conversationId);
  const json = JSON.stringify(messages, null, 2);
  
  // 下载为 JSON 文件
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `conversation_${conversationId}.json`;
  a.click();
}

// 提供数据导入功能
export async function importConversationData(file: File) {
  const text = await file.text();
  const messages = JSON.parse(text);
  await writeConversationCache(conversationId, messages);
}
```

### 2. 用户隐私说明

**必须向用户说明：**

```
📋 隐私保护说明

1. 数据加密：
   ✅ 您的对话内容已加密存储在本地
   ✅ 只能在当前设备解密
   ✅ 其他人无法读取您的对话历史

2. 设备绑定：
   ✅ 您的设备已注册唯一标识符
   ✅ 用于防止滥用和保护账户安全
   ✅ 更换设备或重装系统需要重新注册

3. 数据备份：
   ⚠️ 请定期导出对话数据备份
   ⚠️ 设备环境变化可能导致数据无法解密

4. 退出方式：
   - 清除浏览器缓存 = 删除所有本地数据
   - 提供"清除所有数据"按钮
```

### 3. 性能影响

**加密/解密性能：**
- 加密 1KB 数据：~2-5ms
- 解密 1KB 数据：~2-5ms
- 500 条消息（~100KB）：~50-100ms

**优化建议：**
```typescript
// 使用 Web Worker 进行加密（不阻塞 UI）
const worker = new Worker('/crypto-worker.js');
worker.postMessage({ action: 'encrypt', data: messages });
worker.onmessage = (e) => {
  localStorage.setItem('cache', e.data);
};
```

---

## 🧪 测试方案

### 测试1：加密功能

```typescript
import { testEncryption } from '@/utils/deviceCrypto';

// 运行测试
await testEncryption();
// 输出：
// ✅ 加密/解密测试通过！
```

### 测试2：跨设备验证

```bash
# 步骤：
1. 设备 A：生成并保存对话数据
2. 复制 localStorage 数据到设备 B
3. 设备 B：尝试读取数据
4. 预期结果：解密失败（设备指纹不同）
```

### 测试3：异常检测

```typescript
// 模拟异常行为
for (let i = 0; i < 100; i++) {
  await fetch('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ message: 'test' }),
  });
}
// 预期：触发速率限制或临时封禁
```

---

## 📈 监控指标

### 关键指标

1. **加密成功率**
   - 目标：> 99.5%
   - 监控：加密/解密失败次数

2. **Token 验证失败率**
   - 目标：< 5%（允许正常的 IP/UA 变化）
   - 监控：Token 验证失败原因分布

3. **异常检测准确率**
   - 目标：假阳性 < 1%
   - 监控：被误判为异常的正常用户比例

4. **性能指标**
   - 加密延迟：p95 < 100ms
   - 解密延迟：p95 < 100ms

---

## ❓ 常见问题

### Q1: 用户更换浏览器后数据会丢失吗？

**A:** 是的。因为加密密钥从设备指纹派生，不同浏览器的指纹不同。

**解决方案：**
- 提供数据导出功能
- 或使用服务端存储（需要用户ID）

### Q2: 如果用户的 IP 是动态的怎么办？

**A:** IP 变化会增加风险分数（+30分），但不会直接阻止。只有当风险分数超过阈值（50分）才会拒绝。

**调整：**
```typescript
// 降低 IP 变化的权重
if (currentIP !== tokenData.ipHash) {
  riskScore += 15;  // 从 30 降低到 15
}
```

### Q3: 加密会影响性能吗？

**A:** 有轻微影响，但可接受：
- 对话切换延迟增加约 50-100ms
- 使用 Web Worker 可进一步优化

### Q4: 可以关闭加密吗？

**A:** 可以，但不推荐：

```typescript
import { setEncryptionEnabled } from '@/utils/secureConversationCache';

// 关闭加密（开发调试时）
setEncryptionEnabled(false);

// 生产环境务必开启
setEncryptionEnabled(true);
```

---

## 🎯 总结

### 核心优势

✅ **无需用户登录** - 基于设备指纹自动管理  
✅ **数据隐私保护** - 加密存储，防止泄露  
✅ **防Token冒用** - IP/UA 绑定，自动失效  
✅ **异常行为检测** - 风险评分，自动防御  
✅ **用户体验友好** - 透明运行，无感知

### Trade-offs

⚠️ **数据可恢复性** - 设备环境变化可能导致无法解密  
⚠️ **跨设备同步** - 数据绑定单一设备，无法跨设备  
⚠️ **性能开销** - 加密/解密有轻微延迟  

### 最佳实践

1. **提供数据导出** - 让用户备份对话数据
2. **清晰的隐私说明** - 告知用户数据加密机制
3. **监控关键指标** - 及时发现问题
4. **定期安全审计** - 评估防护效果

---

**祝部署顺利！如有问题，请查阅相关文档或提交 Issue。** 🚀
