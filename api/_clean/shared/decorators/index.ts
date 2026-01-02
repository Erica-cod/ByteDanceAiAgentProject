/**
 * 装饰器依赖注入系统 - 导出入口
 */

export { 
  Injectable, 
  Inject, 
  Service, 
  Repository,
  Scope,
  isInjectable,
  isSingleton,
  getInjectMetadata
} from './injectable.decorator.js';

export { 
  DecoratorContainer, 
  getDecoratorContainer 
} from './decorator-container.js';

