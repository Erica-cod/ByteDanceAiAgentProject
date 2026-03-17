# 下划线规则的局限性 - 为什么 _clean 还是被扫描报错？

## 🤔 核心问题

用户的关键疑问：
> "那为什么我之前文件夹是下划线规则了，还是会被解析报错？"

这是一个非常深刻的问题，揭示了 Modern.js 下划线规则的**真正含义**和**局限性**。

## 🔍 下划线规则的真正含义

### 官方文档说明

> 以下文件不会被解析为 BFF 函数文件：
> - 命名以 `_` 开头的文件，例如：`_utils.ts`
> - 命名以 `_` 开头的文件夹下的所有文件

**关键词**：**"不会被解析为 BFF 函数文件"**

### 误解 vs 实际

| 我们以为的 | 实际情况 |
|-----------|---------|
| ❌ 不会被扫描 | ⚠️ 还是会被扫描 |
| ❌ 不会被读取 | ⚠️ 还是会被读取 |
| ❌ 不会被解析 | ⚠️ 还是会被解析（语法检查） |
| ✅ 不会作为路由 | ✅ 确实不会作为路由 |

## 📊 Modern.js 的工作流程

### 完整的扫描-解析-路由流程

```
┌─────────────────────────────────────────────────────┐
│ 阶段 1: 文件系统扫描 (File System Scan)            │
├─────────────────────────────────────────────────────┤
│ 扫描 api/ 目录下的所有 .ts 文件                     │
│                                                     │
│ 发现的文件：                                        │
│ - api/lambda/chat.ts           ✅                   │
│ - api/lambda/_utils/cors.ts    ✅ 也被发现          │
│ - api/_clean/domain/user.ts    ✅ 也被发现          │
│ - api/services/userService.ts  ✅ 也被发现          │
│                                                     │
│ 💡 所有文件都被发现，包括 _ 开头的！                 │
└─────────────────────────────────────────────────────┘
           │
           ↓
┌─────────────────────────────────────────────────────┐
│ 阶段 2: TypeScript 语法解析 (Syntax Parsing)       │
├─────────────────────────────────────────────────────┤
│ 对每个文件进行语法检查和 AST 构建                   │
│                                                     │
│ api/lambda/chat.ts:                                 │
│   export default async (req, res) => { }  ✅ 通过   │
│                                                     │
│ api/lambda/_utils/cors.ts:                          │
│   export function cors() { }               ✅ 通过   │
│                                                     │
│ api/_clean/infrastructure/metrics.repository.ts:    │
│   @Repository()                            ❌ 报错！ │
│   export class...                                   │
│   TS1206: Decorators are not valid here             │
│                                                     │
│ 💡 这个阶段会检查所有文件的语法！                    │
│    即使是 _ 开头的文件也会被检查！                   │
└─────────────────────────────────────────────────────┘
           │
           ↓
┌─────────────────────────────────────────────────────┐
│ 阶段 3: 路由生成 (Route Generation)                 │
├─────────────────────────────────────────────────────┤
│ 根据文件路径生成 BFF 路由                           │
│                                                     │
│ 应用下划线规则（在这个阶段！）：                     │
│                                                     │
│ api/lambda/chat.ts                                  │
│   → 生成路由: /api/chat            ✅               │
│                                                     │
│ api/lambda/_utils/cors.ts                           │
│   → 跳过（下划线规则）              ✅ 规则生效      │
│                                                     │
│ api/_clean/infrastructure/metrics.repository.ts     │
│   → 跳过（下划线规则）              ✅ 规则生效      │
│   → 但已经在阶段2报错了！           ❌              │
│                                                     │
│ 💡 下划线规则只在这个阶段生效！                      │
│    但为时已晚，语法错误已经在阶段2报了！              │
└─────────────────────────────────────────────────────┘
```

## 🎯 关键发现

### 1. 下划线规则的作用时机

