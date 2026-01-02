# 设备清理组件单例模式修复

## 📋 问题描述

**日期**：2026-01-02  
**问题**：设备清理组件被多次实例化，导致大量重复的定期清理任务

### 问题表现

在终端输出中看到大量重复的日志：

```
🧹 Periodic device cleanup started (every hour)
🧹 Periodic device cleanup started (every hour)
🧹 Periodic device cleanup started (every hour)
...（多次重复）

🗑️ Cleaning up expired devices...
✅ No expired devices to clean
🗑️ Cleaning up expired devices...
✅ No expired devices to clean
...（多次重复）
```

### 根本原因

1. **模块级初始化问题**：
   - 在 `api/lambda/device.ts` 中，模块加载时就启动定期清理
   - Modern.js 开发环境的热重载导致模块被多次加载
   - 每次加载都会创建新的定时器

2. **DI 容器策略问题**：
   - `getCleanupExpiredDevicesUseCase()` 每次都返回新实例
   - 没有单例保护，允许创建多个清理任务实例

---

## ✅ 解决方案

### 方案 1：在 Use Case 中添加单例保护

**文件**：`api/_clean/application/use-cases/device/cleanup-expired-devices.use-case.ts`

#### 修改内容

```typescript
export class CleanupExpiredDevicesUseCase {
  // 🔒 单例标志：确保定期清理只启动一次
  private static isPeriodicCleanupStarted = false;
  private static cleanupIntervalId: NodeJS.Timeout | null = null;

  /**
   * 启动定期清理（每小时执行）
   * 🔒 使用单例模式，确保只启动一次
   */
  startPeriodicCleanup(): void {
    // 🔒 如果已经启动，直接返回
    if (CleanupExpiredDevicesUseCase.isPeriodicCleanupStarted) {
      console.log('⚠️ Periodic device cleanup already started, skipping...');
      return;
    }

    // 标记为已启动
    CleanupExpiredDevicesUseCase.isPeriodicCleanupStarted = true;

    // 启动定时器
    CleanupExpiredDevicesUseCase.cleanupIntervalId = setInterval(() => {
      this.execute().catch(err => {
        console.error('❌ Periodic cleanup failed:', err);
      });
    }, 3600000); // 1 小时

    console.log('🧹 Periodic device cleanup started (every hour)');
  }

  /**
   * 停止定期清理（用于测试或优雅关闭）
   */
  stopPeriodicCleanup(): void {
    if (CleanupExpiredDevicesUseCase.cleanupIntervalId) {
      clearInterval(CleanupExpiredDevicesUseCase.cleanupIntervalId);
      CleanupExpiredDevicesUseCase.cleanupIntervalId = null;
      CleanupExpiredDevicesUseCase.isPeriodicCleanupStarted = false;
      console.log('🛑 Periodic device cleanup stopped');
    }
  }
}
```

#### 关键改进

1. **静态标志变量**：
   - `isPeriodicCleanupStarted`：跟踪是否已启动
   - `cleanupIntervalId`：存储定时器 ID，便于停止

2. **启动保护**：
   - 检查标志，如果已启动则跳过
   - 输出警告日志，帮助调试

3. **停止方法**：
   - 提供 `stopPeriodicCleanup()` 方法
   - 用于测试和优雅关闭

---

### 方案 2：在 DI 容器中改为单例

**文件**：`api/_clean/di-container.ts`

#### 修改内容

```typescript
/**
 * 获取或创建 CleanupExpiredDevicesUseCase（单例）
 * 🔒 单例模式：防止创建多个定期清理任务
 */
getCleanupExpiredDevicesUseCase(): CleanupExpiredDevicesUseCase {
  if (!this.instances.has('CleanupExpiredDevicesUseCase')) {
    const repo = this.getDeviceRepository();
    this.instances.set('CleanupExpiredDevicesUseCase', new CleanupExpiredDevicesUseCase(repo));
  }
  return this.instances.get('CleanupExpiredDevicesUseCase');
}
```

#### 关键改进

1. **容器级单例**：
   - 使用 `instances` Map 存储单例
   - 整个应用只有一个 Use Case 实例

2. **双重保护**：
   - Use Case 内部的静态标志
   - 容器的单例管理
   - 双重保险，防止多次启动

---

## 🎯 为什么采用双重保护

### 防御性编程

1. **容器单例**：
   - 确保只创建一个 Use Case 实例
   - 减少内存占用

2. **静态标志**：
   - 即使容器被多次调用，也不会重复启动
   - 防止热重载导致的问题

### 适用场景

这种模式适用于：
- ✅ 定期任务（setInterval）
- ✅ 全局监听器（event listeners）
- ✅ 单例服务（如日志、监控）
- ✅ 资源池（数据库连接池等）

---

## 🔍 验证方法

### 1. 查看启动日志

**预期输出**（只出现一次）：
```
🧹 Periodic device cleanup started (every hour)
```

**如果出现多次**：
```
🧹 Periodic device cleanup started (every hour)
⚠️ Periodic device cleanup already started, skipping...
⚠️ Periodic device cleanup already started, skipping...
```
说明有多次尝试启动，但被单例保护阻止了。

### 2. 监控清理日志

定期清理执行时，应该只看到一组日志：
```
🗑️ Cleaning up expired devices...
✅ No expired devices to clean
```

