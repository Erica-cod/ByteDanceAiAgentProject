/**
 * 设备追踪 API
 * 
 * 路由: /api/device/*
 * 
 * ✅ 使用 Clean Architecture
 */

import { getContainer } from '../_clean/di-container.js';
import { createJsonResponse, handleOptionsRequest } from './_utils/cors.js';

// ✅ Clean Architecture: 启动定期清理
const container = getContainer();
const cleanupUseCase = container.getCleanupExpiredDevicesUseCase();
cleanupUseCase.startPeriodicCleanup();

interface RequestOption<D = any> {
  data?: D;
  params?: Record<string, string>;
  headers?: Record<string, any>;
}

interface TrackDeviceRequest {
  deviceIdHash: string;
}

/**
 * OPTIONS /api/device/track - 处理预检请求
 */
export async function options(req: RequestOption) {
  const origin = req.headers?.origin;
  return handleOptionsRequest(origin);
}

/**
 * POST /api/device/track
 * 追踪设备
 */
export async function post(req: RequestOption<TrackDeviceRequest>) {
  const requestOrigin = req.headers?.origin;
  const { deviceIdHash } = req.data || {};
  
  // 参数校验
  if (!deviceIdHash || typeof deviceIdHash !== 'string') {
    return createJsonResponse(
      { success: false, error: 'Invalid deviceIdHash' },
      400,
      requestOrigin
    );
  }
  
  // 长度校验（SHA-256 输出应该是 32 或 64 字符）
  if (deviceIdHash.length < 16 || deviceIdHash.length > 64) {
    return createJsonResponse(
      { success: false, error: 'deviceIdHash length invalid' },
      400,
      requestOrigin
    );
  }
  
  try {
    // ✅ Clean Architecture
    const container = getContainer();
    const trackDeviceUseCase = container.getTrackDeviceUseCase();
    await trackDeviceUseCase.execute(deviceIdHash);
    
    return createJsonResponse(
      { success: true },
      200,
      requestOrigin
    );
  } catch (error: any) {
    console.error('❌ Track device API error:', error);
    return createJsonResponse(
      { success: false, error: error.message || 'Failed to track device' },
      500,
      requestOrigin
    );
  }
}

/**
 * GET /api/device/stats
 * 获取设备统计信息（调试/监控用）
 */
export async function get(req: RequestOption) {
  const requestOrigin = req.headers?.origin;
  
  try {
    // ✅ Clean Architecture
    const container = getContainer();
    const getDeviceStatsUseCase = container.getGetDeviceStatsUseCase();
    const stats = await getDeviceStatsUseCase.execute();
    
    return createJsonResponse(
      { success: true, data: stats },
      200,
      requestOrigin
    );
  } catch (error: any) {
    console.error('❌ Get device stats API error:', error);
    return createJsonResponse(
      { success: false, error: error.message || 'Failed to get device stats' },
      500,
      requestOrigin
    );
  }
}

/**
 * DELETE /api/device/track
 * 删除设备（用户请求删除）
 */
export async function del(req: RequestOption<TrackDeviceRequest>) {
  const requestOrigin = req.headers?.origin;
  const { deviceIdHash } = req.data || {};
  
  if (!deviceIdHash || typeof deviceIdHash !== 'string') {
    return createJsonResponse(
      { success: false, error: 'Invalid deviceIdHash' },
      400,
      requestOrigin
    );
  }
  
  try {
    // ✅ Clean Architecture
    const container = getContainer();
    const deleteDeviceUseCase = container.getDeleteDeviceUseCase();
    const deleted = await deleteDeviceUseCase.execute(deviceIdHash);
    
    return createJsonResponse(
      { success: true, deleted },
      200,
      requestOrigin
    );
  } catch (error: any) {
    console.error('❌ Delete device API error:', error);
    return createJsonResponse(
      { success: false, error: error.message || 'Failed to delete device' },
      500,
      requestOrigin
    );
  }
}

