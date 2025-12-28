/**
 * 设备追踪 API
 * 
 * 路由: /api/device/*
 */

import { trackDevice, startDeviceCleanup, getDeviceStats, deleteDevice } from '../services/deviceTracker.js';

// 启动定期清理
startDeviceCleanup();

interface RequestOption<D = any> {
  data?: D;
  params?: Record<string, string>;
}

interface TrackDeviceRequest {
  deviceIdHash: string;
}

/**
 * POST /api/device/track
 * 追踪设备
 */
export async function post(req: RequestOption<TrackDeviceRequest>) {
  const { deviceIdHash } = req.data || {};
  
  // 参数校验
  if (!deviceIdHash || typeof deviceIdHash !== 'string') {
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Invalid deviceIdHash' 
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  // 长度校验（SHA-256 输出应该是 32 或 64 字符）
  if (deviceIdHash.length < 16 || deviceIdHash.length > 64) {
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'deviceIdHash length invalid' 
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  // 追踪设备
  trackDevice(deviceIdHash);
  
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * GET /api/device/stats
 * 获取设备统计信息（调试/监控用）
 */
export async function get(req: RequestOption) {
  const stats = getDeviceStats();
  
  return new Response(JSON.stringify({ 
    success: true, 
    data: stats 
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * DELETE /api/device/track
 * 删除设备（用户请求删除）
 */
export async function del(req: RequestOption<TrackDeviceRequest>) {
  const { deviceIdHash } = req.data || {};
  
  if (!deviceIdHash || typeof deviceIdHash !== 'string') {
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Invalid deviceIdHash' 
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  const deleted = deleteDevice(deviceIdHash);
  
  return new Response(JSON.stringify({ 
    success: true,
    deleted 
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

