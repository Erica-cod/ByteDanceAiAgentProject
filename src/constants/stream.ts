/**
 * SSE 流式连接相关常量
 */

/** SSE 断线重连最大次数 */
export const MAX_RECONNECT_ATTEMPTS = 3;

/** 重连基础延迟（毫秒） */
export const BASE_RETRY_DELAY_MS = 500;

/** 重连最大延迟上限（毫秒） */
export const MAX_RETRY_DELAY_MS = 5000;
