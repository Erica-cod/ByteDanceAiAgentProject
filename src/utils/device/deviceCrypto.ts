/**
 * 设备绑定加密工具
 * 
 * 核心原理：
 * 1. 使用设备指纹派生加密密钥（无需用户记密码）
 * 2. 数据只能在本设备解密（跨设备无法读取）
 * 3. 即使 localStorage 被窃取，没有设备也无法解密
 * 
 * 安全特性：
 * - AES-GCM 加密（业界标准，高安全性）
 * - 设备指纹作为密钥源（硬件绑定）
 * - 每次加密使用新的 IV（防重放）
 * - 适合无登录系统（不依赖用户密码）
 */

// ===================== 类型定义 =====================

interface EncryptedData {
  iv: string;        // 初始化向量（Base64）
  data: string;      // 加密后的数据（Base64）
  version: 1;        // 版本号（方便未来升级）
}

// ===================== 密钥派生 =====================

/**
 * 从设备指纹派生加密密钥
 * 
 * 原理：
 * 1. 收集设备特征（Canvas、GPU、屏幕等）
 * 2. 拼接成唯一字符串
 * 3. 使用 PBKDF2 派生密钥（慢速哈希，防暴力破解）
 * 
 * 注意：
 * - 密钥永远不存储，每次都重新计算
 * - 设备特征变化会导致密钥变化（无法解密旧数据）
 * - 这是 trade-off：安全性 vs 数据可恢复性
 */
async function deriveKeyFromDevice(): Promise<CryptoKey> {
  // 收集设备特征（与 privacyFirstFingerprint.ts 类似，但不需要 IP）
  const features = await collectDeviceFeatures();
  
  // 拼接特征字符串
  const deviceString = JSON.stringify(features);
  
  // 加盐（防止彩虹表攻击）
  const salt = 'device_crypto_salt_v1';  // 固定盐值（可以公开）
  const saltedString = deviceString + salt;
  
  // 转换为字节
  const encoder = new TextEncoder();
  const keyMaterial = encoder.encode(saltedString);
  
  // PBKDF2 派生密钥（100,000 次迭代，增加破解成本）
  const baseKey = await crypto.subtle.importKey(
    'raw',
    keyMaterial,
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,  // 不可导出（增强安全性）
    ['encrypt', 'decrypt']
  );
  
  return derivedKey;
}

/**
 * 收集设备特征（用于派生密钥）
 * 
 * 注意：不包含 IP（IP 变化不应导致无法解密）
 */
async function collectDeviceFeatures(): Promise<Record<string, any>> {
  return {
    // 硬件特征（稳定）
    screen: `${screen.width}x${screen.height}x${screen.colorDepth}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    gpu: getGPUInfo(),
    canvas: getCanvasFingerprint(),
    
    // 浏览器特征（相对稳定）
    ua: navigator.userAgent,
    platform: navigator.platform,
  };
}

/**
 * 获取 GPU 信息
 */
function getGPUInfo(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return 'no-webgl';
    
    const debugInfo = (gl as any).getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return 'no-debug-info';
    
    const vendor = (gl as any).getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
    const renderer = (gl as any).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    
    return `${vendor}|${renderer}`;
  } catch (e) {
    return 'gpu-error';
  }
}

/**
 * 获取 Canvas 指纹
 */
function getCanvasFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-canvas';
    
    ctx.textBaseline = 'top';
    ctx.font = '14px "Arial"';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('加密指纹 🔐', 2, 15);
    
    return canvas.toDataURL();
  } catch (e) {
    return 'canvas-error';
  }
}

// ===================== 加密/解密 =====================

/**
 * 加密数据
 * 
 * @param plaintext - 明文数据（任意对象）
 * @returns 加密后的数据（可安全存储）
 */
export async function encryptData<T>(plaintext: T): Promise<EncryptedData> {
  // 检查是否支持加密
  if (!isCryptoSupported()) {
    throw new Error('当前环境不支持 Web Crypto API');
  }
  
  try {
    // 1. 派生密钥
    const key = await deriveKeyFromDevice();
    
    // 2. 生成随机 IV（每次加密都不同）
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // 3. 序列化数据
    const jsonString = JSON.stringify(plaintext);
    const encoder = new TextEncoder();
    const data = encoder.encode(jsonString);
    
    // 4. AES-GCM 加密
    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      key,
      data
    );
    
    // 5. 转换为 Base64（便于存储）
    const encryptedArray = new Uint8Array(encryptedBuffer);
    const ivBase64 = btoa(String.fromCharCode(...iv));
    const dataBase64 = btoa(String.fromCharCode(...encryptedArray));
    
    return {
      iv: ivBase64,
      data: dataBase64,
      version: 1,
    };
  } catch (error) {
    console.error('❌ 加密失败:', error);
    throw new Error('数据加密失败');
  }
}

/**
 * 解密数据
 * 
 * @param encrypted - 加密后的数据
 * @returns 解密后的原始数据
 */
export async function decryptData<T>(encrypted: EncryptedData): Promise<T> {
  // 检查是否支持加密
  if (!isCryptoSupported()) {
    throw new Error('当前环境不支持 Web Crypto API');
  }
  
  try {
    // 1. 派生密钥（必须与加密时相同的设备）
    const key = await deriveKeyFromDevice();
    
    // 2. Base64 解码
    const iv = Uint8Array.from(atob(encrypted.iv), c => c.charCodeAt(0));
    const data = Uint8Array.from(atob(encrypted.data), c => c.charCodeAt(0));
    
    // 3. AES-GCM 解密
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      key,
      data
    );
    
    // 4. 反序列化
    const decoder = new TextDecoder();
    const jsonString = decoder.decode(decryptedBuffer);
    
    return JSON.parse(jsonString) as T;
  } catch (error) {
    console.error('❌ 解密失败:', error);
    throw new Error('数据解密失败（可能在不同设备上或设备环境已变化）');
  }
}

// ===================== 辅助函数 =====================

/**
 * 测试加密/解密功能
 */
export async function testEncryption(): Promise<void> {
  console.log('🧪 开始测试设备绑定加密...');
  
  const testData = {
    message: '这是一条测试消息',
    timestamp: Date.now(),
    sensitive: '包含敏感信息：身份证号 123456789',
  };
  
  console.log('原始数据:', testData);
  
  // 加密
  const encrypted = await encryptData(testData);
  console.log('加密后:', encrypted);
  console.log('加密数据长度:', encrypted.data.length, '字符');
  
  // 解密
  const decrypted = await decryptData(encrypted);
  console.log('解密后:', decrypted);
  
  // 验证
  if (JSON.stringify(testData) === JSON.stringify(decrypted)) {
    console.log('✅ 加密/解密测试通过！');
  } else {
    console.error('❌ 加密/解密测试失败！');
  }
}

/**
 * 检查是否支持加密功能
 */
export function isCryptoSupported(): boolean {
  // 检查是否在浏览器环境
  if (typeof window === 'undefined' || typeof crypto === 'undefined') {
    return false;
  }
  
  // 检查 Web Crypto API 是否可用
  try {
    return !!(
      crypto &&
      crypto.subtle &&
      typeof crypto.subtle.encrypt === 'function' &&
      typeof crypto.subtle.decrypt === 'function'
    );
  } catch (e) {
    return false;
  }
}

/**
 * 估算加密后的数据大小（用于容量规划）
 */
export function estimateEncryptedSize(dataSize: number): number {
  // Base64 编码增加 ~33%，加上 IV 和元数据
  return Math.ceil(dataSize * 1.33) + 100;
}

