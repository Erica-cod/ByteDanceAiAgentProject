/**
 * 工具验证器 - 防止工具幻觉
 * 
 * 功能:
 * - 验证工具是否存在
 * - 验证参数完整性和类型
 * - 提供友好的错误提示
 * - 标准化工具调用
 */

/**
 * 工具定义接口
 */
export interface ToolDefinition {
  name: string;
  description: string;
  requiredParams: string[];
  optionalParams: string[];
  paramTypes: Record<string, 'string' | 'number' | 'boolean' | 'object'>;
  examples?: Array<{
    input: string;
    toolCall: any;
  }>;
}

/**
 * 工具注册表
 * 
 * 注意: 添加新工具时,必须在这里注册
 */
export const TOOL_REGISTRY = new Map<string, ToolDefinition>([
  [
    'search_web',
    {
      name: 'search_web',
      description: '联网搜索最新信息、新闻、教程、资源',
      requiredParams: ['query'],
      optionalParams: ['maxResults', 'searchDepth', 'includeAnswer'],
      paramTypes: {
        query: 'string',
        maxResults: 'number',
        searchDepth: 'string',
        includeAnswer: 'boolean',
      },
      examples: [
        {
          input: '今天北京天气?',
          toolCall: { tool: 'search_web', query: '今天北京天气预报' },
        },
        {
          input: '最新AI新闻',
          toolCall: {
            tool: 'search_web',
            query: '2025年最新AI新闻',
            maxResults: 10,
          },
        },
      ],
    },
  ],
  // ==================== 计划管理工具 ====================
  [
    'create_plan',
    {
      name: 'create_plan',
      description: '创建新的计划,包含总目标和任务列表',
      requiredParams: ['title', 'goal', 'tasks'],
      optionalParams: [],
      paramTypes: {
        title: 'string',
        goal: 'string',
        tasks: 'object',
      },
      examples: [
        {
          input: '帮我制定一个3个月的IELTS备考计划',
          toolCall: {
            tool: 'create_plan',
            title: '三个月 IELTS 备考计划',
            goal: '在 3 个月内将 IELTS 总分提升到 7 分',
            tasks: [
              {
                title: '进行第一次完整模考并记录分数',
                estimated_hours: 3,
                deadline: '2025-01-05',
                tags: ['mock', 'baseline'],
              },
              {
                title: '每天完成 2 篇阅读练习',
                estimated_hours: 1.5,
                deadline: '2025-01-31',
                tags: ['reading'],
              },
            ],
          },
        },
      ],
    },
  ],
  [
    'update_plan',
    {
      name: 'update_plan',
      description: '更新已存在的计划,可以修改标题、目标或任务列表',
      requiredParams: ['plan_id'],
      optionalParams: ['title', 'goal', 'tasks'],
      paramTypes: {
        plan_id: 'string',
        title: 'string',
        goal: 'string',
        tasks: 'object',
      },
      examples: [
        {
          input: '把备考时间延长到4个月',
          toolCall: {
            tool: 'update_plan',
            plan_id: 'plan_123',
            goal: '在 4 个月内将 IELTS 总分提升到 7 分',
            tasks: [
              {
                title: '每天完成 1 篇阅读练习',
                estimated_hours: 1,
                deadline: '2025-02-15',
                tags: ['reading'],
              },
            ],
          },
        },
      ],
    },
  ],
  [
    'get_plan',
    {
      name: 'get_plan',
      description: '获取指定计划的详细信息',
      requiredParams: ['plan_id'],
      optionalParams: [],
      paramTypes: {
        plan_id: 'string',
      },
      examples: [
        {
          input: '查看我的IELTS备考计划',
          toolCall: {
            tool: 'get_plan',
            plan_id: 'plan_123',
          },
        },
      ],
    },
  ],
  [
    'list_plans',
    {
      name: 'list_plans',
      description: '列出所有计划或最近的N个计划',
      requiredParams: [],
      optionalParams: ['limit'],
      paramTypes: {
        limit: 'number',
      },
      examples: [
        {
          input: '显示我所有的计划',
          toolCall: {
            tool: 'list_plans',
            limit: 10,
          },
        },
      ],
    },
  ],
  // 未来工具: 取消下面的注释来添加新工具
  // [
  //   'calculator',
  //   {
  //     name: 'calculator',
  //     description: '执行数学计算',
  //     requiredParams: ['expression'],
  //     optionalParams: [],
  //     paramTypes: {
  //       expression: 'string',
  //     },
  //   },
  // ],
]);

/**
 * 验证结果接口
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  normalizedToolCall?: any;
  suggestion?: string;
}

/**
 * 验证工具调用
 * 
 * @param toolCall - 模型输出的工具调用对象
 * @returns 验证结果
 */
