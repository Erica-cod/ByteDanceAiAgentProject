/**
 * 统一的 API 响应格式
 * 文件名以 _ 开头，不会被 Modern.js BFF 解析为 API 路由
 */

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export function successResponse<T>(data: T, message?: string): ApiResponse<T> {
  return {
    success: true,
    data,
    ...(message && { message }),
  };
}

export function errorResponse(error: string): ApiResponse {
  return {
    success: false,
    error,
  };
}

export function messageResponse(message: string): ApiResponse {
  return {
    success: true,
    message,
  };
}
