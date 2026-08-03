import { describe, expect, test } from '@jest/globals';
import {
  scoreSplitBaseline,
  scoreUnifiedCandidates,
  selectMemoryCandidates,
  type MemoryScoringCandidate,
  type MemorySelectionResult,
} from '../../api/_clean/domain/services/memory-candidate-scoring.js';

interface EvidenceRequirement {
  sourceMessageId: string;
  requiresRaw?: boolean;
}

interface ExperimentCase {
  name: string;
  query: string;
  queryEmbedding: number[];
  budgetTokens: number;
  candidates: MemoryScoringCandidate[];
  requiredEvidence: EvidenceRequirement[];
}

interface ExperimentMetrics {
  evidenceRecall: number;
  exactEvidenceRecall: number;
  redundantTokenRatio: number;
  averageBudgetUtilization: number;
}

const NOW = new Date('2026-07-28T00:00:00Z');

describe('split versus unified memory scoring experiment', () => {
  test('compares evidence recall and redundancy under the same token budgets', () => {
    const cases = createExperimentCases();
    const baselineResults = cases.map(testCase =>
      selectMemoryCandidates(
        scoreSplitBaseline(
          testCase.query,
          testCase.queryEmbedding,
          testCase.candidates,
          NOW
        ),
        testCase.budgetTokens,
        'split_baseline'
      )
    );
    const unifiedResults = cases.map(testCase =>
      selectMemoryCandidates(
        scoreUnifiedCandidates(
          testCase.query,
          testCase.queryEmbedding,
          testCase.candidates,
          NOW
        ),
        testCase.budgetTokens,
        'unified'
      )
    );

    const baseline = aggregateMetrics(cases, baselineResults);
    const unified = aggregateMetrics(cases, unifiedResults);

    console.info(
      '[MemoryScoringExperiment]',
      JSON.stringify(
        {
          baseline,
          unified,
          cases: cases.map((testCase, index) => ({
            name: testCase.name,
            baselineSelected: baselineResults[index].selected.map(
              candidate => candidate.id
            ),
            unifiedSelected: unifiedResults[index].selected.map(
              candidate => candidate.id
            ),
          })),
        },
        null,
        2
      )
    );

    expect(unified.evidenceRecall).toBeGreaterThan(
      baseline.evidenceRecall
    );
    expect(unified.exactEvidenceRecall).toBe(1);
    expect(unified.redundantTokenRatio).toBeLessThan(
      baseline.redundantTokenRatio
    );
  });

  test('uses one formula but preserves source-aware feature values', () => {
    const exactCase = createExperimentCases()[0];
    const scored = scoreUnifiedCandidates(
      exactCase.query,
      exactCase.queryEmbedding,
      exactCase.candidates,
      NOW
    );
    const raw = scored.find(candidate => candidate.id === 'deadline-raw')!;
    const summary = scored.find(
      candidate => candidate.id === 'deadline-summary'
    )!;

    expect(raw.retrievalRelevance).toBeGreaterThan(0);
    expect(summary.retrievalRelevance).toBeGreaterThan(0);
    expect(raw.packingScore).toBeGreaterThan(summary.packingScore);
  });
});

function aggregateMetrics(
  cases: ExperimentCase[],
  selections: MemorySelectionResult[]
): ExperimentMetrics {
  let evidenceHits = 0;
  let evidenceTotal = 0;
  let exactHits = 0;
  let exactTotal = 0;
  let redundantTokens = 0;
  let selectedTokens = 0;
  let utilization = 0;

  cases.forEach((testCase, index) => {
    const selection = selections[index];
    for (const requirement of testCase.requiredEvidence) {
      evidenceTotal += 1;
      const matchingCandidates = selection.selected.filter(candidate =>
        candidate.sourceMessageIds.includes(
          requirement.sourceMessageId
        )
      );
      const hit = requirement.requiresRaw
        ? matchingCandidates.some(candidate => candidate.kind === 'raw')
        : matchingCandidates.length > 0;
      if (hit) evidenceHits += 1;

      if (requirement.requiresRaw) {
        exactTotal += 1;
        if (hit) exactHits += 1;
      }
    }

    const seenSourceIds = new Set<string>();
    for (const candidate of selection.selected) {
      const overlap = candidate.sourceMessageIds.filter(sourceId =>
        seenSourceIds.has(sourceId)
      ).length;
      if (candidate.sourceMessageIds.length > 0) {
        redundantTokens +=
          candidate.estimatedTokens *
          (overlap / candidate.sourceMessageIds.length);
      }
      selectedTokens += candidate.estimatedTokens;
      candidate.sourceMessageIds.forEach(sourceId =>
        seenSourceIds.add(sourceId)
      );
    }
    utilization +=
      selection.usedTokens / Math.max(1, selection.budgetTokens);
  });

  return {
    evidenceRecall: evidenceHits / Math.max(1, evidenceTotal),
    exactEvidenceRecall: exactHits / Math.max(1, exactTotal),
    redundantTokenRatio:
      redundantTokens / Math.max(1, selectedTokens),
    averageBudgetUtilization: utilization / Math.max(1, cases.length),
  };
}

