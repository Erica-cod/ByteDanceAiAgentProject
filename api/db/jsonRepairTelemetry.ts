/**
 * JSON 修复打穿埋点模块
 *
 * 当 extractJSON 的三层修复链路（JSON.parse → jsonrepair → fixCommonJSONErrors）
 * 全部失败时，将失败详情持久化到 MongoDB，便于事后排查 LLM 输出格式问题。
 *
 * 设计原则：
 * - 只记录失败事件（低频），不记录成功
 * - try-catch 包裹，绝不影响主业务流程
 * - TTL 30 天自动过期，无需手动清理
 */

import { getDatabase } from './connection.js';

const COLLECTION_NAME = 'json_repair_failures';
const TTL_DAYS = 30;

let indexEnsured = false;

export interface StrategyErrorDetail {
  name: string;
  parseError?: string;
  jsonrepairError?: string;
  customFixError?: string;
}

export interface JSONRepairFailureRecord {
  source: string;
  rawResponsePreview: string;
  rawResponseLength: number;
  strategiesAttempted: StrategyErrorDetail[];
  durationMs: number;
  createdAt: Date;
  expiresAt: Date;
}

async function ensureTTLIndex(): Promise<void> {
  if (indexEnsured) return;

  try {
    const db = await getDatabase();
    await db.collection(COLLECTION_NAME).createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: 'json_repair_ttl' }
    );
    await db.collection(COLLECTION_NAME).createIndex(
      { source: 1, createdAt: -1 },
      { name: 'source_time_index' }
    );
    indexEnsured = true;
  } catch {
    // 索引创建失败不阻塞业务，下次再试
  }
}

/**
 * 记录一次 JSON 修复全链路失败事件
 *
 * 异步写入，不抛出异常，不阻塞调用方
 */
export async function recordJSONRepairFailure(
  record: Omit<JSONRepairFailureRecord, 'createdAt' | 'expiresAt'>
): Promise<void> {
  try {
    await ensureTTLIndex();

    const db = await getDatabase();
    const now = new Date();
    const doc: JSONRepairFailureRecord = {
      ...record,
      createdAt: now,
      expiresAt: new Date(now.getTime() + TTL_DAYS * 86400_000),
    };

    await db.collection(COLLECTION_NAME).insertOne(doc);
    console.warn(`[JSONRepairTelemetry] 已记录打穿事件 (source=${record.source}, len=${record.rawResponseLength})`);
  } catch (err) {
    console.error('[JSONRepairTelemetry] 埋点写入失败（不影响主流程）:', err);
  }
}
