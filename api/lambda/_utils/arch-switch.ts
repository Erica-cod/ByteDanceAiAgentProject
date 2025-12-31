/**
 * 架构切换工具
 * 支持在旧架构和新 Clean Architecture 之间平滑切换
 */

/**
 * 是否使用 Clean Architecture
 * 通过环境变量 USE_CLEAN_ARCH 控制
 */
export const USE_CLEAN_ARCH = process.env.USE_CLEAN_ARCH === 'true';

/**
 * 架构切换包装器
 * @param oldImplementation 旧架构实现
 * @param newImplementation 新 Clean Architecture 实现
 * @returns 根据环境变量选择的实现结果
 */
export async function withArchSwitch<T>(
  oldImplementation: () => Promise<T>,
  newImplementation: () => Promise<T>
): Promise<T> {
  if (USE_CLEAN_ARCH) {
    console.log('🆕 Using Clean Architecture');
    return newImplementation();
  } else {
    console.log('✅ Using Legacy Architecture');
    return oldImplementation();
  }
}

/**
 * 同步版本的架构切换
 */
export function withArchSwitchSync<T>(
  oldImplementation: () => T,
  newImplementation: () => T
): T {
  return USE_CLEAN_ARCH ? newImplementation() : oldImplementation();
}

