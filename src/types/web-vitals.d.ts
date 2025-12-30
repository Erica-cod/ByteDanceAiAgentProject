/**
 * web-vitals 模块类型声明
 * 用于可选依赖，如果未安装也不会报错
 */

declare module 'web-vitals' {
  export interface Metric {
    name: string;
    value: number;
    id: string;
    delta: number;
    entries: PerformanceEntry[];
  }

  export type ReportCallback = (metric: Metric) => void;

  export function getCLS(onReport: ReportCallback): void;
  export function getFID(onReport: ReportCallback): void;
  export function getFCP(onReport: ReportCallback): void;
  export function getLCP(onReport: ReportCallback): void;
  export function getTTFB(onReport: ReportCallback): void;
  export function getINP(onReport: ReportCallback): void;
}

