# 装饰器依赖注入 - 快速入门

## ✅ 已完成的工作

我已经为你的项目实现了一个**装饰器依赖注入系统**，并修改了 **Metrics 模块**作为示例。

### 📁 创建的文件

```
api/_clean/
├── shared/decorators/
│   ├── injectable.decorator.ts    # 装饰器定义 (@Injectable, @Service, @Repository, @Inject)
│   ├── decorator-container.ts     # DI 容器实现
│   ├── index.ts                   # 导出入口
│   └── README.md                  # 详细文档
└── examples/
    └── decorator-di-example.ts    # 完整示例代码
```

### 🔧 修改的模块 - Metrics

已将 Metrics 模块改造为使用装饰器注入（改动最小，不影响其他模块）：

#### 修改的文件：
- ✅ `infrastructure/repositories/metrics.repository.ts` - 添加 `@Repository()` 装饰器
- ✅ `application/use-cases/metrics/record-metric.use-case.ts` - 添加 `@Service()` 和 `@Inject()`
- ✅ `application/use-cases/metrics/get-metrics-snapshot.use-case.ts` - 添加装饰器
- ✅ `application/use-cases/metrics/reset-metrics.use-case.ts` - 添加装饰器

## 🚀 快速开始

### 1️⃣ 安装依赖

```bash
npm install reflect-metadata
```

### 2️⃣ 运行示例

```bash
cd api/_clean
npx tsx examples/decorator-di-example.ts
```

你将看到完整的装饰器注入演示！

### 3️⃣ 代码示例

#### 传统方式 (现有的 di-container.ts)

```typescript
// ❌ 需要手动写工厂方法
class SimpleContainer {
  getMetricsRepository(): IMetricsRepository {
    if (!this.instances.has('MetricsRepository')) {
      this.instances.set('MetricsRepository', new InMemoryMetricsRepository());
    }
    return this.instances.get('MetricsRepository');
  }
  
  getRecordMetricUseCase(): RecordMetricUseCase {
    const repo = this.getMetricsRepository(); // 手动获取依赖
    return new RecordMetricUseCase(repo);     // 手动注入
  }
}
```

#### 装饰器方式 (新的 decorator-container.ts)

```typescript
// ✅ 使用装饰器，自动注入
@Repository()
class InMemoryMetricsRepository implements IMetricsRepository {
  // ... 实现
}

@Service()
@Inject(['IMetricsRepository'])
class RecordMetricUseCase {
  constructor(private repo: IMetricsRepository) {}
  // ... 实现
}

// 只需注册，无需写工厂方法
const container = getDecoratorContainer();
container.register('InMemoryMetricsRepository', InMemoryMetricsRepository);
container.bind('IMetricsRepository', 'InMemoryMetricsRepository');
container.register('RecordMetricUseCase', RecordMetricUseCase);

// 自动解析和注入！
const useCase = container.resolve<RecordMetricUseCase>('RecordMetricUseCase');
```

## 📚 核心装饰器

| 装饰器 | 作用 | 示例 |
|--------|------|------|
| `@Repository()` | 标记仓储类 | `@Repository() class UserRepo {}` |
| `@Service()` | 标记服务类 | `@Service() class UserService {}` |
| `@Injectable()` | 标记可注入类 | `@Injectable() class MyClass {}` |
| `@Inject(tokens)` | 声明依赖数组 | `@Inject(['IUserRepo'])` |

## 🎯 完整使用流程

### 步骤 1: 定义接口

```typescript
// application/interfaces/repositories/user.repository.interface.ts
export interface IUserRepository {
  findById(id: string): Promise<User | null>;
}
```

### 步骤 2: 实现仓储（添加装饰器）

```typescript
// infrastructure/repositories/user.repository.ts
import { Repository } from '../../shared/decorators/index.js';

@Repository() // ✨ 添加装饰器
export class MongoUserRepository implements IUserRepository {
  async findById(id: string): Promise<User | null> {
    // ... 实现
  }
}
```

### 步骤 3: 实现服务（注入依赖）

