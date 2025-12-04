# Multi-Agent 协作系统 JSON 协议规范

## 概述

本文档定义了多Agent协作系统中各个角色之间的通信协议，确保Agent之间能够高效、准确地交换信息。

## 1. Agent 角色定义

### 1.1 Host（主持人）
- **职责**：流程控制、决定下一步动作、检测共识/分歧、管理讨论轮次
- **能力**：调用相似度工具、强制反方角色、终止讨论

### 1.2 Planner（规划师）
- **职责**：将用户目标拆解成结构化计划
- **能力**：生成任务列表、估算时间、设定截止日期

### 1.3 Critic（批评家）
- **职责**：挑刺、可行性检查、提出修正建议
- **能力**：风险评估、假设检验、反对论证

### 1.4 Reporter（报告员）
- **职责**：将最终结构化计划转换为用户可读文本
- **能力**：格式化输出、保存计划、生成TODO

## 2. Agent 输出协议

### 2.1 基础输出格式

所有Agent的输出必须遵循以下JSON结构：

```json
{
  "agent_id": "string",           // Agent标识: "host" | "planner" | "critic" | "reporter"
  "round": 1,                      // 当前轮次
  "output_type": "string",         // 输出类型: "position" | "plan" | "critique" | "report" | "control"
  "content": "string",             // 主要输出内容（用户可见）
  "metadata": {},                  // 元数据（结构化信息）
  "timestamp": "2025-12-04T10:00:00Z"
}
```

### 2.2 Planner 输出格式

```json
{
  "agent_id": "planner",
  "round": 1,
  "output_type": "plan",
  "content": "我建议将IELTS备考分为3个阶段...",
  "metadata": {
    "position": {
      "conclusion": "采用3个月阶段式备考方案",
      "key_reasons": [
        "基础词汇积累需要6周",
        "听说读写需要并行训练",
        "最后4周密集模考"
      ],
      "assumptions": [
        "每天至少投入2小时",
        "有基础英语能力（CET-4水平）"
      ],
      "confidence": 0.85
    },
    "plan": {
      "title": "3个月IELTS备考计划",
      "goal": "达到总分7.0",
      "phases": [
        {
          "phase_name": "阶段1：基础强化",
          "duration": "6周",
          "tasks": [
            {
              "title": "词汇积累",
              "estimated_hours": 42,
              "deadline": "2025-01-15",
              "tags": ["vocabulary", "foundation"]
            }
          ]
        }
      ],
      "total_estimated_hours": 180
    }
  },
  "timestamp": "2025-12-04T10:00:00Z"
}
```

### 2.3 Critic 输出格式

```json
{
  "agent_id": "critic",
  "round": 1,
  "output_type": "critique",
  "content": "该计划存在以下问题...",
  "metadata": {
    "position": {
      "conclusion": "计划整体可行但需调整时间分配",
      "key_reasons": [
        "写作训练时间不足",
        "模考频率过低",
        "缺少口语陪练计划"
      ],
      "assumptions": [
        "用户能保持每天2小时学习",
        "用户有自律性"
      ],
      "confidence": 0.78
    },
    "critique": {
      "target_agent": "planner",
      "target_round": 1,
      "risks": [
        {
          "risk": "写作能力提升缓慢",
          "severity": "high",
          "impact": "可能导致写作单项低于6.5"
        }
      ],
      "suggestions": [
        {
          "issue": "写作训练不足",
          "solution": "增加每周2篇限时写作",
          "priority": "high"
        }
      ],
      "validity_check": {
        "feasible": true,
        "realistic": true,
        "complete": false
      }
    }
  },
  "timestamp": "2025-12-04T10:05:00Z"
}
```

### 2.4 Host 输出格式

