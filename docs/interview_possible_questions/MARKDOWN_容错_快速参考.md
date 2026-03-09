# Markdown 容错处理 - 快速参考卡片

> 用于面试时快速回忆关键点

---

## 🎯 一句话总结

**四层容错机制**：严重错误检测（纯文本降级）→ 自动修复器（检测并补全不完整标记） → react-markdown（利用其容错能力） → 备用渲染器（手工解析，确保不白屏）

---

## 📦 核心文件（3个）

1. **`src/utils/markdownFixer.ts`** - 自动修复工具 + 严重错误检测
2. **`src/utils/fallbackMarkdownRenderer.tsx`** - 备用渲染器
3. **`src/components/business/Message/StreamingMarkdown.tsx`** - 增强版组件

---

## 🔧 修复能力（5类问题）

| 问题 | 示例 | 修复方法 |
|-----|------|---------|
| **严重格式错误** | `<div class="test"` | **降级为纯文本** |
| 代码块未闭合 | \`\`\`python<br>code | 添加结尾 \`\`\` |
| HTML 标签未闭合 | `<div>content` | 添加 `</div>` |
| 链接不完整 | `[text](url` | 添加 `)` |
| 表格行截断 | `\| col1 \| col2 \|` | 补全缺失列 |

---

## 💡 设计原则（4个）

1. **严重错误直接降级** - 检测到严重格式错误（如 HTML 标签语法错误）直接输出纯文本
2. **只在需要时修复** - 检测流式特征才应用，避免误伤
3. **优雅降级** - react-markdown 失败时自动切换备用渲染器
4. **开发友好** - 开发环境输出调试信息

---

## 📊 性能影响

- 正常渲染：**无影响**
- 流式渲染：**+5-10ms**（可忽略）
- 降级渲染：**+10-20ms**（仍然很快）

---

## 🎓 面试追问（6个核心问题）

### Q1: 为什么需要容错？
**A**: AI 流式输出时内容可能在任意位置截断，直接渲染会导致格式错误。

### Q2: 为什么不等完整再渲染？
**A**: 会损失流式体验。我选择"尽力修复+优雅降级"。

### Q3: 会不会误伤正常内容？
**A**: 不会。只在检测到流式特征（如末尾是不完整标记）时才修复。

### Q4: 什么情况下会降级为纯文本？
**A**: 检测到严重格式错误时（如 `<div class="test"` 标签未闭合 `>`、`<<<<<<` 大量特殊字符），因为这些错误无法修复，强行渲染可能导致更严重问题。

### Q5: react-markdown 的容错机制是什么？
**A**: 
- **核心**：基于 unified 生态（remark + rehype），使用 AST 解析
- **容错策略**：宽松解析（不完整标记视为普通文本）、增量解析（每次更新重新解析）、回退机制（不匹配时回退到纯文本）
- **为什么还需要手动修复**：react-markdown 对"完全缺失闭合标记"（如只有 \`\`\`）会将后续全部视为代码块，我们在之前补全标记避免这种情况

### Q6: 技术亮点是什么？
**A**: 
- 四层容错机制（严重错误检测 + 自动修复 + react-markdown + 备用渲染器）
- 智能检测（避免误伤）
- 手工实现 Markdown 解析器（展示算法能力）
- 完整工程化（测试+文档）

---

## 🚀 使用示例

```tsx
// 正常使用（自动容错）
<StreamingMarkdown content={message.content} />

// 禁用容错（测试用）
<StreamingMarkdown content={content} enableFixer={false} />

