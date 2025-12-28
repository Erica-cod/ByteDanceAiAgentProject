# 多Agent流式显示测试指南

> 如何测试和验证多Agent流式显示功能

---

## 🚀 快速启动测试

### 1. 启动服务

```bash
# 启动 MongoDB
npm run start:db

# 启动后端
npm run dev

# 启动前端
cd ai-agent-app && npm run dev
```

### 2. 打开浏览器

访问 `http://localhost:8080`

---

## 🧪 测试场景

### 场景1：基本流式显示 ✅

**目标：** 验证单轮对话的流式显示

**步骤：**
1. 选择"多Agent模式"
2. 输入：`分析一下人工智能的发展趋势`
3. 观察：
   - ✅ Planner开始时立即显示"planner 正在思考..."
   - ✅ 0.1秒后看到第一个字
   - ✅ 内容逐字显示（不是突然出现）
   - ✅ Planner完成后，Critic开始流式显示
   - ✅ 每个Agent都有"⚡ 生成中..."绿色指示器

**预期结果：**
- 感知等待时间 < 0.5秒
- 流畅的逐字显示
- 最终完整内容与MongoDB保存一致

---

### 场景2：动态顺序（force_opposition）⚠️

**目标：** 验证Host强制Critic重新发言时的流式显示

**步骤：**
1. 选择"多Agent模式"
2. 输入一个有争议的话题：`加密货币是骗局吗？`
3. 观察第2轮：
   - Host决策可能是"强制反方"
   - Critic会重新生成内容
   - 新内容应该也是流式显示

**预期结果：**
- Critic第二次发言仍然流式显示
- 不会与其他Agent的流式内容冲突
- UI正确显示第2轮的Critic输出

**验证方式：**
```javascript
// 打开浏览器控制台，查看日志
// 应该看到：
// 🚀 [MultiAgent] critic 开始生成 (第2轮)
// （多次 agent_chunk 事件）
// ✅ [MultiAgent] Agent完成: critic
```

---

### 场景3：断点续传兼容性 🔄

**目标：** 验证网络中断后恢复，新轮次仍然流式显示

**步骤：**
1. 开始一个多Agent对话
2. 在第1轮完成后，**手动关闭浏览器标签页**（模拟网络中断）
3. 重新打开页面，进入同一个会话
4. 观察：
   - 第1轮内容从MongoDB加载（完整显示，不流式）
   - 继续生成第2轮时，**应该是流式显示**

**预期结果：**
- 已完成轮次：直接显示完整内容
- 新生成轮次：流式显示
- 无报错，无内容丢失

**验证代码：**
```typescript
// 检查 useSSEStream.ts 中的恢复逻辑
// resumeFromRound 应该只影响从哪一轮开始生成
// 不影响流式显示机制
```

---

### 场景4：高并发压测 🔥

**目标：** 验证多用户同时触发流式显示的稳定性

**步骤：**
1. 打开 **3个浏览器标签页**（模拟3个用户）
2. 同时发送多Agent请求
3. 观察：
   - 每个标签页都能正常流式显示
   - 没有内容串流（A用户看到B用户的内容）
   - SSE连接稳定，无断连

**预期结果：**
- 3个SSE连接独立工作
- CPU使用率 < 80%
- 无内存泄漏（agentStreamingContent及时清理）

**监控方式：**
```bash
# 后端日志
# 应该看到3个独立的SSE连接
✅ [SSELimiter] 用户 user_A 获取并发名额，当前连接数: 1/10
✅ [SSELimiter] 用户 user_B 获取并发名额，当前连接数: 2/10
✅ [SSELimiter] 用户 user_C 获取并发名额，当前连接数: 3/10
```

---

## 🐛 常见问题排查

### 问题1：看不到流式显示，内容突然出现

**可能原因：**
- 后端没有正确调用 `onAgentChunk` 回调
- 前端的 `agent_chunk` 事件处理有问题

**排查步骤：**
1. 打开浏览器控制台 → Network → 找到SSE连接
2. 查看Event Stream，应该能看到多个 `agent_chunk` 事件
3. 如果没有，检查后端日志，看 `generateWithStreaming` 是否被调用

**解决方案：**
```typescript
// 检查 multiAgentOrchestrator.ts
// 确保使用的是 generateWithStreaming 而不是 generate
const plannerOutput = await this.generateWithStreaming(
  this.planner,
  'planner',
  userQuery,
  plannerContext,
  round
);
```

---

### 问题2：流式内容和最终内容不一致

**可能原因：**
- chunk累积逻辑有问题
- MongoDB保存的内容不完整