```typescript
// Modern.js 的内部逻辑（伪代码）

async function processBFFFiles() {
  // 阶段 1: 扫描所有文件
  const allFiles = scanDirectory('api/');  // 包括 _clean/
  
  // 阶段 2: 解析语法
  for (const file of allFiles) {
    try {
      parseTypeScript(file);  // ⚠️ 这里会检查装饰器语法！
    } catch (error) {
      throw new Error(`Syntax error in ${file}`);  // ❌ 报错
    }
  }
  
  // 阶段 3: 生成路由（下划线规则在这里！）
  const routes = [];
  for (const file of allFiles) {
    if (!file.startsWith('_')) {  // ✅ 下划线规则
      routes.push(generateRoute(file));
    }
  }
  
  return routes;
}
```

**问题**：下划线规则在**阶段 3**才生效，但语法错误在**阶段 2**就报了！

### 2. 为什么会扫描所有文件？

**原因 1：依赖分析**

```typescript
// api/lambda/chat.ts
import { getContainer } from '../_clean/di-container.js';
//                           ↑
//                    这个 import 导致必须扫描 _clean/
```

Modern.js 需要分析依赖关系，所以必须读取被 import 的文件。

**原因 2：TypeScript 编译**

```
TypeScript 编译器的工作方式：
1. 读取 tsconfig.json
2. 扫描 include 路径下的所有 .ts 文件
3. 构建完整的类型图
4. 检查语法和类型

即使文件不作为路由，也需要参与编译！
```

**原因 3：模块解析**

```typescript
// 如果 Modern.js 使用 webpack 或 esbuild
import xxx from '../_clean/xxx.js'
          ↓
需要解析这个文件才能打包
          ↓
扫描 _clean/ 目录
          ↓
遇到装饰器 → 报错
```

## 📊 对比：下划线规则在不同场景的效果

### 场景 1：普通的工具文件 ✅

```typescript
// api/lambda/_utils/cors.ts
export function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
}
```

**结果**：
- 阶段 1：✅ 被扫描
- 阶段 2：✅ 语法解析通过（普通函数）
- 阶段 3：✅ 下划线规则生效，不作为路由

**结论**：✅ 完美工作

### 场景 2：含装饰器的文件 ❌

```typescript
// api/_clean/infrastructure/metrics.repository.ts
@Repository()  // ← 装饰器
export class InMemoryMetricsRepository {
  constructor() { }
}
```

**结果**：
- 阶段 1：✅ 被扫描
- 阶段 2：❌ **语法解析失败**（装饰器语法错误）
- 阶段 3：❌ 根本到不了这一步

**结论**：❌ 下划线规则来不及生效

## 💡 为什么旧的 services/ 没问题？

```typescript
// api/services/conversationService.ts
export class ConversationService {  // ← 普通类，没有装饰器
  static async createConversation() { }
}
```

**流程**：
- 阶段 1：✅ 被扫描
- 阶段 2：✅ 语法解析通过（没有装饰器）
- 阶段 3：❌ 没有下划线，但由于不在 lambda/ 下，也不会作为直接路由

**关键**：没有装饰器，所以阶段 2 通过了！

## 🔍 深入：为什么装饰器会导致语法错误？

### TypeScript 配置的问题

```json
// 根目录 tsconfig.json （Modern.js 使用的）
{
  "compilerOptions": {
    // ❌ 没有 experimentalDecorators
    // ❌ 没有 emitDecoratorMetadata
  }
}

// api/tsconfig.json （我们配置的）
{
  "compilerOptions": {
    "experimentalDecorators": true,      // ✅ 有
    "emitDecoratorMetadata": true        // ✅ 有
  }
}
```

**问题**：Modern.js 可能使用的是根目录的 `tsconfig.json`！

### 编译上下文的问题

```
Modern.js 的编译流程：
1. 启动时读取根目录 tsconfig.json
2. 扫描项目文件（包括 api/_clean/）
3. 使用统一的编译上下文
4. 遇到装饰器 → 检查 tsconfig → 没有配置 → 报错

即使 api/tsconfig.json 配置了，
但 Modern.js 可能不用这个配置！
```