```json
{
  "agent_id": "host",
  "round": 2,
  "output_type": "control",
  "content": "检测到高度共识，进入收敛阶段...",
  "metadata": {
    "decision": {
      "action": "string",  // "continue" | "converge" | "force_opposition" | "terminate"
      "reason": "相似度达到0.92，进入收敛",
      "next_agents": ["planner", "critic"],  // 下一轮发言的Agent
      "constraints": {
        "must_address": ["写作训练时间", "模考频率"],
        "avoid": ["重复之前的论点"]
      }
    },
    "analysis": {
      "consensus_level": 0.92,
      "similarity_matrix": [
        [1.0, 0.92, 0.88],
        [0.92, 1.0, 0.89],
        [0.88, 0.89, 1.0]
      ],
      "most_different_pair": [0, 2],
      "stubborn_agents": []
    }
  },
  "timestamp": "2025-12-04T10:10:00Z"
}
```

### 2.5 Reporter 输出格式

```json
{
  "agent_id": "reporter",
  "round": 3,
  "output_type": "report",
  "content": "# IELTS 3个月备考计划\n\n经过多轮讨论...",
  "metadata": {
    "final_plan": {
      "title": "IELTS 3个月备考计划（优化版）",
      "goal": "达到总分7.0",
      "consensus_level": "high",
      "participating_agents": ["planner", "critic"],
      "rounds": 3,
      "plan": {
        "phases": [...],
        "total_estimated_hours": 200
      }
    },
    "summary": {
      "key_agreements": [
        "3个月阶段式训练",
        "每周2次限时写作",
        "最后4周密集模考"
      ],
      "resolved_concerns": [
        "写作训练不足 -> 已增加专项训练",
        "模考频率低 -> 调整为每周1次"
      ],
      "remaining_uncertainties": [
        "用户实际可用时间可能不足2小时/天"
      ]
    }
  },
  "timestamp": "2025-12-04T10:15:00Z"
}
```

## 3. 工具调用协议

### 3.1 相似度比较工具

**工具名称**: `compare_positions`

**输入**:
```json
{
  "tool": "compare_positions",
  "texts": [
    "Agent A: 结论 + 关键理由...",
    "Agent B: 结论 + 关键理由...",
    "Agent C: 结论 + 关键理由..."
  ]
}
```

**输出**:
```json
{
  "success": true,
  "data": {
    "embeddings": [
      [0.12, 0.34, ...],  // 768维向量
      [0.15, 0.32, ...],
      [0.11, 0.36, ...]
    ],
    "similarity_matrix": [
      [1.0, 0.92, 0.88],
      [0.92, 1.0, 0.81],
      [0.88, 0.81, 1.0]
    ],
    "mean_similarity": 0.87,
    "most_different_pair": [1, 2],
    "most_different_similarity": 0.81
  }
}
```

### 3.2 获取当前时间工具

**工具名称**: `get_now`

**输入**:
```json
{
  "tool": "get_now"
}
```

**输出**:
```json
{
  "success": true,
  "data": {
    "now": "2025-12-04T10:00:00",
    "timezone": "Asia/Shanghai",
    "weekday": "Wednesday",
    "date": "2025-12-04"
  }
}
```

### 3.3 日期计算工具

**工具名称**: `calculate_date`

**输入**:
```json
{
  "tool": "calculate_date",
  "base_date": "2025-12-04",
  "offset": {
    "weeks": 2,
    "days": 3
  }
}
```

**输出**:
```json
{
  "success": true,
  "data": {
    "result_date": "2025-12-21",
    "weekday": "Saturday"
  }
}
```

## 4. 会话状态协议

### 4.1 会话状态结构

```json
{
  "session_id": "string",
  "user_query": "帮我制定IELTS备考计划",
  "mode": "multi_agent",
  "status": "in_progress",  // "in_progress" | "converged" | "terminated"
  "current_round": 2,
  "max_rounds": 5,
  "agents": {
    "planner": {
      "status": "completed",
      "last_output": {...}
    },
    "critic": {
      "status": "completed",
      "last_output": {...}
    },
    "host": {
      "status": "waiting",
      "last_output": null
    },
    "reporter": {
      "status": "idle",
      "last_output": null
    }
  },
  "history": [
    {
      "round": 1,
      "outputs": [...]
    }
  ],
  "consensus_trend": [0.65, 0.82, 0.92],
  "created_at": "2025-12-04T10:00:00Z",
  "updated_at": "2025-12-04T10:10:00Z"
}
```

