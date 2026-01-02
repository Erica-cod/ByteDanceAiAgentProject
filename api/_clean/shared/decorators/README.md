# 装饰器依赖注入系统

这是一个类似于 Java Spring 和 NestJS 的装饰器依赖注入系统，让 TypeScript 后端开发更加优雅。

## 📋 目录

- [快速开始](#快速开始)
- [核心概念](#核心概念)
- [装饰器说明](#装饰器说明)
- [使用示例](#使用示例)
- [与传统方式对比](#与传统方式对比)
- [最佳实践](#最佳实践)

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install reflect-metadata
```

### 2. 标记可注入的类

```typescript
import { Repository, Service, Inject } from './decorators/index.js';

// 标记仓储类
@Repository()
class UserRepository implements IUserRepository {
  // ... 实现代码
}

// 标记服务类，并声明依赖
@Service()
@Inject(['IUserRepository'])
class UserService {
  constructor(
    private userRepo: IUserRepository
  ) {}
  
  async getUser(id: string) {
    return this.userRepo.findById(id);
  }
}
```

### 3. 注册和使用

```typescript
import { getDecoratorContainer } from './decorators/index.js';

// 获取容器
const container = getDecoratorContainer();

// 注册类型
container.register('UserRepository', UserRepository);
container.bind('IUserRepository', 'UserRepository');
container.register('UserService', UserService);

// 解析使用（自动注入依赖）
const userService = container.resolve<UserService>('UserService');
const user = await userService.getUser('123');
```

## 🧠 自动推断注入（基于构造函数参数类型）

本项目的容器支持两种注入方式：

- **显式注入（推荐，兼容性最好）**：使用 `@Inject(['Token'])` 写在类上（你现在默认用的方式）
- **自动推断注入**：不写 `@Inject(...)`，容器通过 `reflect-metadata` 读取构造函数参数类型（`design:paramtypes`）来自动注入

### ✅ 自动推断的前置条件（很重要）

要让“按参数类型自动推断”工作，需要满足：

- **tsconfig 开启**：`experimentalDecorators: true`（允许装饰器语法）
- **tsconfig 开启**：`emitDecoratorMetadata: true`（生成参数类型元数据）
- **运行时引入**：`reflect-metadata`（本项目已在装饰器实现内部 `import 'reflect-metadata'`）

### ⚠️ 重大限制：interface 无法自动推断

TypeScript 的 **interface 在运行时会被擦除**。即使开启了 `emitDecoratorMetadata`，构造函数参数如果标注为 interface，运行时通常也只会变成 `Object`，容器无法知道该注入谁。

因此如果你坚持 Clean Architecture（依赖抽象而不是具体实现），推荐两种做法：

1. **继续用显式 token（最稳）**：`@Inject(['IMetricsRepository'])`
2. **把 interface 改为 abstract class 当作 token**：abstract class 在运行时是存在的，可以被推断

### 示例：使用 abstract class 实现自动推断

#### 1) 用 abstract class 作为“接口”

```typescript
export abstract class MetricsRepositoryPort {
  abstract save(): Promise<void>;
}
```

#### 2) 实现类与 UseCase

```typescript
import { Repository, Service } from './decorators/index.js';

@Repository()
export class InMemoryMetricsRepository implements MetricsRepositoryPort {
  async save() {}
}

@Service()
export class RecordMetricUseCase {
  constructor(private repo: MetricsRepositoryPort) {}
}
```

#### 3) 注册与绑定（用“构造函数 token”）

```typescript
container.register(InMemoryMetricsRepository, InMemoryMetricsRepository);
container.bind(MetricsRepositoryPort, InMemoryMetricsRepository);
container.register(RecordMetricUseCase, RecordMetricUseCase);

const useCase = container.resolve<RecordMetricUseCase>(RecordMetricUseCase);
```

## 📚 核心概念

### 依赖注入容器 (DecoratorContainer)

容器负责管理所有注册的类型和实例，提供以下功能：

- **注册 (register)**: 将类注册到容器
- **绑定 (bind)**: 将接口绑定到具体实现
- **解析 (resolve)**: 获取实例（自动注入依赖）
- **生命周期管理**: 支持单例和瞬态模式

### 生命周期作用域

| 作用域 | 说明 | 使用场景 |
|--------|------|----------|
| `Scope.SINGLETON` | 单例模式（默认） | Repository, 工具类 |
| `Scope.TRANSIENT` | 瞬态模式（每次创建新实例） | UseCase, Service |

## 🎯 装饰器说明

### @Injectable(options?)

最基础的装饰器，标记类可被注入。

```typescript
@Injectable()
class MyService { }

// 指定作用域
@Injectable({ scope: Scope.TRANSIENT })
class TempService { }
```

### @Service(options?)

语义化装饰器，标记服务类（等同于 @Injectable）。

```typescript
@Service()
class UserService { 
  // 业务逻辑
}
```

### @Repository(options?)

语义化装饰器，标记仓储类（等同于 @Injectable）。

```typescript
@Repository()
class UserRepository { 
  // 数据访问逻辑
}
```

### @Inject(tokens: string[])

声明类的依赖注入 token 数组（类装饰器）。

```typescript
@Service()
@Inject(['IUserRepository', 'ILogger'])
class UserService {
  constructor(
    private userRepo: IUserRepository,
    private logger: ILogger
  ) {}
}
```

## 💡 使用示例

### 完整示例：Metrics 模块

#### 1. 定义仓储接口

```typescript
// application/interfaces/repositories/metrics.repository.interface.ts
export interface IMetricsRepository {
  getInstance(): Promise<MetricsEntity>;
  save(metrics: MetricsEntity): Promise<void>;
}
```

#### 2. 实现仓储类（添加装饰器）

```typescript
// infrastructure/repositories/metrics.repository.ts
import { Repository } from '../../shared/decorators/index.js';

@Repository() // ✅ 使用装饰器标记
export class InMemoryMetricsRepository implements IMetricsRepository {
  async getInstance(): Promise<MetricsEntity> {
    // ... 实现
  }
  
  async save(metrics: MetricsEntity): Promise<void> {
    // ... 实现
  }
}
```

#### 3. 实现服务类（使用依赖注入）

```typescript
// application/use-cases/metrics/record-metric.use-case.ts
import { Service, Inject } from '../../../shared/decorators/index.js';

@Service() // ✅ 标记为服务
@Inject(['IMetricsRepository']) // ✅ 声明依赖
export class RecordMetricUseCase {
  constructor(
    private metricsRepository: IMetricsRepository
  ) {}
  
  async execute(params: RecordMetricParams): Promise<void> {
    const metrics = await this.metricsRepository.getInstance();
    // ... 业务逻辑
  }
}
```

#### 4. 注册和使用

```typescript
import { getDecoratorContainer } from './shared/decorators/index.js';
import { InMemoryMetricsRepository } from './infrastructure/repositories/metrics.repository.js';
import { RecordMetricUseCase } from './application/use-cases/metrics/record-metric.use-case.js';

// 获取容器
const container = getDecoratorContainer();

// 注册
container.register('InMemoryMetricsRepository', InMemoryMetricsRepository);
container.bind('IMetricsRepository', 'InMemoryMetricsRepository');
container.register('RecordMetricUseCase', RecordMetricUseCase);

// 使用（容器会自动注入 IMetricsRepository）
const recordMetricUseCase = container.resolve<RecordMetricUseCase>('RecordMetricUseCase');
await recordMetricUseCase.execute({ type: 'sse_connection' });
```

## 🔄 与传统方式对比

### 传统方式 (di-container.ts)

```typescript
// 手动创建和注入依赖
class SimpleContainer {
  getMetricsRepository(): IMetricsRepository {
    if (!this.instances.has('MetricsRepository')) {
      this.instances.set('MetricsRepository', new InMemoryMetricsRepository());
    }
    return this.instances.get('MetricsRepository');
  }
  
  getRecordMetricUseCase(): RecordMetricUseCase {
    const repo = this.getMetricsRepository(); // 手动获取依赖
    return new RecordMetricUseCase(repo);    // 手动注入
  }
}
```

**缺点**：
- ❌ 需要为每个类写工厂方法
- ❌ 依赖关系不清晰
- ❌ 代码冗余，难以维护

### 装饰器方式 (decorator-container.ts)

```typescript
// 使用装饰器声明依赖
@Repository()
class InMemoryMetricsRepository implements IMetricsRepository { }

@Service()
class RecordMetricUseCase {
  constructor(
    @Inject('IMetricsRepository') private repo: IMetricsRepository
  ) {}
}

// 只需注册，不需要写工厂方法
container.register('InMemoryMetricsRepository', InMemoryMetricsRepository);
container.bind('IMetricsRepository', 'InMemoryMetricsRepository');
container.register('RecordMetricUseCase', RecordMetricUseCase);

// 自动解析和注入
const useCase = container.resolve<RecordMetricUseCase>('RecordMetricUseCase');
```

**优点**：
- ✅ 声明式依赖注入，代码更清晰
- ✅ 类似 Java Spring 和 NestJS 的开发体验
- ✅ 自动管理依赖关系和生命周期
- ✅ 支持单例和瞬态作用域
- ✅ 便于测试和模拟依赖
- ✅ 无需为每个类写工厂方法

## 🎯 最佳实践

### 1. 命名规范

- 接口使用 `I` 前缀：`IUserRepository`
- 实现类使用描述性名称：`MongoUserRepository`
- Token 使用接口名：`'IUserRepository'`

### 2. 作用域选择

```typescript
// Repository 使用单例（默认）
@Repository()
class UserRepository { }

// UseCase 使用瞬态（每次创建新实例）
@Service({ scope: Scope.TRANSIENT })
class CreateUserUseCase { }
```

### 3. 依赖注入顺序

构造函数参数按依赖重要性排序：

```typescript
@Service()
@Inject(['IUserRepository', 'ILogger', 'ICache'])
class UserService {
  constructor(
    private userRepo: IUserRepository,  // 主要依赖
    private logger: ILogger,            // 次要依赖
    private cache: ICache               // 可选依赖
  ) {}
}

// 注意：依赖数组顺序必须与构造函数参数顺序一致
```

### 4. 测试友好

装饰器注入让测试更简单：

```typescript
// 测试时可以轻松替换依赖
const mockRepo: IUserRepository = {
  findById: jest.fn(),
  // ...
};

container.register('MockUserRepository', () => mockRepo);
container.bind('IUserRepository', 'MockUserRepository');
```

## 🧪 运行示例

项目包含完整的示例代码：

```bash
cd api/_clean
npx tsx examples/decorator-di-example.ts
```

示例展示了：
- ✓ 容器初始化
- ✓ 依赖注册和绑定
- ✓ 自动依赖注入
- ✓ 业务逻辑执行
- ✓ 单例模式验证

## 📦 项目结构

```
api/_clean/
├── shared/
│   └── decorators/
│       ├── injectable.decorator.ts      # 装饰器定义
│       ├── decorator-container.ts       # DI 容器
│       ├── index.ts                     # 导出入口
│       └── README.md                    # 本文档
├── domain/
│   └── entities/                        # 实体类
├── application/
│   ├── interfaces/                      # 接口定义
│   └── use-cases/                       # 业务用例（使用装饰器）
├── infrastructure/
│   └── repositories/                    # 仓储实现（使用装饰器）
└── examples/
    └── decorator-di-example.ts          # 完整示例
```

## 🔗 相关技术

- [Reflect Metadata](https://github.com/rbuckton/reflect-metadata) - 元数据反射 API
- [TypeScript Decorators](https://www.typescriptlang.org/docs/handbook/decorators.html) - 装饰器语法
- [NestJS](https://nestjs.com/) - 参考的主要框架
- [Spring Framework](https://spring.io/) - 依赖注入理念

## ❓ 常见问题

### Q: 为什么需要 reflect-metadata？
A: TypeScript 的装饰器需要运行时元数据支持，reflect-metadata 提供了这个能力。

### Q: 装饰器和传统 DI 容器可以共存吗？
A: 可以！现有的 `di-container.ts` 可以继续使用，装饰器方式作为可选方案。

### Q: 性能如何？
A: 单例模式下性能优秀，瞬态模式会有少量创建开销，但可忽略不计。

### Q: 如何选择使用哪种方式？
A: 
- 新模块优先使用装饰器（更现代）
- 核心模块保持现有方式（稳定性）
- 逐步迁移，不强制一次性切换

---

**作者**: ByteDance AI Agent Project Team  
**更新时间**: 2026-01-02