---

## 📚 最佳实践

### 定期任务的单例模式标准做法

```typescript
export class SomePeriodicTask {
  // 1️⃣ 静态标志，防止多次启动
  private static isStarted = false;
  private static intervalId: NodeJS.Timeout | null = null;

  // 2️⃣ 启动方法带保护
  startPeriodicTask(): void {
    if (SomePeriodicTask.isStarted) {
      console.log('⚠️ Task already started, skipping...');
      return;
    }

    SomePeriodicTask.isStarted = true;
    SomePeriodicTask.intervalId = setInterval(() => {
      this.execute().catch(console.error);
    }, INTERVAL);

    console.log('✅ Task started');
  }

  // 3️⃣ 停止方法，便于清理
  stopPeriodicTask(): void {
    if (SomePeriodicTask.intervalId) {
      clearInterval(SomePeriodicTask.intervalId);
      SomePeriodicTask.intervalId = null;
      SomePeriodicTask.isStarted = false;
      console.log('🛑 Task stopped');
    }
  }

  // 4️⃣ 执行方法
  async execute(): Promise<void> {
    // 实际业务逻辑
  }
}
```

### DI 容器单例配置

```typescript
class Container {
  private instances: Map<string, any> = new Map();

  // ✅ 单例模式
  getSingletonService(): Service {
    if (!this.instances.has('Service')) {
      this.instances.set('Service', new Service());
    }
    return this.instances.get('Service');
  }

  // ❌ 每次新实例（不适合定期任务）
  getTransientService(): Service {
    return new Service();
  }
}
```

---

## 🚨 注意事项

### 1. 避免在模块级初始化

**❌ 错误做法**：
```typescript
// api/lambda/device.ts
const cleanupUseCase = container.getCleanupExpiredDevicesUseCase();
cleanupUseCase.startPeriodicCleanup(); // ❌ 模块加载时立即执行
```

**✅ 正确做法**（如果需要）：
```typescript
// api/lambda/device.ts
let cleanupInitialized = false;

function ensureCleanupStarted() {
  if (!cleanupInitialized) {
    const cleanupUseCase = container.getCleanupExpiredDevicesUseCase();
    cleanupUseCase.startPeriodicCleanup();
    cleanupInitialized = true;
  }
}

export async function post(req: RequestOption) {
  ensureCleanupStarted(); // 首次请求时才启动
  // ... 处理请求
}
```

### 2. 测试时要清理

```typescript
// 测试结束后停止定时器
afterAll(() => {
  const cleanupUseCase = container.getCleanupExpiredDevicesUseCase();
  cleanupUseCase.stopPeriodicCleanup();
});
```

### 3. 优雅关闭

```typescript
// 应用关闭时清理资源
process.on('SIGTERM', () => {
  const cleanupUseCase = container.getCleanupExpiredDevicesUseCase();
  cleanupUseCase.stopPeriodicCleanup();
  process.exit(0);
});
```

---

## 📊 性能影响

### 修复前
- ❌ 10+ 个定时器并发执行
- ❌ 大量重复日志
- ❌ 不必要的 CPU 占用

### 修复后
- ✅ 只有 1 个定时器
- ✅ 日志清晰简洁
- ✅ 资源利用率优化

---

## 🔮 相关改进建议

### 1. 考虑其他清理任务

检查项目中是否有其他类似的定期任务：
- Upload session cleanup
- Agent session cleanup
- Request cache cleanup

### 2. 统一清理管理

考虑创建一个 `CleanupScheduler` 服务：

```typescript
export class CleanupScheduler {
  private static instance: CleanupScheduler;
  private tasks: Map<string, NodeJS.Timeout> = new Map();

  static getInstance(): CleanupScheduler {
    if (!this.instance) {
      this.instance = new CleanupScheduler();
    }
    return this.instance;
  }

  registerTask(name: string, callback: () => Promise<void>, interval: number): void {
    if (this.tasks.has(name)) {
      console.log(`⚠️ Task ${name} already registered`);
      return;
    }

    const intervalId = setInterval(() => {
      callback().catch(err => console.error(`Task ${name} failed:`, err));
    }, interval);

    this.tasks.set(name, intervalId);
    console.log(`✅ Task ${name} registered (every ${interval}ms)`);
  }

  stopAll(): void {
    for (const [name, intervalId] of this.tasks.entries()) {
      clearInterval(intervalId);
      console.log(`🛑 Task ${name} stopped`);
    }
    this.tasks.clear();
  }
}

// 使用
const scheduler = CleanupScheduler.getInstance();
scheduler.registerTask('device-cleanup', async () => {
  await cleanupDevices();
}, 3600000);
```

---

## ✅ 总结

### 修复内容
1. ✅ `CleanupExpiredDevicesUseCase` 添加单例保护
2. ✅ DI 容器改为单例模式
3. ✅ 添加 `stopPeriodicCleanup()` 方法

### 效果
- 🎯 防止多次启动定期清理任务
- 🎯 减少不必要的资源占用
- 🎯 日志输出更加清晰

### 适用范围
- 所有定期任务（cleanup, monitoring, heartbeat）
- 全局单例服务
- 资源密集型操作

---

**状态**：✅ 已修复  
**验证**：重启开发服务器，查看日志确认只启动一次

