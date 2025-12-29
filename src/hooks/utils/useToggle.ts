import { useState, useCallback } from 'react';

/**
 * 布尔值切换 Hook
 * 简化 boolean 状态的切换操作
 * 
 * @param initialValue - 初始值（默认 false）
 * @returns [value, toggle, setValue]
 * 
 * @example
 * ```tsx
 * // 基础用法
 * const [isOpen, toggleOpen, setIsOpen] = useToggle(false);
 * 
 * return (
 *   <div>
 *     <button onClick={toggleOpen}>切换</button>
 *     <button onClick={() => setIsOpen(true)}>打开</button>
 *     <button onClick={() => setIsOpen(false)}>关闭</button>
 *     {isOpen && <div>内容</div>}
 *   </div>
 * );
 * ```
 * 
 * @example
 * ```tsx
 * // 模态框示例
 * const [isModalOpen, toggleModal] = useToggle(false);
 * 
 * return (
 *   <>
 *     <button onClick={toggleModal}>打开模态框</button>
 *     {isModalOpen && <Modal onClose={toggleModal} />}
 *   </>
 * );
 * ```
 */
export function useToggle(
  initialValue: boolean = false
): [boolean, () => void, (value: boolean) => void] {
  const [value, setValue] = useState<boolean>(initialValue);

  const toggle = useCallback(() => {
    setValue((v) => !v);
  }, []);

  return [value, toggle, setValue];
}

