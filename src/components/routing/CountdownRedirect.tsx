import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export type CountdownRedirectProps = {
  /** 多少秒后跳转 */
  seconds?: number;
  /** 跳转目标 */
  to: string;
  /** 是否替换历史记录，默认 true，避免用户后退又回到错误页 */
  replace?: boolean;
  /** 可选：倒计时文案前缀 */
  prefixText?: string;
};

/**
 * 通用倒计时跳转组件：常用于 404/500 等错误页引导回首页。
 */
export const CountdownRedirect: React.FC<CountdownRedirectProps> = ({
  seconds = 5,
  to,
  replace = true,
  prefixText = '即将自动跳转'
}) => {
  const navigate = useNavigate();
  const initial = useMemo(() => Math.max(0, Math.floor(seconds)), [seconds]);
  const [left, setLeft] = useState<number>(initial);

  useEffect(() => {
    setLeft(initial);
  }, [initial]);

  useEffect(() => {
    if (left <= 0) {
      navigate(to, { replace });
      return;
    }

    const timer = window.setInterval(() => {
      setLeft((v) => v - 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [left, navigate, replace, to]);

  return (
    <div style={{ marginTop: 12, color: '#666', fontSize: 14 }}>
      {prefixText}：{left}s（或点击按钮立即跳转）
    </div>
  );
};