// 强制备用渲染器（测试用）
<StreamingMarkdown content={content} forceFallback={true} />
```

---

## 📍 在项目中的位置

- **前端问答**：`docs/interview_possible_questions/前端体验与性能.md` - 第7题
- **服务端问答**：`docs/interview_possible_questions/服务端与框架选型.md` - 第12题
- **技术文档**：`docs/12-Miscellaneous/MARKDOWN_FAULT_TOLERANCE.md`

---

## 🎯 与 JSON 容错的对比

| 维度 | JSON 容错 | Markdown 容错 |
|-----|----------|--------------|
| **位置** | 服务端 | 前端 |
| **核心算法** | 括号平衡（栈） | 多种算法组合 |
| **容错对象** | 工具调用返回值 | 用户可见内容 |
| **降级方案** | 纯文本回复 | 备用渲染器 |
| **文档** | `JSON_GARBAGE_FIX.md` | `MARKDOWN_FAULT_TOLERANCE.md` |

---

## 🆕 JSON 容错近期更新（2026-03）

> 这部分用于和面试官说明：我们不仅“有兜底”，还“能量化效果”。

### 1) 增加可观测指标（已落地）

- 代码位置：`api/_clean/shared/utils/json-extractor.ts`
- 新增结构化指标日志：`[JSONExtractorMetrics]`
- 可观测维度：
  - `rawParseAttempts/rawParseSuccess`
  - `jsonrepairAttempts/jsonrepairSuccess`
  - `customFixAttempts/customFixSuccess`
  - `stage`（`raw` / `jsonrepair` / `custom` / `none`）
  - `durationMs`、`source`、`success`

#### 埋点何时触发

- `extractJSON()` 返回成功时触发一次（`success=true`，`stage` 为 `raw/jsonrepair/custom`）
- `extractJSON()` 全部策略失败时触发一次（`success=false`，`stage=none`）
- `extractJSONWithRemainder()` 在闭合标签路径、未闭合标签路径成功时触发一次
- 注意：`extractJSONWithRemainder()` 回退到 `extractJSON()` 时，指标由 `extractJSON()` 统一上报，避免重复统计

#### 怎么收集监控报告

- **采集方式**：日志系统匹配前缀 `[JSONExtractorMetrics]`，提取后面的 JSON 字段
- **聚合维度**：按 `source`、时间窗口（5 分钟/1 小时/1 天）聚合
- **核心报表口径**：
  - `final_success_rate = success=true 的事件数 / 总事件数`
  - `l1_success_rate = stage=jsonrepair 的事件数 / jsonrepairAttempts>0 的事件数`
  - `l2_rescue_rate = stage=custom 的事件数 / jsonrepairSuccess=0 且 customFixAttempts>0 的事件数`
- **推荐告警**：
  - `final_success_rate < 99%` 告警
  - `stage=custom` 比例周环比突增告警（通常说明上游模型输出质量下降）
  - `durationMs` P95 异常升高告警（通常说明输入异常或规则退化）

### 2) 兜底规则增强（针对 jsonrepair issue 反馈）

在 `fixCommonJSONErrors()` 新增了 3 类补位修复：

1. **缺失 key 结束引号**
   - 例：`"suggested_diff_hunk: null` -> `"suggested_diff_hunk": null`
2. **双引号成对转义的字符串化 JSON**
   - 例：`"{""name"":""Alice""}"` -> `{"name":"Alice"}`
3. **多个顶层 JSON 粘连**
   - 例：`{"a":1}{"b":2}` -> `[{"a":1},{"b":2}]`

### 3) 零模型成本回归测试（已落地）

- 新增测试：`test/jest/json-extractor-fallback.test.ts`
- 覆盖上述 3 类新增兜底规则
- 优点：不需要再发模型请求，不消耗 token，CI 可直接回归

---

## ✅ 记忆要点

1. **四层容错**：严重错误检测 → 修复 → react-markdown → 备用
2. **五类问题**：严重错误、代码块、HTML、链接、表格
3. **四个原则**：严重错误降级、只在需要时修复、优雅降级、开发友好
4. **性能影响小**：+5-10ms
5. **不误伤**：检测流式特征才修复
6. **react-markdown 容错**：基于 AST 宽松解析，增量更新，回退到纯文本
7. **JSON 容错可量化**：不仅有双层修复，还有分层成功率指标

---

## 🎤 面试回答模板

**面试官**: Markdown 流式渲染时格式截断怎么处理？

**你**: 我实现了四层容错机制：

**第0层**：严重错误检测。如果检测到像 `<div class="test"` 这样连 HTML 标签的 `>` 都没有的严重格式错误，直接降级为纯文本输出，不尝试渲染，避免更严重的问题。

**第1层**：自动修复器。检测流式传输特征（如末尾是不完整标记），然后用括号平衡算法修复未闭合的代码块、HTML 标签、链接、表格等。

**第2层**：利用 react-markdown 的容错能力。它基于 unified 生态（remark + rehype），使用 AST 解析，遇到不完整标记会宽松解析为普通文本，每次更新都增量解析整个字符串。

**第3层**：备用渲染器。如果 react-markdown 抛出异常（比如依赖加载失败），会自动降级到我手工实现的 Markdown 解析器，确保内容始终可读，不会白屏。

这样既保证了流式体验，又确保了可靠性。测试覆盖了 10 种场景，包括严重格式错误、代码块截断、HTML 标签未闭合等。

---

**提示**：面试时可以先说"四层容错机制"的架构，然后根据面试官兴趣深入某一层的实现细节（如括号平衡算法、AST 解析原理等）。

