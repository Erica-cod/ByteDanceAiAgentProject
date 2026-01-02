# 📝 11-Interview-Prep（面试准备）

## 📌 模块简介

本文件夹包含了前端面试知识点的全面总结，涵盖 React、性能优化、网络、安全、算法等各个方面。这是为面试准备的完整知识库。

## 📚 核心文档

### FRONTEND_INTERVIEW_PREP.md（67KB）⭐⭐⭐

**这是本项目最重要的面试准备文档之一**，内容非常丰富和全面。

## 📖 文档目录

### 1. React 核心知识
- **Hooks 原理**
  - useState 的实现原理
  - useEffect 的执行时机
  - useMemo 和 useCallback 的区别
  - 自定义 Hooks 的设计

- **React 性能优化**
  - React.memo 的使用
  - 虚拟 DOM 和 Diff 算法
  - Fiber 架构
  - Concurrent Mode

- **状态管理**
  - Redux vs Zustand vs Jotai
  - Context API 的性能问题
  - 状态管理最佳实践

### 2. JavaScript 进阶
- **闭包和作用域**
  - 闭包的应用场景
  - 内存泄漏的原因
  - 模块化的实现原理

- **异步编程**
  - Promise 实现原理
  - async/await 原理
  - 事件循环机制
  - 微任务和宏任务

- **原型和继承**
  - 原型链
  - 继承的多种方式
  - ES6 class 的本质

### 3. TypeScript
- **类型系统**
  - 基础类型
  - 高级类型（联合、交叉、映射）
  - 泛型的使用
  - 类型推导

- **工程实践**
  - tsconfig 配置
  - 类型声明文件
  - 类型体操技巧

### 4. 性能优化
- **Web Vitals**
  - LCP（最大内容绘制）
  - FID（首次输入延迟）
  - CLS（累积布局偏移）

- **优化技巧**
  - 代码分割
  - 懒加载
  - 预加载和预连接
  - 图片优化
  - 字体优化

- **渲染优化**
  - 虚拟列表
  - 防抖和节流
  - requestIdleCallback
  - Web Worker

### 5. 网络和安全
- **HTTP 协议**
  - HTTP/1.1 vs HTTP/2 vs HTTP/3
  - HTTPS 原理
  - 缓存策略
  - Cookie vs Token

- **Web 安全**
  - XSS 攻击和防护
  - CSRF 攻击和防护
  - SQL 注入
  - CORS 跨域

### 6. 工程化
- **构建工具**
  - Webpack 原理
  - Vite 的优势
  - Tree Shaking
  - Module Federation

- **代码质量**
  - ESLint 和 Prettier
  - Git Hooks
  - 单元测试
  - E2E 测试

### 7. 算法和数据结构
- **常用算法**
  - 排序算法
  - 搜索算法
  - 动态规划
  - 贪心算法

- **数据结构**
  - 数组和链表
  - 栈和队列
  - 树和图
  - 哈希表

### 8. 系统设计
- **前端架构**
  - 微前端
  - SSR vs SSG vs CSR
  - PWA
  - 离线存储

- **大规模应用**
  - 性能监控
  - 错误追踪
  - 灰度发布
  - A/B 测试

## 🎯 如何使用这份文档

### 1. 按模块复习
根据面试岗位的要求，重点复习相关模块：
- **React 岗位**：React 核心 + 性能优化
- **全栈岗位**：网络 + 安全 + 系统设计
- **资深岗位**：工程化 + 架构设计

### 2. 结合项目经验
将文档中的知识点与本项目的实际实现对应：

**React 性能优化** → 本项目的虚拟化列表、memo 使用

**异步编程** → 本项目的流式传输、Promise 链

**Web 安全** → 本项目的无登录安全系统、CORS 配置

**系统设计** → 本项目的 Clean Architecture、多智能体系统

### 3. 准备话术
对每个知识点准备：
1. **理论知识**：原理是什么？
2. **实际应用**：在项目中怎么用的？
3. **遇到的问题**：遇到什么坑？
4. **解决方案**：如何解决的？
5. **效果**：带来了什么改进？

### 4. 模拟面试
对着文档中的问题，模拟回答：
- **基础问题**：能否清晰准确地回答？
- **深入问题**：能否讲出原理？
- **场景问题**：能否结合实际？
- **对比问题**：能否分析优劣？

## 💡 高频面试题速查

### React 相关

**Q: useEffect 的执行时机？**
```typescript
useEffect(() => {
  // 1. 组件挂载后执行
  // 2. 依赖项变化后执行
  
  return () => {
    // 3. 组件卸载前执行
    // 4. 依赖项变化前执行（清理上一次的副作用）
  };
}, [deps]);
```

