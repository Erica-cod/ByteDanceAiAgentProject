/**
 * CSS 模块类型声明
 * 允许 TypeScript 识别 CSS 文件的 import
 */

declare module '*.css' {
  const content: any;
  export default content;
}

declare module '*.scss' {
  const content: any;
  export default content;
}

declare module '*.sass' {
  const content: any;
  export default content;
}

declare module '*.less' {
  const content: any;
  export default content;
}

// 特别声明 highlight.js 的 CSS
declare module 'highlight.js/styles/*.css' {
  const content: any;
  export default content;
}

