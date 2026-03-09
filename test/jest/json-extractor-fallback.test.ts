import { describe, expect, test } from '@jest/globals';

describe('json-extractor fallback fixes', () => {
  test('应修复缺失 key 结束引号的 JSON', async () => {
    const { fixCommonJSONErrors } = await import('../../api/_clean/shared/utils/json-extractor.js');
    const input = '{"body":"ok","suggested_diff_hunk: null, "approve_pr": false}';
    const fixed = fixCommonJSONErrors(input);
    const result = JSON.parse(fixed) as Record<string, unknown>;

    expect(result.body).toBe('ok');
    expect(result.suggested_diff_hunk).toBeNull();
    expect(result.approve_pr).toBe(false);
  });

  test('应修复双引号成对转义的字符串化 JSON', async () => {
    const { fixCommonJSONErrors } = await import('../../api/_clean/shared/utils/json-extractor.js');
    const input = '"{""name"":""Alice"",""age"":18}"';
    const fixed = fixCommonJSONErrors(input);
    const result = JSON.parse(fixed) as Record<string, unknown>;

    expect(result.name).toBe('Alice');
    expect(result.age).toBe(18);
  });

  test('应修复多个顶层 JSON 粘连', async () => {
    const { fixCommonJSONErrors } = await import('../../api/_clean/shared/utils/json-extractor.js');
    const input = '{"a":1}{"b":2}';
    const fixed = fixCommonJSONErrors(input);
    const result = JSON.parse(fixed) as Array<Record<string, number>>;

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ a: 1 });
    expect(result[1]).toEqual({ b: 2 });
  });
});