## 🎯 真正的原因总结

### 为什么下划线规则没有阻止报错？

```
┌─────────────────────────────────────────┐
│ 下划线规则的真正作用：                  │
│ ✅ 阻止文件作为 BFF 路由                │
│ ❌ 不阻止文件被扫描                     │
│ ❌ 不阻止文件被语法检查                 │
│ ❌ 不阻止文件被 TypeScript 编译         │
└─────────────────────────────────────────┘

                 ↓

┌─────────────────────────────────────────┐
│ 装饰器语法错误发生在：                  │
│ TypeScript 语法解析阶段（阶段 2）       │
│                                         │
│ 下划线规则生效在：                      │
│ 路由生成阶段（阶段 3）                  │
│                                         │
│ 时间差！规则来不及生效！                │
└─────────────────────────────────────────┘
```

### 完整的因果链

```
1. Modern.js 启动
   ↓
2. 扫描 api/ 目录（包括 _clean/）
   ↓
3. TypeScript 编译器开始工作
   ↓
4. 读取根目录 tsconfig.json（没有 experimentalDecorators）
   ↓
5. 解析 api/_clean/infrastructure/metrics.repository.ts
   ↓
6. 遇到 @Repository() 装饰器
   ↓
7. 检查编译器配置 → 不支持装饰器
   ↓
8. ❌ 报错：TS1206: Decorators are not valid here
   ↓
9. 编译失败，启动终止
   ↓
10. ❌ 下划线规则根本来不及执行
```

## 💡 解决方案对比

### 方案对比

| 方案 | 原理 | 效果 | 推荐度 |
|------|------|------|--------|
| **使用下划线** | 规避作为路由 | ❌ 不能阻止语法检查 | ⭐ |
| **物理隔离** | 完全移出 api/ | ✅ 不会被扫描 | ⭐（失去 BFF 优势）|
| **改用类装饰器** | 提高兼容性 | ✅ 语法检查通过 | ⭐⭐⭐⭐⭐ |
| **配置根 tsconfig** | 支持装饰器 | ⚠️ 可能影响其他配置 | ⭐⭐⭐ |

### 为什么类装饰器能解决问题？

```typescript
// ❌ 参数装饰器（兼容性差）
@Service()
class MyService {
  constructor(
    @Inject('token') private dep: Dep  // ← 这个装饰器兼容性差
  ) {}
}

// ✅ 类装饰器（兼容性好）
@Service()
@Inject(['token'])  // ← 这个装饰器兼容性好
class MyService {
  constructor(private dep: Dep) {}
}
```

**原因**：
- 类装饰器是 TypeScript 早期就支持的特性
- 参数装饰器是后期添加的，配置要求更严格
- 类装饰器在没有 `emitDecoratorMetadata` 的情况下也能工作

## ✨ 最终结论

### 核心认知

```
下划线规则 ≠ 不扫描
下划线规则 = 不作为路由

扫描 → 语法检查 → [装饰器报错] → 路由生成 → [下划线规则]
                      ↑                        ↑
                   报错点                   规则生效点
                   
时间差导致规则来不及生效！
```

### 为什么会有这个设计？

**合理的设计考虑**：

1. **依赖分析需要**
   - lambda/ 的文件可能 import _utils/
   - 必须扫描才能解析依赖

2. **类型检查需要**
   - TypeScript 需要完整的类型图
   - 必须扫描所有相关文件

3. **打包优化需要**
   - Webpack/esbuild 需要分析整个依赖树
   - 才能做 tree-shaking 和代码分割

**不合理的地方**：

- 没有提供 `exclude` 配置
- 下划线规则的文档说明不清楚
- 扫描和路由生成没有充分解耦

---

**创建时间**：2026-01-02  
**核心发现**：下划线规则只控制"是否作为路由"，不控制"是否扫描和语法检查"  
**解决方案**：改用类装饰器，提高兼容性

