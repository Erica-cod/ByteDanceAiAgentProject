/**
 * oidc-provider Redis Adapter（最小可用实现）
 *
 * 目标：
 * - 使用 Redis 存 OIDC 的各类实体（Session / AuthorizationCode / RefreshToken / AccessToken / Grant ...）
 * - 支持 revokeByGrantId / findByUid / findByUserCode 等索引能力
 *
 * 说明：
 * - 本实现用于“演示/开发”，但结构上已满足生产落地的关键点（TTL、索引、撤销）
 * - 如需更强一致性，可把索引写入放到 Lua 脚本事务里
 */

import type Redis from 'ioredis';

type StoredValue = {
  payload: any;
  expiresAt?: number; // ms
  consumed?: number; // ms
};

function msFromNow(expiresIn: number) {
  return Date.now() + expiresIn * 1000;
}

function keyFor(model: string, id: string) {
  return `oidc:${model}:${id}`;
}

function grantIndexKey(grantId: string) {
  return `oidc:grant:${grantId}`;
}

function uidIndexKey(model: string, uid: string) {
  return `oidc:uid:${model}:${uid}`;
}

function userCodeIndexKey(model: string, userCode: string) {
  return `oidc:usercode:${model}:${userCode}`;
}

async function readStored(redis: Redis, key: string): Promise<StoredValue | null> {
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredValue;
  } catch {
    return null;
  }
}

async function writeStored(redis: Redis, key: string, value: StoredValue, expiresIn?: number) {
  const raw = JSON.stringify(value);
  if (expiresIn && expiresIn > 0) {
    await redis.set(key, raw, 'EX', expiresIn);
  } else {
    await redis.set(key, raw);
  }
}

export function createRedisAdapterFactory(redis: Redis) {
  return class RedisAdapter {
    name: string;

    constructor(name: string) {
      this.name = name;
    }

    async upsert(id: string, payload: any, expiresIn: number) {
      const key = keyFor(this.name, id);
      const value: StoredValue = {
        payload,
        expiresAt: expiresIn ? msFromNow(expiresIn) : undefined,
        consumed: payload?.consumed ? Date.now() : undefined,
      };

      await writeStored(redis, key, value, expiresIn);

      // grantId 索引（用于 revokeByGrantId）
      const grantId = payload?.grantId;
      if (grantId) {
        await redis.sadd(grantIndexKey(grantId), key);
        if (expiresIn && expiresIn > 0) await redis.expire(grantIndexKey(grantId), expiresIn);
      }

      // uid / userCode 索引（用于 findByUid / findByUserCode）
      const uid = payload?.uid;
      if (uid) {
        await redis.set(uidIndexKey(this.name, uid), key, 'EX', expiresIn);
      }
      const userCode = payload?.userCode;
      if (userCode) {
        await redis.set(userCodeIndexKey(this.name, userCode), key, 'EX', expiresIn);
      }
    }

    async find(id: string) {
      const key = keyFor(this.name, id);
      const stored = await readStored(redis, key);
      if (!stored) return undefined;
      const payload = stored.payload || undefined;
      if (!payload) return undefined;
      if (stored.consumed) payload.consumed = stored.consumed;
      return payload;
    }

    async findByUid(uid: string) {
      const indexKey = uidIndexKey(this.name, uid);
      const key = await redis.get(indexKey);
      if (!key) return undefined;
      const stored = await readStored(redis, key);
      if (!stored?.payload) return undefined;
      const payload = stored.payload;
      if (stored.consumed) payload.consumed = stored.consumed;
      return payload;
    }

    async findByUserCode(userCode: string) {
      const indexKey = userCodeIndexKey(this.name, userCode);
      const key = await redis.get(indexKey);
      if (!key) return undefined;
      const stored = await readStored(redis, key);
      if (!stored?.payload) return undefined;
      const payload = stored.payload;
      if (stored.consumed) payload.consumed = stored.consumed;
      return payload;
    }

    async destroy(id: string) {
      const key = keyFor(this.name, id);
      const stored = await readStored(redis, key);
      await redis.del(key);

      // 尝试清理索引（可选；过期也会自然清理）
      const grantId = stored?.payload?.grantId;
      if (grantId) {
        await redis.srem(grantIndexKey(grantId), key);
      }

      const uid = stored?.payload?.uid;
      if (uid) await redis.del(uidIndexKey(this.name, uid));
      const userCode = stored?.payload?.userCode;
      if (userCode) await redis.del(userCodeIndexKey(this.name, userCode));
    }

    async consume(id: string) {
      const key = keyFor(this.name, id);
      const stored = await readStored(redis, key);
      if (!stored?.payload) return;
      stored.consumed = Date.now();
      // 尽量保留原 TTL：使用 pttl 获取剩余时间
      const pttl = await redis.pttl(key);
      if (pttl > 0) {
        await redis.set(key, JSON.stringify(stored), 'PX', pttl);
      } else {
        await redis.set(key, JSON.stringify(stored));
      }
    }

    async revokeByGrantId(grantId: string) {
      const idxKey = grantIndexKey(grantId);
      const keys = await redis.smembers(idxKey);
      if (!keys.length) return;
      await redis.del(...keys);
      await redis.del(idxKey);
    }
  };
}


