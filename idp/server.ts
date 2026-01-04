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

const clientId = process.env.IDP_CLIENT_ID || 'ai-agent-bff';
const clientSecret = process.env.IDP_CLIENT_SECRET || 'dev_secret_change_me';
const redirectUris = (process.env.IDP_REDIRECT_URIS || 'http://localhost:8080/api/auth/callback')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const redis = createRedisClient();
await redis.connect();

// 账号（演示版：任意用户名都可登录）
function toAccountId(username: string) {
  return createHash('sha256').update(username).digest('hex').slice(0, 24);
}

const users = new Map<string, { accountId: string; username: string }>();

async function recordLoginEvent(evt: Record<string, any>) {
  try {
    await redis.lpush('idp:login_events', JSON.stringify({ ...evt, ts: Date.now() }));
    await redis.ltrim('idp:login_events', 0, 999);
  } catch {
    // ignore
  }
}

async function bindDevice(accountId: string, deviceIdHash: string) {
  const key = `idp:account_device:${accountId}:${deviceIdHash}`;
  await redis.set(key, String(Date.now()), 'EX', 30 * 24 * 3600); // 30 天
}

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
    long: { signed: true },
    short: { signed: true },
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
  },
};

const provider = new Provider(issuer, configuration);

// 自定义交互页（login / consent）
provider.use(async (ctx, next) => {
  // 只拦截 interaction 路由
  if (!ctx.path.startsWith('/interaction/')) return next();
  return next();
});

provider.use(async (ctx, next) => {
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

    await provider.interactionFinished(ctx.req, ctx.res, result, { mergeWithLastSubmission: false });
    return;
  }

  if (ctx.method === 'POST' && rest === '/confirm') {
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
  // 这里输出一行就够了，方便你复制访问
  // eslint-disable-next-line no-console
  console.log(`✅ [IdP] OIDC Provider running: ${issuer} (port ${port})`);
});

process.on('SIGINT', async () => {
  server.close(() => {});
  try { await redis.quit(); } catch {}
  process.exit(0);
});


