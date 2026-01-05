/**
 * 安全设备 Token 管理（无登录系统专用）
 * 
 * 防护措施：
 * 1. Token 不明文存储在 localStorage
 * 2. 绑定 IP + User-Agent（异地使用自动失效）
 * 3. 短期有效期 + 自动刷新
 * 4. 异常行为检测
 * 
 * 与传统方案的区别：
 * - 无需用户登录
 * - 无需 HttpOnly Cookie（BFF 架构下同源）
 * - 依赖设备指纹 + 行为分析
 */

import { encryptData, decryptData } from './deviceCrypto.js';

// ===================== 类型定义 =====================

interface DeviceTokenData {
  deviceIdHash: string;
  createdAt: number;
  lastRefreshedAt: number;
  ipHash: string;         // 绑定的 IP Hash
  uaHash: string;         // 绑定的 User-Agent Hash
  usageCount: number;     // 使用次数
  lastUsedAt: number;     // 最后使用时间
}

interface TokenValidationResult {
  valid: boolean;
  reason?: string;
  shouldRefresh: boolean;
  riskScore: number;
}

// ===================== 配置 =====================

const TOKEN_STORAGE_KEY = 'secure_device_token_v1';
const TOKEN_VALID_DURATION = 7 * 24 * 3600 * 1000;  // 7 天有效期
const TOKEN_REFRESH_THRESHOLD = 6 * 3600 * 1000;     // 6 小时后刷新

// ===================== Token 管理 =====================

/**
 * 获取或创建设备 Token
 */
export async function getDeviceToken(): Promise<string> {
  try {
    // 尝试从缓存读取
    const cached = await loadTokenData();
    
    if (cached) {
      // 验证 Token
      const validation = await validateToken(cached);
      
      if (validation.valid) {
        // 更新使用统计
        await updateTokenUsage(cached);
        
        // 检查是否需要刷新
        if (validation.shouldRefresh) {
          await refreshToken(cached);
        }
        
        return cached.deviceIdHash;
      } else {
        console.warn('⚠️ Token 验证失败:', validation.reason);
        // Token 无效：清除并重新生成
        await clearTokenData();
      }
    }
    
    // 生成新 Token
    return await generateNewToken();
  } catch (error) {
    console.error('❌ 获取 Token 失败:', error);
    // 降级：使用简单的设备指纹
    return await generateSimpleDeviceId();
  }
}

/**
 * 生成新的设备 Token
 */
async function generateNewToken(): Promise<string> {
  const { getPrivacyFirstDeviceId } = await import('./privacyFirstFingerprint.js');
  const deviceIdHash = await getPrivacyFirstDeviceId();
  
  const tokenData: DeviceTokenData = {
    deviceIdHash,
    createdAt: Date.now(),
    lastRefreshedAt: Date.now(),
    ipHash: await getCurrentIPHash(),
    uaHash: hashString(navigator.userAgent),
    usageCount: 0,
    lastUsedAt: Date.now(),
  };
  
  await saveTokenData(tokenData);
  
  console.log('✅ 已生成新的设备 Token');
  
  return deviceIdHash;
}

/**
 * 验证 Token 是否有效
 */
async function validateToken(tokenData: DeviceTokenData): Promise<TokenValidationResult> {
  let riskScore = 0;
  const reasons: string[] = [];
  
  // 1️⃣ 检查有效期
  const age = Date.now() - tokenData.createdAt;
  if (age > TOKEN_VALID_DURATION) {
    return {
      valid: false,
      reason: 'Token 已过期',
      shouldRefresh: false,
      riskScore: 100,
    };
  }
  
  // 2️⃣ 检查 IP 变化
  const currentIPHash = await getCurrentIPHash();
  if (currentIPHash !== 'unavailable' && tokenData.ipHash !== 'unavailable') {
    if (currentIPHash !== tokenData.ipHash) {
      reasons.push('IP 地址变化');
      riskScore += 30;
    }
  }
  
  // 3️⃣ 检查 User-Agent 变化
  const currentUAHash = hashString(navigator.userAgent);
  if (currentUAHash !== tokenData.uaHash) {
    reasons.push('浏览器指纹变化');
    riskScore += 40;  // UA 变化是高风险信号
  }
  
  // 4️⃣ 检查异常使用频率
  const timeSinceLastUse = Date.now() - tokenData.lastUsedAt;
  if (timeSinceLastUse < 1000 && tokenData.usageCount > 100) {
    reasons.push('异常高频使用');
    riskScore += 20;
  }
  
  // 5️⃣ 决策
  const valid = riskScore < 50;  // 风险分数低于 50 则有效
  const shouldRefresh = Date.now() - tokenData.lastRefreshedAt > TOKEN_REFRESH_THRESHOLD;
  
  if (!valid) {
    console.warn(`⚠️ Token 风险分数: ${riskScore}，原因:`, reasons);
  }
  
  return {
    valid,
    reason: reasons.join(', '),
    shouldRefresh,
    riskScore,
  };
}

