/**
 * 设备追踪 API
 * 
 * 路由: /api/device/*
 */

import { trackDevice, startDeviceCleanup, getDeviceStats, deleteDevice } from '../services/deviceTracker.js';
import { USE_CLEAN_ARCH } from './_utils/arch-switch.js';
import { getContainer } from '../_clean/di-container.js';

// 启动定期清理
if (USE_CLEAN_ARCH) {
  const container = getContainer();
  const cleanupUseCase = container.getCleanupExpiredDevicesUseCase();
  cleanupUseCase.startPeriodicCleanup();
} else {
  startDeviceCleanup();
}

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
  
  try {
    if (USE_CLEAN_ARCH) {
      console.log('🆕 Using Clean Architecture for track device');
      const container = getContainer();
      const trackDeviceUseCase = container.getTrackDeviceUseCase();
      await trackDeviceUseCase.execute(deviceIdHash);
    } else {
      console.log('🔧 Using legacy service for track device');
      trackDevice(deviceIdHash);
    }
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('❌ Track device API error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || 'Failed to track device' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * GET /api/device/stats
 * 获取设备统计信息（调试/监控用）
 */
export async function get(req: RequestOption) {
  try {
    let stats;
    
    if (USE_CLEAN_ARCH) {
      console.log('🆕 Using Clean Architecture for get device stats');
      const container = getContainer();
      const getDeviceStatsUseCase = container.getGetDeviceStatsUseCase();
      stats = await getDeviceStatsUseCase.execute();
    } else {
      console.log('🔧 Using legacy service for get device stats');
      stats = getDeviceStats();
    }
    
    return new Response(JSON.stringify({ 
      success: true, 
      data: stats 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('❌ Get device stats API error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || 'Failed to get device stats' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
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
  
  try {
    let deleted;
    
    if (USE_CLEAN_ARCH) {
      console.log('🆕 Using Clean Architecture for delete device');
      const container = getContainer();
      const deleteDeviceUseCase = container.getDeleteDeviceUseCase();
      deleted = await deleteDeviceUseCase.execute(deviceIdHash);
    } else {
      console.log('🔧 Using legacy service for delete device');
      deleted = deleteDevice(deviceIdHash);
    }
    
    return new Response(JSON.stringify({ 
      success: true,
      deleted 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('❌ Delete device API error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || 'Failed to delete device' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

