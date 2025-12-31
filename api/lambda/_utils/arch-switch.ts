/**
 * 架构切换工具
 * 
 * 🎉 Phase 1 完成，已全面启用 Clean Architecture
 * 
 * ⚠️ 特性开关已废弃，现在强制使用新架构
 * 保留此文件仅用于向后兼容，建议在 Phase 2 完成后移除
 */

/**
 * 是否使用 Clean Architecture
 * 
 * ✅ 强制启用新架构（Phase 1 已完成并验证）
 * 
 * 旧代码: export const USE_CLEAN_ARCH = process.env.USE_CLEAN_ARCH !== 'false';
 * 新代码: 强制为 true
 */
export const USE_CLEAN_ARCH = true; // 🎉 Phase 1 完成，全面启用新架构

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

