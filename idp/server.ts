/**
 * 简化版 IdP（路线 A：oidc-provider + Redis Adapter）
 *
 * 启动后可验证：
 * - GET {ISSUER}/.well-known/openid-configuration
 * - GET {ISSUER}/jwks
 *
 * 环境变量（建议写在 .env.local）：
 * - IDP_ISSUER=http://localhost:9000
 * - IDP_PORT=9000
 * - IDP_CLIENT_ID=ai-agent-bff
 * - IDP_CLIENT_SECRET=dev_secret_change_me
 * - IDP_REDIRECT_URIS=http://localhost:8080/api/auth/callback
 *
 * Redis 复用你现有配置：
 * - REDIS_HOST / REDIS_PORT / REDIS_PASSWORD
 */

import './env.js';
import Provider from 'oidc-provider';
import { createRedisClient } from './redis.js';
import { createRedisAdapterFactory } from './redisAdapter.js';
import { page, escapeHtml } from './views.js';
import { createHash } from 'crypto';

const issuer = process.env.IDP_ISSUER || 'http://localhost:9000';
const port = Number.parseInt(process.env.IDP_PORT || new URL(issuer).port || '9000', 10);
const isHttpsIssuer = issuer.startsWith('https://');

const clientId = process.env.IDP_CLIENT_ID || 'ai-agent-bff';
const clientSecret = process.env.IDP_CLIENT_SECRET || 'dev_secret_change_me';
const redirectUris = (process.env.IDP_REDIRECT_URIS || 'http://localhost:8080/api/auth/callback')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const redis = createRedisClient();
await redis.connect();

// 账号（演示版：任意用户名都可登录）
/**
 * **根据用户名生成 accountId（演示）**
 * - 真实系统里通常来自数据库自增 id / UUID / snowflake 等
 * - 这里用 hash 截断，保证同一用户名稳定映射到同一个 accountId
 */
function toAccountId(username: string) {
  return createHash('sha256').update(username).digest('hex').slice(0, 24);
}

const users = new Map<string, { accountId: string; username: string }>();

/**
 * **记录登录相关事件到 Redis（演示用审计/排查）**
 * - 只用于 demo 观察流程：登录成功、触发 step-up、step-up 成功/失败等
 * - 生产环境建议接入统一审计/风控埋点系统，并注意脱敏与采样
 */
async function recordLoginEvent(evt: Record<string, any>) {
  try {
    await redis.lpush('idp:login_events', JSON.stringify({ ...evt, ts: Date.now() }));
    await redis.ltrim('idp:login_events', 0, 999);
  } catch {
    // ignore
  }
}

/**
 * **生成一次性验证码 OTP（演示）**
 * - 这里只生成 6 位数字并直接展示在页面里，方便你本地演示
 * - 生产环境应通过短信/邮件/Authenticator/硬件 key 等渠道下发，并做防爆破限制
 */
