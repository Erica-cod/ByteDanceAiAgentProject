import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

/**
 * 这是一个“最小可用”的路由守卫骨架，先放在这里方便你后续接付费/多等级。
 *
 * 面试时你可以这样讲：
 * - 前端守卫负责体验（引导升级/跳转登录/展示 403），但不作为安全边界
 * - 真正安全边界在后端：所有付费功能接口必须校验权限
 * - 守卫需要处理三态：loading / allowed / denied
 */

export type UserLevel = 'free' | 'pro' | 'admin';

const RANK: Record<UserLevel, number> = { free: 0, pro: 1, admin: 2 };

export function hasLevel(userLevel: UserLevel, needLevel: UserLevel) {
  return RANK[userLevel] >= RANK[needLevel];
}

export type RequireAccessProps = {
  /** 是否正在加载用户信息（例如 /me 请求中） */
  isLoading: boolean;
  /** 当前用户等级；如果你是“免登录系统”，也可以用 deviceId/anonymousId 对应的等级 */
  userLevel?: UserLevel;
  /** 访问所需最低等级 */
  needLevel: UserLevel;
  /** 等级不足跳转到哪里 */
  upgradePath?: string;
  children: React.ReactNode;
};

export const RequireAccess: React.FC<RequireAccessProps> = ({
  isLoading,
  userLevel,
  needLevel,
  upgradePath = '/403',
  children
}) => {
  const location = useLocation();

  if (isLoading) {
    return (
      <div style={{ padding: 24 }}>
        加载中...
      </div>
    );
  }

  // 未识别到用户等级：可以按你的业务改成跳登录/绑定设备页
  if (!userLevel) {
    return <Navigate to="/403" replace state={{ from: location }} />;
  }

  if (!hasLevel(userLevel, needLevel)) {
    // 这里默认跳 403，你也可以改成 /upgrade
    return <Navigate to={upgradePath} replace state={{ from: location }} />;
  }

  return <>{children}</>;
};


