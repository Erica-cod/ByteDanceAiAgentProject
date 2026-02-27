/**
 * 性能优化工具
 * 用于优化 LCP、FID、CLS 等 Core Web Vitals 指标
 */

/**
 * 预加载关键资源
 * @param href - 资源 URL
 * @param as - 资源类型 ('style' | 'script' | 'font' | 'image')
 */
export function preloadResource(href: string, as: string): void {
  if (typeof document === 'undefined') return;
  
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = as;
  link.href = href;
  
  if (as === 'font') {
    link.crossOrigin = 'anonymous';
  }
  
  document.head.appendChild(link);
}

/**
 * 延迟加载非关键 CSS
 * @param href - CSS 文件路径
 */
export function loadCSSAsync(href: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      resolve();
      return;
    }
    
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`Failed to load CSS: ${href}`));
    
    document.head.appendChild(link);
  });
}

/**
 * 在空闲时执行任务（降级到 setTimeout）
 * @param callback - 回调函数
 * @param options - 选项
 */
export function runWhenIdle(
  callback: () => void,
  options?: { timeout?: number }
): number {
  if (typeof window === 'undefined') return 0;
  
  if ('requestIdleCallback' in window) {
    return (window as any).requestIdleCallback(callback, options);
  } else {
    // 降级方案
    return setTimeout(callback, 1) as any;
  }
}

/**
 * 取消空闲任务
 * @param id - 任务 ID
 */
export function cancelIdleTask(id: number): void {
  if (typeof window === 'undefined') return;
  
  if ('cancelIdleCallback' in window) {
    (window as any).cancelIdleCallback(id);
  } else {
    clearTimeout(id);
  }
}

/**
 * 预连接外部域名
 * @param url - 外部域名
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
 * @param url - 域名
 */
export function dnsPrefetch(url: string): void {
  if (typeof document === 'undefined') return;
  
  const link = document.createElement('link');
  link.rel = 'dns-prefetch';
  link.href = url;
  
  document.head.appendChild(link);
}

/**
 * 监控 Web Vitals
 * 注意：需要安装 web-vitals 库
 * npm install web-vitals
 */
export async function reportWebVitals(): Promise<void> {
  if (typeof window === 'undefined') return;
  
  // 使用 web-vitals 库（如果已安装）
  // 使用 try-catch 包装动态导入，避免 TypeScript 错误
  try {
    // @ts-ignore - web-vitals 是可选依赖
    const webVitals = await import('web-vitals');
    const { getCLS, getFID, getFCP, getLCP, getTTFB } = webVitals;
    getCLS((metric: any) => console.log('CLS:', metric.value));
    getFID((metric: any) => console.log('FID:', metric.value));
    getFCP((metric: any) => console.log('FCP:', metric.value));
    getLCP((metric: any) => console.log('LCP:', metric.value));
    getTTFB((metric: any) => console.log('TTFB:', metric.value));
  } catch (error) {
    // web-vitals 未安装，跳过
    // console.info('💡 提示: 安装 web-vitals 以启用性能监控 (npm install web-vitals)');
  }
}

/**
 * 优化图片加载
 * 为图片添加 loading="lazy" 和适当的尺寸
 */
export function optimizeImages(): void {
  if (typeof document === 'undefined') return;
  
  const images = document.querySelectorAll('img:not([loading])');
  images.forEach((img) => {
    if (img instanceof HTMLImageElement) {
      // 视口外的图片懒加载
      const rect = img.getBoundingClientRect();
      if (rect.top > window.innerHeight) {
        img.loading = 'lazy';
      }
    }
  });
}

/**
 * 减少主线程阻塞
 * 将长任务分解为小任务
 */
export async function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * 批量执行任务（避免长任务阻塞）
 * @param tasks - 任务数组
 * @param batchSize - 每批执行的任务数
 */
export async function executeBatch<T>(
  tasks: Array<() => T>,
  batchSize: number = 5
): Promise<T[]> {
  const results: T[] = [];
  
  for (let i = 0; i < tasks.length; i += batchSize) {
    const batch = tasks.slice(i, i + batchSize);
    const batchResults = batch.map((task) => task());
    results.push(...batchResults);
    
    // 让出主线程
    if (i + batchSize < tasks.length) {
      await yieldToMain();
    }
  }
  
  return results;
}

/**
 * 性能标记
 */
export class PerformanceMarker {
  private startTime: number = 0;
  private marks: Map<string, number> = new Map();
  
  /**
   * 开始计时
   */
  start(): void {
    this.startTime = performance.now();
  }
  
  /**
   * 标记点
   * @param name - 标记名称
   */
  mark(name: string): void {
    this.marks.set(name, performance.now() - this.startTime);
  }
  
  /**
   * 获取所有标记
   */
  getMarks(): Record<string, number> {
    const result: Record<string, number> = {};
    this.marks.forEach((time, name) => {
      result[name] = time;
    });
    return result;
  }
  
  /**
   * 打印标记
   */
  log(): void {
    console.table(this.getMarks());
  }
}

/**
 * 检测是否支持 WebP
 */
export function supportsWebP(): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.width === 1);
    img.onerror = () => resolve(false);
    img.src = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';
  });
}

