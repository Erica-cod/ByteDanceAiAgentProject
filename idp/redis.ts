import Redis from 'ioredis';

export function createRedisClient() {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = Number.parseInt(process.env.REDIS_PORT || '6379', 10);
  const password = process.env.REDIS_PASSWORD || undefined;

  const client = new Redis({
    host,
    port,
    password,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  return client;
}


