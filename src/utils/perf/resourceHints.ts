/**
 * 资源提示相关的轻量性能工具
 */

/**
 * 预连接外部域名
 */
export function preconnect(url: string): void {
  if (typeof document === 'undefined') return;

  const link = document.createElement('link');
  link.rel = 'preconnect';
  link.href = url;
  link.crossOrigin = 'anonymous';

  document.head.appendChild(link);
}

/**
 * DNS 预解析
 */
export function dnsPrefetch(url: string): void {
  if (typeof document === 'undefined') return;

  const link = document.createElement('link');
  link.rel = 'dns-prefetch';
  link.href = url;

  document.head.appendChild(link);
}