**Q: React 如何做性能优化？**
- React.memo：避免不必要的重渲染
- useMemo：缓存计算结果
- useCallback：缓存函数引用
- lazy + Suspense：代码分割
- 虚拟化列表：只渲染可见部分

**Q: Fiber 架构是什么？**
- 可中断的渲染过程
- 时间切片，不阻塞主线程
- 优先级调度
- Concurrent Mode 的基础

### 性能优化相关

**Q: 如何优化 LCP？**
- 预加载关键资源
- 代码分割
- 图片优化（WebP、懒加载）
- CDN 加速
- SSR / SSG

**Q: 什么是虚拟列表？**
- 只渲染可见区域的元素
- 滚动时动态加载/卸载
- 大幅减少 DOM 节点数量
- 提升性能和内存使用

**Q: 防抖和节流的区别？**
```typescript
// 防抖：等待停止后再执行
const debounce = (fn, delay) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

// 节流：固定时间间隔执行
const throttle = (fn, delay) => {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= delay) {
      fn(...args);
      last = now;
    }
  };
};
```

### 网络相关

**Q: HTTP 缓存策略？**
```
1. 强缓存
   - Cache-Control: max-age=3600
   - Expires: Wed, 21 Oct 2024 07:28:00 GMT
   
2. 协商缓存
   - Last-Modified / If-Modified-Since
   - ETag / If-None-Match
```

**Q: 如何防止 XSS？**
- 输入过滤：过滤特殊字符
- 输出转义：HTML 转义
- CSP：Content Security Policy
- HttpOnly Cookie：防止 JS 读取

**Q: CORS 是什么？**
- 跨域资源共享
- 浏览器的安全机制
- 服务端设置响应头允许跨域
- 简单请求 vs 预检请求

### 算法相关

**Q: 常用排序算法的时间复杂度？**
| 算法 | 平均 | 最好 | 最坏 | 空间 | 稳定性 |
|------|------|------|------|------|--------|
| 冒泡 | O(n²) | O(n) | O(n²) | O(1) | 稳定 |
| 快排 | O(nlogn) | O(nlogn) | O(n²) | O(logn) | 不稳定 |
| 归并 | O(nlogn) | O(nlogn) | O(nlogn) | O(n) | 稳定 |

**Q: 如何实现深拷贝？**
```typescript
function deepClone(obj, map = new WeakMap()) {
  // 1. 处理基本类型
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  // 2. 处理循环引用
  if (map.has(obj)) {
    return map.get(obj);
  }
  
  // 3. 处理数组
  if (Array.isArray(obj)) {
    const arr = [];
    map.set(obj, arr);
    obj.forEach(item => arr.push(deepClone(item, map)));
    return arr;
  }
  
  // 4. 处理对象
  const cloneObj = {};
  map.set(obj, cloneObj);
  Object.keys(obj).forEach(key => {
    cloneObj[key] = deepClone(obj[key], map);
  });
  
  return cloneObj;
}
```

## 🔗 本项目的面试亮点

### 1. 架构设计
- **Clean Architecture**：展示架构设计能力
- **渐进式重构**：展示工程能力
- **模块化设计**：展示代码组织能力

### 2. 技术深度
- **流式断点续传**：展示问题解决能力
- **工具防幻觉**：展示系统设计能力
- **大文本处理**：展示性能优化能力

### 3. 工程实践
- **TypeScript 全覆盖**：展示代码质量意识
- **完整的文档**：展示团队协作能力
- **测试和监控**：展示生产环境经验

### 4. 创新能力
- **无登录安全**：创新的解决方案
- **多智能体协作**：复杂系统设计
- **自适应策略**：智能化的实现

## 📊 面试准备清单

### 基础知识（必须掌握）
- [ ] JavaScript 核心概念
- [ ] React Hooks 原理
- [ ] HTTP 协议
- [ ] 常用算法

### 进阶知识（建议掌握）
- [ ] React Fiber 架构
- [ ] 性能优化技巧
- [ ] Web 安全
- [ ] 设计模式

### 项目经验（重点准备）
- [ ] 项目架构和技术选型
- [ ] 遇到的技术难题
- [ ] 性能优化案例
- [ ] 项目亮点和创新

### 软技能
- [ ] 团队协作经验
- [ ] 问题解决能力
- [ ] 学习能力
- [ ] 沟通能力

---

**建议学习路径：**
1. 先通读一遍 `FRONTEND_INTERVIEW_PREP.md`
2. 标记不熟悉的知识点
3. 对照项目代码深入理解
4. 准备自己的回答话术
5. 模拟面试练习

**面试前一周：**
- 每天复习 2-3 个模块
- 重点准备项目相关问题
- 模拟回答高频问题
- 准备要问面试官的问题

**面试当天：**
- 回顾项目核心亮点
- 准备自我介绍
- 保持自信和积极的心态

祝你面试顺利！🎉