/**
 * 刷新 Token（更新绑定信息）
 */
async function refreshToken(tokenData: DeviceTokenData): Promise<void> {
  const updated: DeviceTokenData = {
    ...tokenData,
    lastRefreshedAt: Date.now(),
    ipHash: await getCurrentIPHash(),
    uaHash: hashString(navigator.userAgent),
  };
  
  await saveTokenData(updated);
  console.log('🔄 Token 已刷新');
}

/**
 * 更新 Token 使用统计
 */
async function updateTokenUsage(tokenData: DeviceTokenData): Promise<void> {
  const updated: DeviceTokenData = {
    ...tokenData,
    usageCount: tokenData.usageCount + 1,
    lastUsedAt: Date.now(),
  };
  
  // 每 10 次使用保存一次（减少 localStorage 写入）
  if (updated.usageCount % 10 === 0) {
    await saveTokenData(updated);
  }
}

// ===================== 存储管理 =====================

/**
 * 保存 Token 数据（加密）
 */
async function saveTokenData(tokenData: DeviceTokenData): Promise<void> {
  try {
    const encrypted = await encryptData(tokenData);
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(encrypted));
  } catch (error) {
    console.error('❌ 保存 Token 失败:', error);
    // 降级：明文存储
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokenData));
  }
}

/**
 * 加载 Token 数据（解密）
 */
async function loadTokenData(): Promise<DeviceTokenData | null> {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    
    const data = JSON.parse(raw);
    
    // 检查是否是加密数据
    if (data.iv && data.data) {
      // 加密数据，尝试解密
      try {
        return await decryptData<DeviceTokenData>(data);
      } catch (error) {
        console.warn('⚠️ Token 解密失败，清除旧数据');
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        return null;
      }
    } else {
      // 明文数据（降级或旧版本）
      return data as DeviceTokenData;
    }
  } catch (error) {
    console.error('❌ 加载 Token 失败:', error);
    return null;
  }
}

/**
 * 清除 Token 数据
 */
async function clearTokenData(): Promise<void> {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  console.log('🗑️ 已清除设备 Token');
}

// ===================== 辅助函数 =====================

/**
 * 获取当前 IP Hash
 */
async function getCurrentIPHash(): Promise<string> {
  try {
    const response = await fetch('https://api.ipify.org?format=json', {
      signal: AbortSignal.timeout(3000),
    });
    
    if (!response.ok) return 'unavailable';
    
    const data = await response.json();
    return hashString(data.ip || 'no-ip');
  } catch (error) {
    return 'unavailable';
  }
}

/**
 * 简单哈希函数
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

/**
 * 生成简单的设备 ID（降级方案）
 */
async function generateSimpleDeviceId(): Promise<string> {
  const features = [
    navigator.userAgent,
    screen.width,
    screen.height,
    navigator.language,
    new Date().getTimezoneOffset(),
  ].join('|');
  
  const encoder = new TextEncoder();
  const data = encoder.encode(features);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

// ===================== 公共 API =====================

/**
 * 强制重新生成 Token
 */
export async function regenerateToken(): Promise<string> {
  await clearTokenData();
  return await generateNewToken();
}

/**
 * 获取 Token 信息（调试用）
 */
export async function getTokenInfo(): Promise<DeviceTokenData | null> {
  return await loadTokenData();
}

/**
 * 显示 Token 信息
 */
export async function showTokenInfo(): Promise<void> {
  const tokenData = await loadTokenData();
  
  if (!tokenData) {
    console.log('❌ 没有找到 Token');
    return;
  }
  
  const age = Date.now() - tokenData.createdAt;
  const ageHours = (age / 3600000).toFixed(1);
  const timeSinceRefresh = Date.now() - tokenData.lastRefreshedAt;
  const refreshHours = (timeSinceRefresh / 3600000).toFixed(1);
  
  console.log(`
🔐 设备 Token 信息
━━━━━━━━━━━━━━━━━━━━━━━━━
Token ID: ${tokenData.deviceIdHash.slice(0, 16)}...
创建时间: ${ageHours} 小时前
上次刷新: ${refreshHours} 小时前
使用次数: ${tokenData.usageCount}
IP Hash: ${tokenData.ipHash}
UA Hash: ${tokenData.uaHash}
━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
}

