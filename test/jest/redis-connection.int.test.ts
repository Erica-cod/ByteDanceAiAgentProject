/**
 * Redis 连接 - 集成测试
 *
 * 运行方式：
 * - npm run test:integration
 *
 * 说明：
 * - 若本机 Redis 不可用，则自动跳过（不让 CI/本地无 Redis 的同学被卡住）
 */

import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { join } from 'path';

function loadEnv() {
  const root = process.cwd();
  const envLocal = join(root, '.env.local');
  if (existsSync(envLocal)) dotenv.config({ path: envLocal });
  else dotenv.config();
}

describe('redis-client integration', () => {
  beforeAll(() => {
    loadEnv();
  });

  test('ping + set/get', async () => {
    const { isRedisAvailable, getRedisClient, closeRedisClient } = await import(
      '../../api/_clean/infrastructure/cache/redis-client.js'
    );

    const ok = await isRedisAvailable();
    if (!ok) {
      // eslint-disable-next-line no-console
      console.warn('Redis 不可用，跳过 redis 集成测试');
      return;
    }

    const client = getRedisClient();
    const key = `test:jest:redis:${Date.now()}`;
    await client.set(key, 'ok', 'EX', 10);
    const val = await client.get(key);
    expect(val).toBe('ok');

    await closeRedisClient();
  });
});