```typescript
// application/use-cases/user/get-user.use-case.ts
import { Service, Inject } from '../../../shared/decorators/index.js';

@Service() // ✨ 标记为服务
export class GetUserUseCase {
  constructor(
    @Inject('IUserRepository') // ✨ 自动注入
    private userRepo: IUserRepository
  ) {}
  
  async execute(id: string): Promise<User | null> {
    return this.userRepo.findById(id);
  }
}
```

### 步骤 4: 注册和使用

```typescript
import { getDecoratorContainer } from './shared/decorators/index.js';

const container = getDecoratorContainer();

// 注册
container.register('MongoUserRepository', MongoUserRepository);
container.bind('IUserRepository', 'MongoUserRepository');
container.register('GetUserUseCase', GetUserUseCase);

// 使用（容器会自动根据 @Inject 声明的 token 数组注入依赖）
const getUserUseCase = container.resolve<GetUserUseCase>('GetUserUseCase');
const user = await getUserUseCase.execute('user-123');
```

## 💡 优势对比

### ✅ 装饰器方式的优点：

1. **声明式** - 代码更清晰，意图明确
2. **自动化** - 容器自动管理依赖关系
3. **类型安全** - TypeScript 提供完整类型支持
4. **易于测试** - 方便模拟和替换依赖
5. **标准化** - 类似 Java Spring 和 NestJS
6. **减少样板代码** - 无需为每个类写工厂方法

### 🔧 传统方式的特点：

1. **简单直接** - 无需额外依赖
2. **显式控制** - 完全手动管理
3. **灵活** - 可以自由定制

## 🔍 查看修改内容

### Metrics Repository (仓储层)

```typescript
// api/_clean/infrastructure/repositories/metrics.repository.ts

@Repository() // ✅ 添加这一行
export class InMemoryMetricsRepository implements IMetricsRepository {
  // ... 原有代码不变
}
```

### Record Metric UseCase (应用层)

```typescript
// api/_clean/application/use-cases/metrics/record-metric.use-case.ts

@Service() // ✅ 添加这一行
@Inject(['IMetricsRepository']) // ✅ 添加这一行（声明依赖）
export class RecordMetricUseCase {
  constructor(
    private metricsRepository: IMetricsRepository
  ) {}
  // ... 原有代码不变
}
```

## 📊 影响范围

### ✅ 零影响
- **现有代码继续工作** - 传统的 `di-container.ts` 完全不受影响
- **可选使用** - 可以选择性地迁移模块
- **向后兼容** - 新旧方式可以共存

### 🎯 修改的模块
- **仅 Metrics 模块** - 最独立、影响最小的模块
- 其他模块保持不变

## 🧪 测试建议

运行示例代码验证功能：

```bash
# 1. 安装依赖
npm install reflect-metadata

# 2. 运行示例
cd api/_clean
npx tsx examples/decorator-di-example.ts

# 你将看到：
# ✅ 容器初始化
# ✅ 依赖注册
# ✅ 自动注入
# ✅ 业务执行
# ✅ 指标统计
# ✅ 单例验证
```

## 📖 详细文档

查看完整文档：
- `api/_clean/shared/decorators/README.md` - 详细使用指南
- `api/_clean/examples/decorator-di-example.ts` - 可运行的示例

## 🤔 常见问题

### Q: 需要修改现有代码吗？
**A:** 不需要！现有的 `di-container.ts` 继续工作，装饰器方式是可选的。

### Q: 性能如何？
**A:** 单例模式下性能优秀，与传统方式相当。

### Q: 如何选择使用方式？
**A:** 
- 新模块推荐使用装饰器（更现代）
- 核心模块保持现有方式（稳定性优先）
- 可以逐步迁移，不强制一次性切换

### Q: 是否类似 Java Spring？
**A:** 是的！装饰器注入的设计灵感来自 Java Spring 的 `@Autowired` 和 NestJS 的依赖注入。

---

## 🎉 总结

你现在有两种依赖注入方式可供选择：

1. **传统方式** (`di-container.ts`) - 简单直接，适合稳定模块
2. **装饰器方式** (`decorators/`) - 现代优雅，适合新模块

两种方式可以共存，根据需要选择使用！

**建议**：先运行示例代码，体验装饰器注入的便利性，再决定是否迁移其他模块。

```bash
npm install reflect-metadata
cd api/_clean
npx tsx examples/decorator-di-example.ts
```

祝你开发愉快！🚀

