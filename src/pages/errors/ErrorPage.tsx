import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CountdownRedirect } from '../../components/routing/CountdownRedirect';

export type ErrorCode = 400 | 403 | 404 | 500;

const DEFAULT_TITLES: Record<ErrorCode, string> = {
  400: '请求有误（400）',
  403: '无权限访问（403）',
  404: '页面不存在（404）',
  500: '服务异常（500）'
};

const DEFAULT_DESCRIPTIONS: Record<ErrorCode, string> = {
  400: '你提交的请求参数可能不完整或不符合要求。',
  403: '当前账号没有访问此页面/功能的权限。',
  404: '你访问的页面不存在，可能链接已失效或路径填写错误。',
  500: '服务暂时出现问题，请稍后重试。'
};

export type ErrorPageProps = {
  code: ErrorCode;
  title?: string;
  description?: string;
  /** 自动跳转地址，默认回到首页 */
  redirectTo?: string;
  /** 倒计时秒数，默认 5 秒 */
  redirectSeconds?: number;
  /** 是否显示“立即跳转”按钮，默认 true */
  showGoButton?: boolean;
};

export const ErrorPage: React.FC<ErrorPageProps> = ({
  code,
  title,
  description,
  redirectTo = '/',
  redirectSeconds = 5,
  showGoButton = true
}) => {
  const navigate = useNavigate();
  const finalTitle = title ?? DEFAULT_TITLES[code];
  const finalDesc = description ?? DEFAULT_DESCRIPTIONS[code];

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      background: '#fafafa'
    }}>
      <div style={{
        width: 'min(720px, 100%)',
        background: '#fff',
        border: '1px solid #eee',
        borderRadius: 12,
        padding: 24
      }}>
        <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: 1 }}>
          {code}
        </div>

        <div style={{ marginTop: 8, fontSize: 20, fontWeight: 700 }}>
          {finalTitle}
        </div>

        <div style={{ marginTop: 8, color: '#444', lineHeight: 1.7 }}>
          {finalDesc}
        </div>

        {showGoButton && (
          <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              onClick={() => navigate(redirectTo, { replace: true })}
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #ddd',
                background: '#111',
                color: '#fff',
                cursor: 'pointer'
              }}
            >
              立即跳转
            </button>

            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                border: '1px solid #ddd',
                background: '#fff',
                cursor: 'pointer'
              }}
            >
              刷新页面
            </button>
          </div>
        )}

        <CountdownRedirect seconds={redirectSeconds} to={redirectTo} />
      </div>
    </div>
  );
};


