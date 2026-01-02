/**
 * 装饰器依赖注入系统
 * 类似于 Java 的 Spring @Autowired 和 NestJS 的依赖注入
 */

import 'reflect-metadata';

/**
 * 注入元数据的键
 */
const INJECTABLE_KEY = Symbol('injectable');
const INJECT_KEY = Symbol('inject');
const SINGLETON_KEY = Symbol('singleton');

/**
 * 依赖注入的作用域
 */
export enum Scope {
  SINGLETON = 'singleton', // 单例模式(默认)
  TRANSIENT = 'transient'  // 每次创建新实例
}

/**
 * Injectable 装饰器 - 标记类可被注入
 * @param scope 作用域:单例或瞬态
 * 
 * 使用示例:
 * @Injectable()
 * class UserService { ... }
 * 
 * @Injectable({ scope: Scope.TRANSIENT })
 * class TempService { ... }
 */
export function Injectable(options?: { scope?: Scope }) {
  return function <T extends { new(...args: any[]): {} }>(target: T) {
    // 标记为可注入
    Reflect.defineMetadata(INJECTABLE_KEY, true, target);
    
    // 设置作用域
    const scope = options?.scope || Scope.SINGLETON;
    Reflect.defineMetadata(SINGLETON_KEY, scope === Scope.SINGLETON, target);
    
    return target;
  };
}

/**
 * Inject 装饰器 - 设置类的依赖注入 token
 * 
 * 使用示例:
 * @Service()
 * @Inject(['IUserRepository', 'ILogger'])
 * class UserService {
 *   constructor(private userRepo: IUserRepository, private logger: ILogger) {}
 * }
 */
export function Inject(tokens: string[]) {
  return function <T extends { new(...args: any[]): {} }>(target: T) {
    // 保存依赖 tokens 到类元数据
    Reflect.defineMetadata(INJECT_KEY, tokens, target);
    return target;
  };
}

/**
 * Service 装饰器 - 标记为服务类(语义化的 Injectable)
 * 
 * 使用示例:
 * @Service()
 * class ProductService { ... }
 */
export function Service(options?: { scope?: Scope }) {
  return Injectable(options);
}

/**
 * Repository 装饰器 - 标记为仓储类(语义化的 Injectable)
 * 
 * 使用示例:
 * @Repository()
 * class ProductRepository { ... }
 */
export function Repository(options?: { scope?: Scope }) {
  return Injectable(options);
}

/**
 * 检查类是否可注入
 */
export function isInjectable(target: any): boolean {
  return Reflect.getMetadata(INJECTABLE_KEY, target) === true;
}

/**
 * 检查类是否是单例
 */
export function isSingleton(target: any): boolean {
  return Reflect.getMetadata(SINGLETON_KEY, target) === true;
}

/**
 * 获取类的注入元数据 (依赖 token 数组)
 */
export function getInjectMetadata(target: any): string[] {
  return Reflect.getOwnMetadata(INJECT_KEY, target) || [];
}

