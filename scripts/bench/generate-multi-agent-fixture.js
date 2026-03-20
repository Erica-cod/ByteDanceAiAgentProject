#!/usr/bin/env node

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function buildAgentMarkdown(agent, round, paragraphs) {
  const title =
    agent === 'planner'
      ? `### 规划师第 ${round} 轮方案`
      : agent === 'critic'
        ? `### 批评家第 ${round} 轮审查`
        : `### 主持人第 ${round} 轮决策`;

  const block = Array.from({ length: paragraphs })
    .map((_, i) => {
      const n = i + 1;
      return [
        `#### 分析片段 ${n}`,
        '- 假设：用户希望在有限时间内最大化目标达成率。',
        '- 约束：需要兼顾执行成本、风险和可追踪性。',
        '- 结论：采用分阶段方案，并设立可验收检查点。',
        '',
        '```text',
        `round=${round}; agent=${agent}; section=${n};`,
        '```',
      ].join('\n');
    })
    .join('\n\n');

  return `${title}\n\n${block}`;
}

function buildRounds(roundCount, paragraphs) {
  const rounds = [];
  const trend = [];
  const now = Date.now();

  for (let round = 1; round <= roundCount; round += 1) {
    const consensus = Math.min(0.64 + round * 0.06, 0.95);
    trend.push(consensus);
    rounds.push({
      round,
      outputs: [
        {
          agent: 'planner',
          round,
          output_type: 'text',
          content: buildAgentMarkdown('planner', round, paragraphs),
          timestamp: new Date(now + round * 1000).toISOString(),
        },
        {
          agent: 'critic',
          round,
          output_type: 'text',
          content: buildAgentMarkdown('critic', round, paragraphs),
          timestamp: new Date(now + round * 1000 + 200).toISOString(),
        },
        {
          agent: 'host',
          round,
          output_type: 'text',
          content: buildAgentMarkdown('host', round, Math.max(1, paragraphs - 1)),
          timestamp: new Date(now + round * 1000 + 400).toISOString(),
        },
      ],
      hostDecision: {
        action: round === roundCount ? 'converge' : 'continue',
        reason: round === roundCount ? '已达到收敛条件，进入报告阶段。' : '仍存在分歧，继续讨论。',
        next_agents: round === roundCount ? ['reporter'] : ['planner', 'critic'],
        consensus_level: consensus,
        timestamp: new Date(now + round * 1000 + 800).toISOString(),
      },
    });
  }

  return { rounds, trend };
}

function parseArg(name, fallback) {
  const pair = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (!pair) return fallback;
  const value = Number(pair.slice(name.length + 3));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function main() {
  const messageCount = parseArg('messages', 30);
  const multiAgentMessages = parseArg('multi', 6);
  const roundsPerDiscussion = parseArg('rounds', 5);
  const paragraphsPerAgent = parseArg('paragraphs', 4);
  const output = resolve('test/fixtures/multi-agent-perf-fixture.json');

  const { rounds, trend } = buildRounds(roundsPerDiscussion, paragraphsPerAgent);
  const now = Date.now();
  const messages = [];

  for (let i = 0; i < messageCount; i += 1) {
    const ts = now - (messageCount - i) * 15_000;
    const isAssistant = i % 2 === 1;
    const isHeavy = isAssistant && i >= messageCount - multiAgentMessages * 2;

    if (!isAssistant) {
      messages.push({
        id: `fixture-user-${i}`,
        role: 'user',
        content: `这是一条用于性能测试的用户消息 ${i + 1}。`,
        timestamp: ts,
      });
      continue;
    }

    if (isHeavy) {
      messages.push({
        id: `fixture-assistant-multi-${i}`,
        role: 'assistant',
        content: '多 Agent 协作已完成，包含完整轮次记录。',
        timestamp: ts,
        multiAgentData: {
          rounds,
          status: 'converged',
          consensusTrend: trend,
        },
      });
      continue;
    }

    messages.push({
      id: `fixture-assistant-${i}`,
      role: 'assistant',
      content: `这是一条用于性能测试的普通助手消息 ${i + 1}。`,
      timestamp: ts,
    });
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    config: {
      messageCount,
      multiAgentMessages,
      roundsPerDiscussion,
      paragraphsPerAgent,
    },
    conversationId: 'perf-mock-conversation',
    messages,
  };

  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`✅ 已生成性能测试假数据: ${output}`);
}

main();
