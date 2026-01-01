/**
 * CORS 工具函数
 * 为 API 响应添加跨域支持
 */

/**
 * 获取允许的源列表
 */
function getAllowedOrigins(): string[] {
  const corsOrigin = process.env.CORS_ORIGIN;
  
  if (!corsOrigin) {
    // 开发环境默认允许所有源
    if (process.env.NODE_ENV === 'development') {
      return ['*'];
    }
    // 生产环境默认只允许同源
    return [];
  }
  
  return corsOrigin.split(',').map(origin => origin.trim());
}

/**
 * 获取 CORS 响应头
 * @param requestOrigin - 请求的 Origin 头
 */
export function getCorsHeaders(requestOrigin?: string): Record<string, string> {
  const allowedOrigins = getAllowedOrigins();
  const headers: Record<string, string> = {};
  
  // 设置 Access-Control-Allow-Origin
  if (allowedOrigins.includes('*')) {
    headers['Access-Control-Allow-Origin'] = '*';
  } else if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    headers['Access-Control-Allow-Origin'] = requestOrigin;
    headers['Vary'] = 'Origin'; // 告诉缓存服务器根据 Origin 区分缓存
  }
  
  // 设置其他 CORS 头
  if (headers['Access-Control-Allow-Origin']) {
    headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Queue-Token, X-Queue-Position, X-Queue-Estimated-Wait';
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Access-Control-Max-Age'] = '86400'; // 24小时
    
    // 暴露自定义响应头（让前端能读取）
    headers['Access-Control-Expose-Headers'] = 'X-Queue-Token, X-Queue-Position, X-Queue-Estimated-Wait, Retry-After';
  }
  
  return headers;
}

/**
 * 为 Response 对象添加 CORS 头
 */
export function addCorsHeaders(response: Response, requestOrigin?: string): Response {
  const corsHeaders = getCorsHeaders(requestOrigin);
  
  // 创建新的 Headers 对象，合并原有头和 CORS 头
  const newHeaders = new Headers(response.headers);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    newHeaders.set(key, value);
  });
  
  // 创建新的 Response 对象
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

/**
 * 处理 OPTIONS 预检请求
 */
export function handleOptionsRequest(requestOrigin?: string): Response {
  const headers = getCorsHeaders(requestOrigin);
  
  return new Response(null, {
    status: 204,
    headers,
  });
}

/**
 * 创建带 CORS 头的 JSON 响应（简化版）
 */
export function createJsonResponse(
  data: any,
  status: number = 200,
  requestOrigin?: string
): Response {
  const corsHeaders = getCorsHeaders(requestOrigin);
  
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

