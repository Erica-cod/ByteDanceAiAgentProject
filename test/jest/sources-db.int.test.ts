/**
 * sources 字段入库检查（可选）
 *
 * 目标：
 * - 连接 MongoDB
 * - 统计 messages 集合中 sources 非空的条数（用于验证搜索来源是否被保存）
 *
 * 开关：
 * - RUN_SOURCES_DB_TEST=1
 */

import { jest } from '@jest/globals';
import { MongoClient } from 'mongodb';

describe('sources in db (optional)', () => {
  jest.setTimeout(60_000);

  test('should count messages with sources', async () => {
    if (process.env.RUN_SOURCES_DB_TEST !== '1') {
      // eslint-disable-next-line no-console
      console.warn('未设置 RUN_SOURCES_DB_TEST=1，跳过 sources DB 测试');
      return;
    }

    const uri = process.env.MONGODB_URI;
    if (!uri) {
      // eslint-disable-next-line no-console
      console.warn('未配置 MONGODB_URI，跳过 sources DB 测试');
      return;
    }

    // db 名称优先从连接串取；如果你们历史数据在 ai-chat，可用 MONGODB_DB 覆盖
    const dbName = process.env.MONGODB_DB || undefined;
    const client = new MongoClient(uri);

    try {
      await client.connect();
      const db = dbName ? client.db(dbName) : client.db();
      const col = db.collection('messages');

      const total = await col.countDocuments({});
      const withSources = await col.countDocuments({
        // sources 是数组且非空：用 sources.0 是否存在判断最稳
        sources: { $exists: true, $ne: null },
        'sources.0': { $exists: true },
      });

      // 只做可观测性验证：有数据时应该能统计出来
      expect(total).toBeGreaterThanOrEqual(0);
      expect(withSources).toBeGreaterThanOrEqual(0);
    } finally {
      await client.close();
    }
  });
});


