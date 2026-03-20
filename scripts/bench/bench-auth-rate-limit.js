/* eslint-disable no-console */
import Redis from 'ioredis';

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = Number.parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || 'changeme';

const WINDOW_SEC = 60;
const DURATION_MS = Number.parseInt(process.env.BENCH_DURATION_MS || '8000', 10);
const CONCURRENCY_LEVELS = (process.env.BENCH_CONCURRENCY || '10,50,100,200,300')
  .split(',')
  .map((s) => Number.parseInt(s.trim(), 10))
  .filter((n) => Number.isFinite(n) && n > 0);

const LUA_SCRIPT = `
local key = KEYS[1]
local ttl = tonumber(ARGV[1])
local c = redis.call('INCR', key)
if c == 1 then
  redis.call('EXPIRE', key, ttl)
end
return c
`;

function nowMs() {
  return Date.now();
}

function hrMs(startNs) {
  return Number(process.hrtime.bigint() - startNs) / 1e6;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function createClient() {
  const c = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD || undefined,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
  await c.connect();
  await c.ping();
  return c;
}

async function flushKey(client, key) {
  await client.del(key);
}

async function opPipeline(client, key) {
  const resp = await client.pipeline().incr(key).expire(key, WINDOW_SEC + 2).exec();
  const incrRet = resp && resp[0] ? resp[0][1] : null;
  return { value: Number(incrRet), retries: 0 };
}

async function opLua(client, key, sha) {
  const value = await client.evalsha(sha, 1, key, WINDOW_SEC + 2);
  return { value: Number(value), retries: 0 };
}

async function opCas(client, key) {
  let attempts = 0;
  while (attempts < 200) {
    attempts += 1;
    await client.watch(key);
    const currRaw = await client.get(key);
    const ttlMs = await client.pttl(key);
    const curr = currRaw ? Number.parseInt(currRaw, 10) : 0;
    const next = curr + 1;

    const tx = client.multi();
    if (!currRaw || ttlMs <= 0) {
      tx.set(key, String(next), 'EX', WINDOW_SEC + 2);
    } else {
      tx.set(key, String(next), 'PX', ttlMs);
    }
    const execRes = await tx.exec();
    if (execRes !== null) {
      return { value: next, retries: attempts - 1 };
    }
  }
  throw new Error('CAS_RETRY_EXHAUSTED');
}

async function runOneMode({ mode, concurrency, durationMs, key, clients, sha }) {
  const latencies = [];
  let opCount = 0;
  let errorCount = 0;
  let retryCount = 0;
  const stopAt = nowMs() + durationMs;

  const workers = Array.from({ length: concurrency }).map((_, i) => (async () => {
    const client = clients[i % clients.length];
    while (nowMs() < stopAt) {
      const start = process.hrtime.bigint();
      try {
        let ret;
        if (mode === 'pipeline') {
          ret = await opPipeline(client, key);
        } else if (mode === 'lua') {
          ret = await opLua(client, key, sha);
        } else {
          ret = await opCas(client, key);
        }
        retryCount += ret.retries || 0;
      } catch (e) {
        errorCount += 1;
      } finally {
        latencies.push(hrMs(start));
        opCount += 1;
      }
    }
  })());

  await Promise.all(workers);
  latencies.sort((a, b) => a - b);
  const elapsedSec = durationMs / 1000;
  const rps = opCount / elapsedSec;
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);
  return { mode, concurrency, opCount, errorCount, retryCount, rps, p50, p95, p99 };
}

async function main() {
  console.log('== Redis benchmark ==');
  console.log(`target=${REDIS_HOST}:${REDIS_PORT}, duration=${DURATION_MS}ms, levels=${CONCURRENCY_LEVELS.join(',')}`);

  const control = await createClient();
  const luaSha = await control.script('LOAD', LUA_SCRIPT);
  console.log(`lua_sha=${luaSha}`);

  const results = [];
  for (const concurrency of CONCURRENCY_LEVELS) {
    const poolSize = Math.min(concurrency, 32);
    const clients = [];
    for (let i = 0; i < poolSize; i += 1) {
      clients.push(await createClient());
    }

    console.log(`\n-- concurrency=${concurrency}, client_pool=${poolSize} --`);
    for (const mode of ['pipeline', 'lua', 'cas']) {
      const key = `bench:auth_rl:${mode}:${concurrency}`;
      await flushKey(control, key);
      const ret = await runOneMode({
        mode,
        concurrency,
        durationMs: DURATION_MS,
        key,
        clients,
        sha: luaSha,
      });
      results.push(ret);
      console.log(
        `${mode.padEnd(8)} rps=${ret.rps.toFixed(1).padStart(8)} ` +
        `p50=${ret.p50.toFixed(3)}ms p95=${ret.p95.toFixed(3)}ms p99=${ret.p99.toFixed(3)}ms ` +
        `errors=${ret.errorCount} retries=${ret.retryCount}`
      );
    }

    await Promise.all(clients.map((c) => c.quit().catch(() => {})));
  }

  console.log('\n== summary(json) ==');
  console.log(JSON.stringify(results, null, 2));
  await control.quit();
}

main().catch((e) => {
  console.error('BENCH_FAILED', e);
  process.exit(1);
});

