/**
 * 设备追踪服务
 * 
 * L4：定期清理（30 天过期）
 * 
 * 实现原则：
 * 1. 只存储 Hash（不存原始指纹）
 * 2. 定期清理（30 天后删除）
 * 3. 活跃设备延长过期时间
 * 4. 符合 GDPR"存储限制"原则
 */

interface DeviceRecord {
  deviceIdHash: string;      // Hash 后的设备 ID（不存原始指纹）
  createdAt: number;         // 创建时间（毫秒时间戳）
  lastSeen: number;          // 最后访问时间
  expiresAt: number;         // 过期时间
}

// 内存存储（生产环境建议用 Redis 或数据库）
const deviceDatabase = new Map<string, DeviceRecord>();

// L4：设备 TTL（30 天）
const DEVICE_TTL_MS = 30 * 24 * 3600 * 1000; // 30 天

/**
 * 追踪设备（新增或更新）
 * 
 * @param deviceIdHash 设备 ID Hash
 */
export function trackDevice(deviceIdHash: string): void {
  const now = Date.now();
  const expiresAt = now + DEVICE_TTL_MS;
  
  if (!deviceDatabase.has(deviceIdHash)) {
    // 新设备
    deviceDatabase.set(deviceIdHash, {
      deviceIdHash,
      createdAt: now,
      lastSeen: now,
      expiresAt,
    });
    console.log(`✅ 新设备：${deviceIdHash.slice(0, 8)}...`);
  } else {
    // 已有设备，更新最后访问时间和过期时间
    const device = deviceDatabase.get(deviceIdHash)!;
    device.lastSeen = now;
    device.expiresAt = now + DEVICE_TTL_MS; // ✅ 活跃设备延长过期时间
  }
}

/**
 * L4：定期清理过期设备（每小时执行）
 * 
 * 清理策略：
 * - 30 天未访问 → 删除
 * - 活跃设备 → 延长过期时间
 */
export function startDeviceCleanup(): void {
  setInterval(() => {
    const now = Date.now();
    let deletedCount = 0;
    
    for (const [hash, device] of deviceDatabase.entries()) {
      if (now > device.expiresAt) {
        deviceDatabase.delete(hash);
        deletedCount++;
      }
    }
    
    if (deletedCount > 0) {
      console.log(`🗑️ [DeviceCleanup] 清理过期设备：${deletedCount} 个`);
    }
  }, 3600000); // 1 小时
  
  console.log('🧹 [DeviceCleanup] 定期清理已启动（每小时执行一次）');
}

/**
 * 获取设备信息（用于调试/监控）
 */
export function getDeviceStats(): { 
  total: number; 
  oldest: number; 
  newest: number;
  averageLifetime: number;
} {
  const devices = Array.from(deviceDatabase.values());
  const now = Date.now();
  
  if (devices.length === 0) {
    return { total: 0, oldest: 0, newest: 0, averageLifetime: 0 };
  }
  
  const lifetimes = devices.map(d => now - d.createdAt);
  const averageLifetime = lifetimes.reduce((sum, t) => sum + t, 0) / lifetimes.length;
  
  return {
    total: devices.length,
    oldest: Math.min(...devices.map(d => d.createdAt)),
    newest: Math.max(...devices.map(d => d.createdAt)),
    averageLifetime: Math.round(averageLifetime / 86400000), // 转为天数
  };
}

/**
 * 检查设备是否存在
 */
export function hasDevice(deviceIdHash: string): boolean {
  return deviceDatabase.has(deviceIdHash);
}

/**
 * 手动删除设备（用于"用户请求删除"）
 */
export function deleteDevice(deviceIdHash: string): boolean {
  const deleted = deviceDatabase.delete(deviceIdHash);
  if (deleted) {
    console.log(`🗑️ 手动删除设备：${deviceIdHash.slice(0, 8)}...`);
  }
  return deleted;
}