## 5. Host 决策规则

### 5.1 高共识（相似度 > 0.90）
```json
{
  "action": "converge",
  "instructions": {
    "to_all_agents": "列出剩余不确定性和最坏情况",
    "next_step": "reporter_summary"
  }
}
```

### 5.2 中度共识（0.70 < 相似度 <= 0.90）
```json
{
  "action": "continue",
  "instructions": {
    "to_agents": ["planner", "critic"],
    "focus_on": ["写作训练", "模考频率"],
    "rounds_remaining": 2
  }
}
```

### 5.3 低共识（相似度 <= 0.70）
```json
{
  "action": "force_opposition",
  "instructions": {
    "role": "devils_advocate",
    "requirement": "仅从反方角度论证，不引用之前观点",
    "target": "planner"
  }
}
```

### 5.4 检测顽固 Agent
```json
{
  "action": "update_command",
  "target_agent": "planner",
  "reason": "连续2轮self_similarity > 0.98",
  "requirement": "必须完成以下至少一项：修改关键假设、降低置信度、指出对方逻辑漏洞"
}
```

## 6. 前端交互协议

### 6.1 启动多Agent模式

**请求**:
```json
{
  "message": "帮我制定IELTS备考计划",
  "mode": "multi_agent",
  "userId": "user_123",
  "conversationId": "conv_456"
}
```

**响应（SSE流式）**:
```
data: {"type": "agent_output", "agent": "planner", "round": 1, "content": "..."}

data: {"type": "agent_output", "agent": "critic", "round": 1, "content": "..."}

data: {"type": "host_decision", "action": "continue", "reason": "..."}

data: {"type": "agent_output", "agent": "planner", "round": 2, "content": "..."}

data: {"type": "final_report", "agent": "reporter", "content": "...", "plan": {...}}

data: [DONE]
```

### 6.2 前端展示格式

```typescript
interface MultiAgentMessage {
  type: 'multi_agent_session';
  sessionId: string;
  rounds: Array<{
    round: number;
    outputs: Array<{
      agent: 'planner' | 'critic' | 'host' | 'reporter';
      content: string;
      position?: PositionSummary;
    }>;
    hostDecision?: HostDecision;
  }>;
  finalReport?: {
    content: string;
    plan: Plan;
  };
}
```

## 7. 错误处理协议

### 7.1 Agent 超时
```json
{
  "error": "agent_timeout",
  "agent": "planner",
  "round": 2,
  "action": "skip_agent",
  "fallback": "使用上一轮输出"
}
```

### 7.2 达到最大轮次
```json
{
  "status": "max_rounds_reached",
  "action": "force_summary",
  "reporter_instruction": "输出分歧版结论"
}
```

### 7.3 工具调用失败
```json
{
  "error": "tool_execution_failed",
  "tool": "compare_positions",
  "fallback": "使用规则判断（关键词匹配）"
}
```

## 8. 位置摘要（Position Summary）标准

所有Agent在每轮输出时必须包含位置摘要：

```json
{
  "conclusion": "一句话结论",
  "key_reasons": ["理由1", "理由2", "理由3"],
  "assumptions": ["假设1", "假设2"],
  "confidence": 0.85,  // 0-1之间
  "changes_from_last_round": {
    "conclusion_changed": false,
    "reasons_added": ["新理由"],
    "confidence_delta": +0.05
  }
}
```

## 9. 性能优化建议

1. **向量缓存**：相同文本的embedding结果应该缓存
2. **并行执行**：Planner和Critic可以并行运行（第一轮）
3. **增量相似度**：只计算新输出与历史的相似度，不重复计算
4. **Early Stopping**：如果2轮内相似度无显著变化，提前收敛

## 10. 安全性考虑

1. **内容过滤**：所有Agent输出都需要经过内容审核
2. **Token限制**：单个Agent输出不超过2000 tokens
3. **轮次限制**：最大5轮，防止无限循环
4. **用户中断**：用户可以随时终止多Agent会话

---

**版本**: v1.0  
**更新日期**: 2025-12-04  
**维护者**: AI Agent Team