export function validateToolCall(toolCall: any): ValidationResult {
  // 0. 基本检查
  if (!toolCall || typeof toolCall !== 'object') {
    return {
      valid: false,
      error: '工具调用格式错误: 必须是对象',
    };
  }

  if (!toolCall.tool) {
    return {
      valid: false,
      error: '工具调用缺少 "tool" 字段',
    };
  }

  // 1. 检查工具是否存在
  if (!TOOL_REGISTRY.has(toolCall.tool)) {
    const availableTools = Array.from(TOOL_REGISTRY.keys());
    const suggestion = findClosestTool(toolCall.tool, availableTools);

    return {
      valid: false,
      error: `工具 "${toolCall.tool}" 不存在`,
      suggestion: suggestion
        ? `你是不是想用 "${suggestion}"? 可用工具: ${availableTools.join(', ')}`
        : `可用工具: ${availableTools.join(', ')}`,
    };
  }

  const toolDef = TOOL_REGISTRY.get(toolCall.tool)!;

  // 2. 检查必填参数
  const missingParams = toolDef.requiredParams.filter(
    param => !(param in toolCall)
  );

  if (missingParams.length > 0) {
    return {
      valid: false,
      error: `缺少必填参数: ${missingParams.join(', ')}`,
      suggestion: `正确格式: <tool_call>{"tool": "${toolCall.tool}", ${toolDef.requiredParams.map(p => `"${p}": "..."`).join(', ')}}</tool_call>`,
    };
  }

  // 3. 检查参数类型
  for (const [param, value] of Object.entries(toolCall)) {
    if (param === 'tool') continue;

    // 检查是否是允许的参数
    const isValidParam =
      toolDef.requiredParams.includes(param) ||
      toolDef.optionalParams.includes(param);

    if (!isValidParam) {
      console.warn(`⚠️  工具 "${toolCall.tool}" 收到未知参数 "${param}"`);
      continue; // 警告但不阻止
    }

    // 检查类型
    const expectedType = toolDef.paramTypes[param];
    const actualType = typeof value;

    if (expectedType && actualType !== expectedType) {
      return {
        valid: false,
        error: `参数 "${param}" 类型错误`,
        suggestion: `期望类型: ${expectedType}, 实际类型: ${actualType}`,
      };
    }
  }

  // 4. 标准化工具调用 (移除多余参数)
  const normalizedToolCall: any = { tool: toolCall.tool };

  for (const param of [
    ...toolDef.requiredParams,
    ...toolDef.optionalParams,
  ]) {
    if (param in toolCall) {
      normalizedToolCall[param] = toolCall[param];
    }
  }

  // 5. 验证通过
  console.log(
    `✅ 工具调用验证通过: ${toolCall.tool}`,
    normalizedToolCall
  );
  return {
    valid: true,
    normalizedToolCall,
  };
}

/**
 * 查找最接近的工具名 (用于提示)
 * 使用 Levenshtein 距离算法
 */
function findClosestTool(
  input: string,
  availableTools: string[]
): string | null {
  let minDistance = Infinity;
  let closestTool: string | null = null;

  for (const tool of availableTools) {
    const distance = levenshteinDistance(
      input.toLowerCase(),
      tool.toLowerCase()
    );
    if (distance < minDistance) {
      minDistance = distance;
      closestTool = tool;
    }
  }

  // 只有距离小于等于3时才认为是可能的拼写错误
  return minDistance <= 3 ? closestTool : null;
}

/**
 * Levenshtein 距离算法 (计算两个字符串的相似度)
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // 替换
          matrix[i][j - 1] + 1, // 插入
          matrix[i - 1][j] + 1 // 删除
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * 生成工具定义的 Prompt 文本
 * 
 * @param toolNames - 要包含的工具名称列表(如果为空则包含所有工具)
 * @returns 格式化的工具定义文本
 */
export function generateToolPrompt(toolNames?: string[]): string {
  const tools = toolNames
    ? Array.from(TOOL_REGISTRY.values()).filter(t =>
        toolNames.includes(t.name)
      )
    : Array.from(TOOL_REGISTRY.values());

  let prompt = `## 可用工具清单 (共 ${tools.length} 个)\n\n`;

  tools.forEach((tool, index) => {
    prompt += `### ${index + 1}. ${tool.name}\n`;
    prompt += `**用途**: ${tool.description}\n`;
    prompt += `**必填参数**:\n`;

    tool.requiredParams.forEach(param => {
      const type = tool.paramTypes[param];
      prompt += `  - ${param} (${type}): 必填\n`;
    });

    if (tool.optionalParams.length > 0) {
      prompt += `**可选参数**:\n`;
      tool.optionalParams.forEach(param => {
        const type = tool.paramTypes[param];
        prompt += `  - ${param} (${type}): 可选\n`;
      });
    }

    prompt += `**调用格式**:\n`;
    prompt += `<tool_call>{"tool": "${tool.name}", ${tool.requiredParams.map(p => `"${p}": "..."`).join(', ')}}</tool_call>\n\n`;

    if (tool.examples && tool.examples.length > 0) {
      prompt += `**示例**:\n`;
      tool.examples.forEach(ex => {
        prompt += `用户: "${ex.input}"\n`;
        prompt += `你的输出: <tool_call>${JSON.stringify(ex.toolCall)}</tool_call>\n\n`;
      });
    }

    prompt += `---\n\n`;
  });

  prompt += `## 重要规则\n`;
  prompt += `1. **只能使用上述 ${tools.length} 个工具**,不要编造其他工具\n`;
  prompt += `2. **严格按照调用格式**,参数名必须完全匹配\n`;
  prompt += `3. **JSON 格式必须合法**,使用双引号,在一行内完成\n`;
  prompt += `4. **每次只调用一个工具**\n`;
  prompt += `5. **如果不确定使用哪个工具**,优先选择 search_web\n`;

  return prompt;
}

/**
 * 获取工具使用统计
 */
export function getToolStats() {
  return {
    totalTools: TOOL_REGISTRY.size,
    toolNames: Array.from(TOOL_REGISTRY.keys()),
    toolCategories: {
      search: ['search_web'],
      planning: ['create_plan', 'update_plan', 'get_plan', 'list_plans'],
      // 未来可以按类别组织
    },
  };
}

