/**
 * 统一的 API 响应格式
 * 文件名以 _ 开头，不会被 Modern.js BFF 解析为 API 路由
 */

import { getCorsHeaders } from './cors.js';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * 创建带 CORS 头的 JSON 响应
 */
function createJsonResponse(
  body: ApiResponse,
  status: number = 200,
  requestOrigin?: string
): Response {
  const corsHeaders = getCorsHeaders(requestOrigin);
  
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders,
    },
  });
}

export function successResponse<T>(data: T, message?: string, requestOrigin?: string): Response {
  const body: ApiResponse<T> = {
    success: true,
    data,
    ...(message && { message }),
  };
  return createJsonResponse(body, 200, requestOrigin);
}

export function errorResponse(error: string, requestOrigin?: string): Response {
  const body: ApiResponse = {
    success: false,
    error,
  };
  return createJsonResponse(body, 400, requestOrigin);
}

export function messageResponse(message: string, requestOrigin?: string): Response {
  const body: ApiResponse = {
    success: true,
    message,
  };
  return createJsonResponse(body, 200, requestOrigin);
}

/**
 * 旧版本的响应格式（保持向后兼容）
 * 注意：这些不包含 CORS 头，建议迁移到新版本
 */
export function successResponseLegacy<T>(data: T, message?: string): ApiResponse<T> {
  return {
    success: true,
    data,
    ...(message && { message }),
  };
}

export function errorResponseLegacy(error: string): ApiResponse {
  return {
    success: false,
    error,
  };
}

export function messageResponseLegacy(message: string): ApiResponse {
  return {
    success: true,
    message,
  };
}