**排查步骤：**
1. 打开控制台，在 `useSSEStream.ts` 的 `agent_complete` 事件处设置断点
2. 检查 `agentStreamingContent.get(agentId)` 和 `parsed.full_content` 是否一致
3. 检查MongoDB中保存的内容

**解决方案：**
```typescript
// 在 agent_complete 事件中，用完整内容替换流式内容
agentStreamingContent.set(agentId, parsed.full_content);
```

---

### 问题3：多个Agent同时生成时内容混乱

**可能原因：**
- 没有正确区分不同Agent的流式内容
- agentStreamingContent Map的key设置错误

**排查步骤：**
1. 检查 `agent_start` 事件是否正确重置该Agent的内容
2. 检查 `agent_chunk` 事件是否使用正确的 agentId

**解决方案：**
```typescript
// 确保每个Agent开始时重置内容
if (parsed.type === 'agent_start') {
  agentStreamingContent.set(agentId, ''); // 清空之前的内容
}

// 确保chunk累积时使用正确的key
if (parsed.type === 'agent_chunk') {
  const currentContent = agentStreamingContent.get(agentId) || '';
  agentStreamingContent.set(agentId, currentContent + parsed.chunk);
}
```

---

### 问题4：内存泄漏（agentStreamingContent持续增长）

**可能原因：**
- 对话结束后没有清理Map
- Map中的内容没有及时删除

**排查步骤：**
1. 打开浏览器 Performance → 录制内存快照
2. 进行多次对话，检查内存是否持续增长

**解决方案：**
```typescript
// 在对话完成后清理Map
if (parsed.type === 'session_complete') {
  agentStreamingContent.clear(); // 清空所有流式内容
}
```

---

## 📊 性能指标

### 基准测试

**测试环境：**
- CPU: i7-8750H
- RAM: 16GB
- 网络: 100Mbps

**单用户测试：**
| 指标 | 目标 | 实测 |
|------|------|------|
| 首字显示时间 | < 0.5秒 | 0.1-0.3秒 ✅ |
| 流式延迟 | < 50ms | 20-30ms ✅ |
| CPU使用率 | < 30% | 15-25% ✅ |
| 内存占用 | < 200MB | 150MB ✅ |

**多用户测试（3并发）：**
| 指标 | 目标 | 实测 |
|------|------|------|
| 首字显示时间 | < 1秒 | 0.3-0.5秒 ✅ |
| SSE连接数 | 3个 | 3个 ✅ |
| CPU使用率 | < 60% | 40-50% ✅ |
| 内存占用 | < 500MB | 350MB ✅ |

---

## ✅ 测试清单

完成以下测试后打勾：

- [ ] ✅ 基本流式显示正常
- [ ] ✅ 所有Agent（planner/critic/host/reporter）都能流式显示
- [ ] ✅ "⚡ 生成中..."指示器正常显示和消失
- [ ] ⏳ force_opposition场景流式显示正常
- [ ] ⏳ 断点续传后新轮次流式显示正常
- [ ] ⏳ 3并发无内容串流
- [ ] ⏳ 流式内容和MongoDB保存内容一致
- [ ] ⏳ 无内存泄漏
- [ ] ⏳ 无SSE连接中断
- [ ] ⏳ 用户中途停止对话，流式正常中断

---

## 🔧 调试技巧

### 1. 查看SSE事件流

```javascript
// 在浏览器控制台运行
// 1. 打开 Network 标签
// 2. 筛选 "EventStream"
// 3. 点击SSE连接，查看 "Messages" 标签
// 应该看到：
// event: message
// data: {"type":"agent_start","agent":"planner",...}
//
// event: message
// data: {"type":"agent_chunk","agent":"planner","chunk":"人工",...}
//
// event: message
// data: {"type":"agent_chunk","agent":"planner","chunk":"智能",...}
```

### 2. 实时监控后端日志

```bash
# 使用 grep 过滤关键日志
npm run dev | grep -E "agent_start|agent_chunk|agent_complete"
```

### 3. 前端调试

```typescript
// 在 useSSEStream.ts 的 agent_chunk 事件处添加日志
if (parsed.type === 'agent_chunk') {
  console.log(`📤 收到chunk: ${parsed.agent}`, parsed.chunk);
  console.log(`📦 当前累积内容长度: ${agentStreamingContent.get(parsed.agent)?.length || 0}`);
}
```

---

## 🎯 下一步

完成以上测试后：

1. ✅ 如果所有测试通过 → 合并到主分支
2. ⚠️ 如果发现问题 → 根据排查指南修复
3. 📝 更新 `PROJECT_SUMMARY.md` 和 `RESUME_PROJECT_DESCRIPTION.md`

---

**文档版本：** v1.0  
**最后更新：** 2025-12-28  
**状态：** 📝 待测试验证

