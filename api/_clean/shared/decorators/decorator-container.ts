/**
 * 基于装饰器的依赖注入容器
 * 支持构造函数注入、单例模式、瞬态模式
 */

import 'reflect-metadata';
import { isInjectable, isSingleton, getInjectMetadata } from './injectable.decorator.js';

/**
 * 可作为容器 token 的类型：字符串或类构造函数
 *
 * 说明：
 * - 字符串 token：兼容你现有的 bind('IMetricsRepository', 'InMemoryMetricsRepository') 方式
 * - 构造函数 token：支持基于参数类型（design:paramtypes）自动推断注入
 */
export type Token<T = any> = string | (new (...args: any[]) => T);

/**
 * 依赖注入容器
 */
export class DecoratorContainer {
  // 存储注册的类型
  private registry: Map<Token, any> = new Map();
  
  // 存储单例实例
  private singletons: Map<Token, any> = new Map();

  /**
   * 注册一个类到容器
   * @param token 标识符
   * @param target 目标类
   */
  register<T>(token: Token<T>, target: new (...args: any[]) => T): void {
    if (!isInjectable(target)) {
      throw new Error(`类 ${target.name} 没有使用 @Injectable 装饰器标记`);
    }
    
    this.registry.set(token, target);
    console.log(`✅ 已注册: ${this.formatToken(token)} -> ${target.name}`);
  }

  /**
   * 注册一个接口到具体实现的绑定
   * @param interfaceToken 接口标识符
   * @param implementationToken 实现类标识符
   */
  bind(interfaceToken: Token, implementationToken: Token): void {
    const implementation = this.registry.get(implementationToken);
    if (!implementation) {
      throw new Error(`实现类 ${this.formatToken(implementationToken)} 未注册`);
    }
    
    this.registry.set(interfaceToken, implementation);
    console.log(`🔗 已绑定: ${this.formatToken(interfaceToken)} -> ${this.formatToken(implementationToken)}`);
  }

  /**
   * 解析并获取实例
   * @param token 标识符
   */
  resolve<T>(token: Token<T>): T {
    const target = this.registry.get(token);
    
    if (!target) {
      throw new Error(`未找到注册类型: ${this.formatToken(token)}`);
    }

    // 如果是单例模式且已创建,直接返回
    if (isSingleton(target) && this.singletons.has(token)) {
      return this.singletons.get(token) as T;
    }

    // 创建新实例
    const instance = this.createInstance<T>(target as new (...args: any[]) => T);

    // 如果是单例,保存实例
    if (isSingleton(target)) {
      this.singletons.set(token, instance);
    }

    return instance as T;
  }

  /**
   * 创建类的实例,自动注入依赖
   * @param target 目标类
   */
  private createInstance<T>(target: new (...args: any[]) => T): T {
    // 1) 优先使用类装饰器显式声明的依赖 tokens（兼容现有方案）
    const dependencyTokens = getInjectMetadata(target);
    
    if (dependencyTokens.length === 0) {
      // 2) 尝试基于构造函数参数类型自动推断（需要 emitDecoratorMetadata + reflect-metadata）
      const paramTypes: any[] = Reflect.getMetadata('design:paramtypes', target) || [];

      if (paramTypes.length === 0) {
        // 无依赖,直接创建
        return new target();
      }

      const dependencies = paramTypes.map((paramType, index) => {
        // interface 在运行时会被擦除，通常会变成 Object，无法推断
        if (!paramType || paramType === Object) {
          throw new Error(
            `无法自动推断 ${target.name} 构造函数第 ${index + 1} 个参数的依赖类型。` +
              `原因通常是该参数使用了 interface 类型（运行时会被擦除成 Object）。` +
              `解决方案：` +
              `1) 继续使用 @Inject(['...']) 显式声明；` +
              `2) 把 interface 改为 abstract class 作为注入 token；` +
              `3) 或将参数类型改为具体类（不推荐，会破坏架构分层）。`
          );
        }

        // 允许两种注册方式：
        // - 直接用“类型构造函数”作为 token 注册/绑定
        // - 或者用字符串 token（默认取 paramType.name）注册/绑定
        const byTypeToken: Token = paramType;
        const byNameToken: Token = typeof paramType?.name === 'string' ? paramType.name : String(paramType);

        if (this.registry.has(byTypeToken)) {
          return this.resolve(byTypeToken);
        }
        if (this.registry.has(byNameToken)) {
          return this.resolve(byNameToken);
        }

        throw new Error(
          `自动注入失败：${target.name} 依赖的参数类型 ${this.formatToken(byNameToken)} 未注册。` +
            `请先 container.register/ bind 对应 token。`
        );
      });

      return new target(...dependencies);
    }

    // 解析所有依赖
    const dependencies = dependencyTokens.map(token => {
      return this.resolve(token as Token);
    });

    // 创建实例并注入依赖
    return new target(...dependencies);
  }

  /**
   * 清空所有单例实例(用于测试)
   */
  clearSingletons(): void {
    this.singletons.clear();
  }

  /**
   * 清空整个容器
   */
  clear(): void {
    this.registry.clear();
    this.singletons.clear();
  }

  /**
   * 获取容器状态(用于调试)
   */
  getStatus(): { 
    registeredCount: number, 
    singletonCount: number,
    registered: string[] 
  } {
    return {
      registeredCount: this.registry.size,
      singletonCount: this.singletons.size,
      registered: Array.from(this.registry.keys()).map(k => this.formatToken(k))
    };
  }

  /**
   * 统一格式化 token 便于日志与错误提示
   */
  private formatToken(token: Token): string {
    if (typeof token === 'string') return token;
    return token?.name || '[AnonymousClass]';
  }
}

// 导出全局容器实例
let globalContainer: DecoratorContainer | null = null;

/**
 * 获取全局容器实例
 */
export function getDecoratorContainer(): DecoratorContainer {
  if (!globalContainer) {
    globalContainer = new DecoratorContainer();
    console.log('🚀 装饰器 DI 容器已初始化');
  }
  return globalContainer;
}

