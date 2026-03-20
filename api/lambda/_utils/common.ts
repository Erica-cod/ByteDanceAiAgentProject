/**
 * 共享工具函数
 *
 * parseCookies / isHttps / base64url 等此前散落在多个文件中，
 * 统一收敛到此处，各模块改为从这里导入。
 */

export function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  const out: Record<string, string> = {};
  for (const p of cookieHeader.split(';')) {
    const idx = p.indexOf('=');
    if (idx === -1) continue;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function isHttps(headers?: Record<string, any>): boolean {
  const proto = String(
    headers?.['x-forwarded-proto'] || headers?.['X-Forwarded-Proto'] || '',
  ).toLowerCase();
  if (proto) return proto === 'https';
  return process.env.NODE_ENV === 'production';
}

export function base64url(input: Buffer): string {
  return input
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
