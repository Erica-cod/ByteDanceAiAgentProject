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

/**
 * **把 `expiresIn(秒)` 转成“未来的时间戳(ms)”**
 * - 仅用于调试/观测（我们仍然依赖 Redis 的 EX/PX 来做真实 TTL）
 */
function msFromNow(expiresIn: number) {
  return Date.now() + expiresIn * 1000;
}

/**
 * **OIDC 实体主键**
 * - `model` 由 oidc-provider 传入，例如 Session / AuthorizationCode / AccessToken 等
 * - `id` 是实体唯一 id
 */
function keyFor(model: string, id: string) {
  return `oidc:${model}:${id}`;
}

/**
 * **grantId -> keys 的索引集合 key**
 * - 用于 `revokeByGrantId(grantId)`：撤销某次授权下签发的所有实体（code/token 等）
 */
function grantIndexKey(grantId: string) {
  return `oidc:grant:${grantId}`;
}

/**
 * **uid -> key 的索引 key**
 * - 某些模型（如 DeviceCode）会用 uid 来查找实体
 * - 我们把 uid 映射到主键 key，便于 `findByUid`
 */
function uidIndexKey(model: string, uid: string) {
  return `oidc:uid:${model}:${uid}`;
}

/**
 * **userCode -> key 的索引 key**
 * - 某些模型（如 DeviceCode）会用 userCode 来查找实体
 * - 我们把 userCode 映射到主键 key，便于 `findByUserCode`
 */
function userCodeIndexKey(model: string, userCode: string) {
  return `oidc:usercode:${model}:${userCode}`;
}

/**
 * **从 Redis 读取并解析存储值**
 * - 统一做 JSON.parse 容错，避免脏数据导致整个流程崩掉
 */
async function readStored(redis: Redis, key: string): Promise<StoredValue | null> {
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredValue;
  } catch {
    return null;
  }
}

/**
 * **把实体写入 Redis，并按需设置 TTL**
 * - `expiresIn` 单位为秒（oidc-provider 传入）
 * - 为了简单：直接 `SET key value EX seconds`
 */
async function writeStored(redis: Redis, key: string, value: StoredValue, expiresIn?: number) {
  const raw = JSON.stringify(value);
  if (expiresIn && expiresIn > 0) {
    await redis.set(key, raw, 'EX', expiresIn);
  } else {
    await redis.set(key, raw);
  }
}

export function createRedisAdapterFactory(redis: Redis) {
  /**
   * **适配器工厂：让 oidc-provider 用我们提供的 Redis 作为存储层**
   * - oidc-provider 会 `new Adapter('Session') / new Adapter('AccessToken') ...`
   * - 所以这里返回一个 class，构造函数接收 model name
   */
  return class RedisAdapter {
    name: string;

    /** **保存当前 adapter 对应的 OIDC 模型名称** */
    constructor(name: string) {
      this.name = name;
    }

    /**
     * **写入或更新实体（核心写路径）**
     * - `id`：实体 id
     * - `payload`：oidc-provider 的实体内容
     * - `expiresIn`：TTL（秒）
     *
     * 我们在这里额外维护 3 类索引：
     * - grantId -> keys（Set）：用于撤销
     * - uid -> key（String）：用于按 uid 查找
     * - userCode -> key（String）：用于按 userCode 查找
     */
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

    /**
     * **按 id 查找实体（最常用读路径）**
     * - 返回给 oidc-provider 的必须是“payload 对象”
     * - consumed 字段需要按规范返回（用于一次性 code 被消费后的状态）
     */
    async find(id: string) {
      const key = keyFor(this.name, id);
      const stored = await readStored(redis, key);
      if (!stored) return undefined;
      const payload = stored.payload || undefined;
      if (!payload) return undefined;
      if (stored.consumed) payload.consumed = stored.consumed;
      return payload;
    }

    /**
     * **按 uid 查找实体**
     * - 先查 uid 索引拿到主键 key，再读实体
     */
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

    /**
     * **按 userCode 查找实体**
     * - 先查 userCode 索引拿到主键 key，再读实体
     */
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

    /**
     * **删除实体**
     * - oidc-provider 在撤销或过期清理时会调用
     * - 这里尽量顺带清理索引（即使不清理，索引自身也会过期）
     */
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

    /**
     * **标记实体已被消费（consume）**
     * - 授权码（AuthorizationCode）这类一次性凭证会被消费
     * - 这里把 consumed 设置为时间戳，并尽量保留原 TTL（用 pttl 取剩余时间）
     */
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

    /**
     * **按 grantId 撤销一组实体**
     * - grantId 对应“一次授权/一次同意”的产物集合
     * - 常用于用户撤销授权、重新授权时清理历史 token/code
     */
    async revokeByGrantId(grantId: string) {
      const idxKey = grantIndexKey(grantId);
      const keys = await redis.smembers(idxKey);
      if (!keys.length) return;
      await redis.del(...keys);
      await redis.del(idxKey);
    }
  };
}