function generateOtp() {
  // 演示：6 位数字验证码
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** **OTP 存储 key：按 interaction uid 维度** */
function mfaKey(uid: string) {
  return `idp:mfa:${uid}`;
}

/** **待完成登录上下文 key：按 interaction uid 维度** */
function pendingLoginKey(uid: string) {
  return `idp:pending_login:${uid}`;
}

/**
 * **保存“待完成登录”的临时上下文（用于 step-up / MFA）**
 * - 当新设备触发 OTP 时，先把 accountId/username/deviceIdHash 暂存起来
 * - OTP 验证通过后再从这里取出并完成 `interactionFinished(login)`
 */
async function savePendingLogin(uid: string, data: { accountId: string; username: string; deviceIdHash?: string }) {
  await redis.set(pendingLoginKey(uid), JSON.stringify({ ...data, createdAt: Date.now() }), 'EX', 10 * 60);
}

/**
 * **读取“待完成登录”上下文**
 * - OTP 流程里用于恢复 accountId/username/deviceIdHash
 */
async function loadPendingLogin(uid: string): Promise<{ accountId: string; username: string; deviceIdHash?: string } | null> {
  const raw = await redis.get(pendingLoginKey(uid));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as any;
    return {
      accountId: String(parsed.accountId || ''),
      username: String(parsed.username || ''),
      deviceIdHash: parsed.deviceIdHash ? String(parsed.deviceIdHash) : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * **清理 step-up 相关临时数据**
 * - OTP 成功/失败或超时后都应清理，避免脏数据影响下一次交互
 */
async function clearPendingLogin(uid: string) {
  await redis.del(pendingLoginKey(uid));
  await redis.del(mfaKey(uid));
}

/**
 * **保存 OTP（演示）**
 * - 按 interaction uid 绑定：保证 OTP 只对当前这次登录交互有效
 */
async function saveOtp(uid: string, otp: string) {
  await redis.set(mfaKey(uid), otp, 'EX', 5 * 60); // 5 分钟
}

/** **读取 OTP（演示）** */
async function loadOtp(uid: string) {
  return await redis.get(mfaKey(uid));
}

/**
 * **绑定“账号-设备”关系（风控信号沉淀）**
 * - 当某设备成功登录后，把 deviceIdHash 记为“已见过”
 * - 后续同账号同设备登录就不再触发 step-up（演示：30 天有效）
 */
async function bindDevice(accountId: string, deviceIdHash: string) {
  const key = `idp:account_device:${accountId}:${deviceIdHash}`;
  await redis.set(key, String(Date.now()), 'EX', 30 * 24 * 3600); // 30 天
}

/**
 * **判断该账号是否见过该设备（风控：新设备识别）**
 * - 这里用最简单的：Redis 是否存在绑定 key
 * - 生产环境可以接入更丰富的风险策略（IP、地理位置、行为画像等）
 */
async function hasSeenDevice(accountId: string, deviceIdHash: string) {
  const key = `idp:account_device:${accountId}:${deviceIdHash}`;
  const v = await redis.get(key);
  return !!v;
}

const configuration: Provider.Configuration = {
  adapter: createRedisAdapterFactory(redis),

  // 让 demo 好跑：单个 client
  clients: [
    {
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uris: redirectUris,
      //  RP-Initiated Logout（OIDC end_session_endpoint）
      // BFF 在登出时会携带 id_token_hint，并要求 IdP 清理自己的 session
      post_logout_redirect_uris: [
        process.env.IDP_POST_LOGOUT_REDIRECT_URI || 'http://localhost:8000/api/auth/logout/callback',
      ],
      response_types: ['code'],
      // 注意：oidc-provider 会根据 response_types / scopes 自动推导允许的 grant_types
      // 这里显式配置 refresh_token 反而容易触发 invalid_client_metadata（演示环境先不写 grant_types）
      token_endpoint_auth_method: 'client_secret_basic',
    },
  ],

  // 允许自定义参数透传（例如 deviceIdHash）
  extraParams: ['deviceIdHash', 'returnTo'],

  // scopes（演示）
  scopes: ['openid', 'profile', 'email'],

  // 账号信息
  async findAccount(ctx, id) {
    // id 即 accountId
    const user = [...users.values()].find(u => u.accountId === id);
    const username = user?.username || 'demo';
    return {
      accountId: id,
      async claims() {
        return {
          sub: id,
          preferred_username: username,
          name: username,
        };
      },
    };
  },

  cookies: {
    // 反向代理 + 本地 http 调试时，SameSite=None 会被现代浏览器拒收（必须同时 Secure）
    // 导致 interaction/session 丢失，出现 "interaction session not found"。
    // 这里统一使用 Lax；若 issuer 为 https，则启用 Secure。
    long: { signed: true, sameSite: 'lax', secure: isHttpsIssuer },
    short: { signed: true, sameSite: 'lax', secure: isHttpsIssuer },
    keys: [
      process.env.IDP_COOKIE_KEY_1 || 'dev_cookie_key_1_change_me',
      process.env.IDP_COOKIE_KEY_2 || 'dev_cookie_key_2_change_me',
    ],
  },

  // 开发环境放宽一点，生产建议收紧
  ttl: {
    Session: 7 * 24 * 3600, // 7天
    AuthorizationCode: 10 * 60, // 10分钟
    AccessToken: 15 * 60, // 15分钟
    RefreshToken: 7 * 24 * 3600, // 7天
  },

  features: {
    devInteractions: { enabled: false },
    // ✅ 开启标准的 OIDC RP-Initiated Logout（会暴露 end_session_endpoint，默认路径通常为 /session/end）
    rpInitiatedLogout: { enabled: true },
  },
  // 交互会话丢失时自动回到登录入口，避免用户停留在 invalid_request 错误页
  renderError(ctx, out) {
    const errorDescription = String((out as any)?.error_description || '');
    if (errorDescription.includes('interaction session not found')) {
      ctx.status = 302;
      ctx.redirect('/api/auth/login?returnTo=/');
      return;
    }
    const errorCode = String((out as any)?.error || 'invalid_request');
    const body = `
      <h2>IdP 请求失败</h2>
      <div class="muted">error: <code>${escapeHtml(errorCode)}</code></div>
      <div class="muted">error_description: <code>${escapeHtml(errorDescription || 'unknown')}</code></div>
      <div style="margin-top:16px" class="row">
        <a href="/api/auth/login?returnTo=/" style="text-decoration:none">
          <button type="button">重新登录</button>
        </a>
      </div>
    `;
    ctx.status = Number((out as any)?.status || 400);
    ctx.type = 'html';
    ctx.body = page('IdP 错误', body);
  },
};

/**
 * **创建 OIDC Provider 实例**
 * - `oidc-provider` 会根据 configuration 自动挂载标准协议端点（discovery/JWKS/auth/token 等）
 * - 我们只需要额外实现交互页（interaction）以及账号/风控逻辑
 */
const provider = new Provider(issuer, configuration);

// 自定义交互页（login / consent）
provider.use(async (ctx, next) => {
  // 只拦截 interaction 路由
  if (!ctx.path.startsWith('/interaction/')) return next();
  return next();
});

provider.use(async (ctx, next) => {
  // 如果用户直接访问 /auth/:uid 但缺少交互恢复 cookie，直接回到登录入口重新拉起流程
  if (ctx.method === 'GET' && /^\/auth\/[^/]+$/.test(ctx.path)) {
    const hasResume = !!ctx.cookies.get('_interaction_resume') && !!ctx.cookies.get('_interaction_resume.sig');
    if (!hasResume) {
      ctx.status = 302;
      ctx.redirect('/api/auth/login?returnTo=/');
      return;
    }
  }

  /**
   * **interaction 路由总入口**
   * - `oidc-provider` 遇到需要用户参与的环节，会把用户带到 `/interaction/:uid`
   * - 我们在这里根据 prompt（login/consent）渲染页面，并处理表单提交
   */
  const match = ctx.path.match(/^\/interaction\/([^/]+)(\/.*)?$/);
  if (!match) return next();

  const uid = match[1];
  const rest = match[2] || '';

  // 读取交互详情
  const details = await provider.interactionDetails(ctx.req, ctx.res);
  const { prompt, params } = details;

  const deviceIdHash = String((params as any)?.deviceIdHash || '').slice(0, 128);

  if (ctx.method === 'GET' && rest === '') {
    // 登录页 / 同意页
    if (prompt.name === 'login') {
      // **渲染登录页（演示）**：展示 client_id/redirect_uri/deviceIdHash，并提交 username
      const body = `
        <h2>简化 IdP（演示）登录</h2>
        <div class="muted">本页面是演示用 IdP 的交互页。实际生产请接入真实账号体系与验证码/MFA。</div>
        <form method="post" action="/interaction/${escapeHtml(uid)}/login">
          <div class="kv">
            <div>client_id</div><div><code>${escapeHtml(String((params as any)?.client_id || ''))}</code></div>
            <div>redirect_uri</div><div><code>${escapeHtml(String((params as any)?.redirect_uri || ''))}</code></div>
            <div>deviceIdHash</div><div><code>${escapeHtml(deviceIdHash || '（未提供）')}</code></div>
          </div>
          <div style="margin-top:16px" class="row">
            <input name="username" placeholder="输入用户名（演示）" />
            <button type="submit">登录</button>
          </div>
          <div class="muted" style="margin-top:10px">提示：你可以在 BFF 发起授权时把 deviceIdHash 作为参数透传，用于新设备登录检测。</div>
        </form>
      `;
      ctx.type = 'html';
      ctx.body = page('IdP 登录', body);
      return;
    }

    if (prompt.name === 'consent') {
      // **渲染同意页（演示）**：展示 scope，并让用户同意/拒绝
      const body = `
        <h2>授权确认（演示）</h2>
        <div class="muted">为方便演示，这里默认只展示 scopes，不做复杂同意项管理。</div>
        <div class="kv">
          <div>scopes</div><div><code>${escapeHtml(String((params as any)?.scope || ''))}</code></div>
          <div>deviceIdHash</div><div><code>${escapeHtml(deviceIdHash || '（未提供）')}</code></div>
        </div>
        <form method="post" action="/interaction/${escapeHtml(uid)}/confirm" style="margin-top:16px" class="row">
          <button type="submit">同意并继续</button>
          <button type="submit" name="deny" value="1" class="secondary">拒绝</button>
        </form>
      `;
      ctx.type = 'html';
      ctx.body = page('授权确认', body);
      return;
    }
  }

  if (ctx.method === 'POST' && rest === '/login') {
    // **处理登录表单提交**：创建/查找账号 + 风控判定 + 可能触发 step-up + 结束 login prompt
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      ctx.req.on('data', (c) => chunks.push(Buffer.from(c)));
      ctx.req.on('end', () => resolve());
      ctx.req.on('error', reject);
    });
    const raw = Buffer.concat(chunks).toString('utf-8');
    const form = new URLSearchParams(raw);
    const username = (form.get('username') || '').trim().slice(0, 64) || 'demo';

    const accountId = toAccountId(username);
    users.set(username, { accountId, username });

    // 风控：新设备提示（演示）
    let risk = 'low';
    if (deviceIdHash) {
      const seen = await hasSeenDevice(accountId, deviceIdHash);
      if (!seen) risk = 'medium';
    }

    // ✅ 新设备：强制二次确认（演示）
    if (risk === 'medium') {
      // **进入 step-up**：生成 OTP + 暂存登录上下文，等待 `/mfa` 验证
      const otp = generateOtp();
      await saveOtp(uid, otp);
      await savePendingLogin(uid, { accountId, username, deviceIdHash: deviceIdHash || undefined });
      await recordLoginEvent({
        type: 'login_step_up_required',
        accountId,
        username,
        deviceIdHash: deviceIdHash || undefined,
        risk,
      });

      const body = `
        <h2>二次确认（新设备）</h2>
        <div class="muted">
          检测到这是该账号的<strong>新设备</strong>登录（risk=medium）。为演示账号保护流程，需要输入一次性验证码才能继续。
        </div>
        <div class="kv">
          <div>账号</div><div><code>${escapeHtml(username)}</code></div>
          <div>deviceIdHash</div><div><code>${escapeHtml(deviceIdHash || '（未提供）')}</code></div>
          <div>演示验证码</div><div><code>${escapeHtml(otp)}</code> <span class="muted">（生产环境应通过短信/邮箱/验证码服务下发）</span></div>
        </div>
        <form method="post" action="/interaction/${escapeHtml(uid)}/mfa" style="margin-top:16px" class="row">
          <input name="otp" placeholder="输入 6 位验证码" />
          <button type="submit">验证并继续</button>
        </form>
        <form method="get" action="/interaction/${escapeHtml(uid)}" style="margin-top:12px">
          <button type="submit" class="secondary">返回</button>
        </form>
      `;
      ctx.type = 'html';
      ctx.body = page('二次确认', body);
      return;
    }

    // 低风险：直接登录成功，绑定设备
    if (deviceIdHash) {
      await bindDevice(accountId, deviceIdHash);
    }

    await recordLoginEvent({
      type: 'login',
      accountId,
      username,
      deviceIdHash: deviceIdHash || undefined,
      risk,
    });

    const result = {
      login: { accountId },
    };

    // **结束 login prompt**：交给 oidc-provider 继续后续流程（例如 consent 或直接重定向）
    await provider.interactionFinished(ctx.req, ctx.res, result, { mergeWithLastSubmission: false });
    return;
  }

  if (ctx.method === 'POST' && rest === '/mfa') {
    // **处理 OTP 二次确认提交**：校验 OTP，通过后完成登录并绑定设备
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      ctx.req.on('data', (c) => chunks.push(Buffer.from(c)));
      ctx.req.on('end', () => resolve());
      ctx.req.on('error', reject);
    });
    const raw = Buffer.concat(chunks).toString('utf-8');
    const form = new URLSearchParams(raw);
    const otp = (form.get('otp') || '').trim();

    const expected = await loadOtp(uid);
    const pending = await loadPendingLogin(uid);

    if (!expected || !pending?.accountId) {
      ctx.type = 'html';
      ctx.body = page('二次确认失败', `<h2>二次确认失败</h2><div class="muted">验证码已过期或上下文丢失，请返回重新登录。</div>`);
      return;
    }

    if (otp !== expected) {
      // OTP 不匹配：返回可重试页面（演示）
      await recordLoginEvent({
        type: 'login_step_up_failed',
        accountId: pending.accountId,
        username: pending.username,
        deviceIdHash: pending.deviceIdHash,
        risk: 'medium',
      });
      const body = `
        <h2>二次确认失败</h2>
        <div class="muted">验证码不正确，请重试（演示）。</div>
        <form method="post" action="/interaction/${escapeHtml(uid)}/mfa" style="margin-top:16px" class="row">
          <input name="otp" placeholder="输入 6 位验证码" />
          <button type="submit">重新验证</button>
        </form>
      `;
      ctx.type = 'html';
      ctx.body = page('二次确认失败', body);
      return;
    }

    // 验证成功：绑定设备 + 完成登录
    if (pending.deviceIdHash) {
      await bindDevice(pending.accountId, pending.deviceIdHash);
    }
    await recordLoginEvent({
      type: 'login_step_up_ok',
      accountId: pending.accountId,
      username: pending.username,
      deviceIdHash: pending.deviceIdHash,
      risk: 'medium',
    });

    await clearPendingLogin(uid);

    const result = {
      login: { accountId: pending.accountId },
    };

    // **结束 login prompt（step-up 成功路径）**
    await provider.interactionFinished(ctx.req, ctx.res, result, { mergeWithLastSubmission: false });
    return;
  }

  if (ctx.method === 'POST' && rest === '/confirm') {
    // **处理同意页提交**：用户同意 -> 生成 Grant；用户拒绝 -> 返回 access_denied
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      ctx.req.on('data', (c) => chunks.push(Buffer.from(c)));
      ctx.req.on('end', () => resolve());
      ctx.req.on('error', reject);
    });
    const raw = Buffer.concat(chunks).toString('utf-8');
    const form = new URLSearchParams(raw);
    const deny = form.get('deny') === '1';

    if (deny) {
      // 用户拒绝授权：结束 consent prompt，并返回 OAuth 标准错误
      await provider.interactionFinished(
        ctx.req,
        ctx.res,
        { error: 'access_denied', error_description: '用户拒绝授权（演示）' },
        { mergeWithLastSubmission: false }
      );
      return;
    }

    const grant = new provider.Grant({
      accountId: details.session?.accountId,
      clientId: String((params as any)?.client_id || ''),
    });

    // 演示：允许 openid/profile/email
    grant.addOIDCScope(String((params as any)?.scope || 'openid profile email'));
    const grantId = await grant.save();

    // **结束 consent prompt**：把 grantId 交给 oidc-provider，继续回到 /auth 产生 code
    await provider.interactionFinished(
      ctx.req,
      ctx.res,
      { consent: { grantId } },
      { mergeWithLastSubmission: true }
    );
    return;
  }

  return next();
});

const server = provider.listen(port, () => {
  // 这里输出一行就够了，方便复制访问
  // eslint-disable-next-line no-console
  console.log(` [IdP] OIDC Provider running: ${issuer} (port ${port})`);
});

process.on('SIGINT', async () => {
  // **优雅退出**：关闭 http server + 断开 Redis（方便本地开发）
  server.close(() => {});
  try { await redis.quit(); } catch {}
  process.exit(0);
});