function createExperimentCases(): ExperimentCase[] {
  return [
    {
      name: 'exact deadline must retain raw evidence',
      query: '我的申请材料具体哪天几点截止？',
      queryEmbedding: [1, 0, 0, 0],
      budgetTokens: 90,
      requiredEvidence: [
        { sourceMessageId: 'msg-deadline', requiresRaw: true },
      ],
      candidates: [
        candidate({
          id: 'deadline-raw',
          kind: 'raw',
          content:
            '申请材料截止日期是 2026 年 7 月 31 日 18:00，逾期不接受。',
          sourceMessageIds: ['msg-deadline'],
          embedding: [1, 0, 0, 0],
          importance: 1,
          estimatedTokens: 75,
        }),
        candidate({
          id: 'deadline-summary',
          kind: 'summary',
          content: '申请材料需要在本周内完成。',
          sourceMessageIds: ['msg-deadline', 'msg-application'],
          embedding: [0.98, 0.02, 0, 0],
          importance: 0.9,
          estimatedTokens: 25,
        }),
        candidate({
          id: 'deadline-distractor',
          kind: 'raw',
          content: '下个月继续复习 React。',
          sourceMessageIds: ['msg-react'],
          embedding: [0, 0, 0, 1],
          importance: 0.3,
          estimatedTokens: 30,
        }),
      ],
    },
    {
      name: 'semantic preference is denser in summary',
      query: '以后示例尽量采用有静态类型的方案。',
      queryEmbedding: [0, 1, 0, 0],
      budgetTokens: 80,
      requiredEvidence: [
        { sourceMessageId: 'msg-pref-1' },
        { sourceMessageId: 'msg-pref-2' },
        { sourceMessageId: 'msg-pref-3' },
      ],
      candidates: [
        candidate({
          id: 'preference-summary',
          kind: 'summary',
          content:
            'Prefers TypeScript and typed interfaces for future code examples.',
          sourceMessageIds: [
            'msg-pref-1',
            'msg-pref-2',
            'msg-pref-3',
          ],
          embedding: [0, 1, 0, 0],
          importance: 0.95,
          estimatedTokens: 45,
        }),
        candidate({
          id: 'preference-raw-1',
          kind: 'raw',
          content: '之后的前端示例统一使用 TypeScript。',
          sourceMessageIds: ['msg-pref-1'],
          embedding: [0, 0.96, 0.04, 0],
          importance: 0.9,
          estimatedTokens: 50,
        }),
        candidate({
          id: 'preference-raw-2',
          kind: 'raw',
          content: '接口参数和返回值都要声明类型。',
          sourceMessageIds: ['msg-pref-2'],
          embedding: [0, 0.92, 0.08, 0],
          importance: 0.85,
          estimatedTokens: 50,
        }),
      ],
    },
    {
      name: 'source overlap should leave room for another constraint',
      query: '总结一下我的技术偏好和部署约束。',
      queryEmbedding: [0, 0, 1, 0],
      budgetTokens: 90,
      requiredEvidence: [
        { sourceMessageId: 'msg-style-1' },
        { sourceMessageId: 'msg-style-2' },
        { sourceMessageId: 'msg-deploy' },
      ],
      candidates: [
        candidate({
          id: 'style-summary',
          kind: 'summary',
          content: '偏好简洁回答和 TypeScript 示例。',
          sourceMessageIds: ['msg-style-1', 'msg-style-2'],
          embedding: [0, 0, 1, 0],
          importance: 0.9,
          estimatedTokens: 35,
        }),
        candidate({
          id: 'style-raw',
          kind: 'raw',
          content: '回答简洁一点，代码使用 TypeScript。',
          sourceMessageIds: ['msg-style-1'],
          embedding: [0, 0, 0.98, 0.02],
          importance: 0.9,
          estimatedTokens: 35,
        }),
        candidate({
          id: 'deployment-raw',
          kind: 'raw',
          content: '部署必须兼容公司内网，不能依赖公网 CDN。',
          sourceMessageIds: ['msg-deploy'],
          embedding: [0, 0, 0.9, 0.1],
          importance: 1,
          estimatedTokens: 45,
        }),
      ],
    },
    {
      name: 'exact error code should beat a broad incident summary',
      query: '线上失败的具体错误码是什么？',
      queryEmbedding: [0, 0, 0, 1],
      budgetTokens: 75,
      requiredEvidence: [
        { sourceMessageId: 'msg-error', requiresRaw: true },
      ],
      candidates: [
        candidate({
          id: 'error-raw',
          kind: 'raw',
          content:
            '发布失败返回错误码 DEPLOY_E403，网关拒绝了部署请求。',
          sourceMessageIds: ['msg-error'],
          embedding: [0, 0, 0, 1],
          importance: 1,
          estimatedTokens: 60,
        }),
        candidate({
          id: 'error-summary',
          kind: 'summary',
          content: '之前发生过一次部署权限问题。',
          sourceMessageIds: ['msg-error', 'msg-deploy'],
          embedding: [0, 0, 0.05, 0.95],
          importance: 0.85,
          estimatedTokens: 25,
        }),
      ],
    },
  ];
}

function candidate(
  input: Omit<MemoryScoringCandidate, 'occurredAt'>
): MemoryScoringCandidate {
  return {
    ...input,
    occurredAt: new Date('2026-07-20T00:00:00Z'),
  };
}
