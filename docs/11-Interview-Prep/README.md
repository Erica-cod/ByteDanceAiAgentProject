# 🎯 面试准备资料索引

## 📋 快速导航

### 1. 业务亮点

#### V2 可插拔工具系统
- 📖 **完整版**：[`../../api/tools/v2/README.md`](../../api/tools/v2/README.md)
- 📖 **实现总结**：[`../../api/tools/v2/IMPLEMENTATION_SUMMARY.md`](../../api/tools/v2/IMPLEMENTATION_SUMMARY.md)
- ⚡ **快速参考**：暂无（建议创建）

**核心要点：**
- 自定义工作流编排（不依赖 langchain.js）
- OpenAI Function Calling（可靠的结构化调用）
- 三层保护：限流器 + 缓存 + 熔断器
- 零侵入式插件架构

---

#### 高并发解决方案
- 📖 **完整版**：[`../06-Performance-Optimization/HIGH_CONCURRENCY_SOLUTION.md`](../06-Performance-Optimization/HIGH_CONCURRENCY_SOLUTION.md)
- ⚡ **快速入门**：[`../06-Performance-Optimization/QUICK_START_HIGH_CONCURRENCY.md`](../06-Performance-Optimization/QUICK_START_HIGH_CONCURRENCY.md)

**核心要点：**
- LLM 请求队列（并发 50 + RPM 500）
- 优先级调度（Host > Planner > Critic > Reporter）
- 水平扩展（PM2 + Nginx）

---

#### 国际化与主题切换
- 📖 **完整版**：[`../12-Miscellaneous/I18N_THEME_IMPLEMENTATION.md`](../12-Miscellaneous/I18N_THEME_IMPLEMENTATION.md)
- ⚡ **快速参考**：[`I18N_THEME_QUICK_REFERENCE.md`](I18N_THEME_QUICK_REFERENCE.md)

**核心要点：**
- i18next：智能语言检测 + 持久化
- Zustand + CSS Variables：三种主题（light/dark/auto）
- matchMedia API：跟随系统主题

---

#### 服务端行为预测和防范
- 📖 **完整演讲稿**：[`SERVER_BEHAVIOR_PREDICTION_SPEECH.md`](SERVER_BEHAVIOR_PREDICTION_SPEECH.md)
- ⚡ **快速参考**：[`SERVER_BEHAVIOR_QUICK_REFERENCE.md`](SERVER_BEHAVIOR_QUICK_REFERENCE.md)

**核心要点：**
- 指数退避重试（2^n + Jitter）
- 两层队列防惊群（用户请求队列 + LLM 请求队列）
- Canvas 指纹防刷（跨浏览器识别 90-95%）
- 四层隐私保护（符合《个人信息保护法》）

---

#### 用户侧行为预测和防范 ⭐ 新增
- 📖 **完整演讲稿**：[`USER_BEHAVIOR_PREDICTION_SPEECH.md`](USER_BEHAVIOR_PREDICTION_SPEECH.md)
- ⚡ **快速参考**：[`USER_BEHAVIOR_QUICK_REFERENCE.md`](USER_BEHAVIOR_QUICK_REFERENCE.md)

**核心要点：**
- 虚拟列表（Virtuoso、性能提升 70%）
- 缓存 + 数据库协同（0ms 秒开、无闪烁）
- LocalStorage 加密（AES-GCM + 设备绑定）
- Markdown 容错（三层兜底、永不白屏）
- 渐进式传输（直接 + 压缩 + 分片，用户上传）
- 渐进式渲染（分批渲染 + 按需加载，后端超大内容）

---

#### LLM 侧行为预测和防范 ⭐ 新增
- 📖 **完整演讲稿**：[`LLM_BEHAVIOR_PREDICTION_SPEECH.md`](LLM_BEHAVIOR_PREDICTION_SPEECH.md)
- ⚡ **快速参考**：[`LLM_BEHAVIOR_QUICK_REFERENCE.md`](LLM_BEHAVIOR_QUICK_REFERENCE.md)

**核心要点：**
- Embedding 缓存节约 Token（向量相似度 0.95 + Redis，Token 节约 90%）
- 多 Agent 通信协议设计（统一 JSON 结构，Agent 协作稳定）
- JSON 格式修复保证讨论继续（jsonrepair + 正则 + LLM 语义理解，三层兜底）
- 月成本节约 $270（假设 100 活跃用户，90% 缓存命中率）

---

### 2. 前端技术

#### 前端综合面试准备
- 📖 **完整版**：[`FRONTEND_INTERVIEW_PREP.md`](FRONTEND_INTERVIEW_PREP.md)

**包含主题：**
- SSE 流式渲染
- 虚拟滚动（Virtuoso）
- React 性能优化
- 渐进式加载
- 设备指纹与隐私保护

---

### 3. 架构文档

#### Clean Architecture 重构
- 📖 **详细文档**：[`../01-Architecture-Refactoring/`](../01-Architecture-Refactoring/)

**核心要点：**
- 依赖注入（DI Container）
- 分层架构（Domain → Application → Infrastructure）
- 单一职责原则

---

#### 流式处理架构
- 📖 **详细文档**：[`../03-Streaming/`](../03-Streaming/)

**核心要点：**
- SSE 重连机制
- 指数退避算法
- 多 Agent 流式协作

---

#### 大文本处理
- 📖 **详细文档**：[`../05-Large-Text-Handling/`](../05-Large-Text-Handling/)

**核心要点：**
- 分片上传（2MB 分片）
- 渐进式加载（虚拟滚动 + 懒加载）
- 内存保护（LRU 缓存）

---

### 4. 安全系统

#### 无登录安全方案
- 📖 **详细文档**：[`../02-Security-System/SECURITY_NO_LOGIN_SYSTEM.md`](../02-Security-System/SECURITY_NO_LOGIN_SYSTEM.md)
- ⚡ **快速入门**：[`../../SECURITY_QUICK_START.md`](../../SECURITY_QUICK_START.md)

**核心要点：**
- 设备绑定（IP + UA + Canvas）
- 数据加密（AES-GCM）
- 行为分析（异常检测）

---

## 🎯 按场景查找

### 场景 1：面试前 5 分钟

**快速参考卡片（必看）：**
1. [用户侧行为预测 - 快速参考](USER_BEHAVIOR_QUICK_REFERENCE.md) ⭐ 新增
2. [LLM 侧行为预测 - 快速参考](LLM_BEHAVIOR_QUICK_REFERENCE.md) ⭐ 新增
3. [服务端行为预测 - 快速参考](SERVER_BEHAVIOR_QUICK_REFERENCE.md)
4. [国际化与主题 - 快速参考](I18N_THEME_QUICK_REFERENCE.md)

**推荐顺序：**
1. 先看用户侧行为预测（5 分钟）
2. 再看 LLM 侧行为预测（5 分钟）⭐ 新增
3. 然后复习服务端行为预测（5 分钟）
4. 最后复习国际化与主题（3 分钟）

---

### 场景 2：技术深入面试

**推荐顺序：**
1. [用户侧行为预测 - 完整演讲稿](USER_BEHAVIOR_PREDICTION_SPEECH.md) (10 分钟完整版) ⭐ 新增
2. [LLM 侧行为预测 - 完整演讲稿](LLM_BEHAVIOR_PREDICTION_SPEECH.md) (10 分钟完整版) ⭐ 新增
3. [服务端行为预测 - 完整演讲稿](SERVER_BEHAVIOR_PREDICTION_SPEECH.md) (10 分钟完整版)
4. [V2 工具系统 - 实现总结](../../api/tools/v2/IMPLEMENTATION_SUMMARY.md)
5. [高并发解决方案](../06-Performance-Optimization/HIGH_CONCURRENCY_SOLUTION.md)
6. [前端综合面试](FRONTEND_INTERVIEW_PREP.md)

---

### 场景 3：架构设计面试

**推荐顺序：**
1. [Clean Architecture 重构](../01-Architecture-Refactoring/)
2. [流式处理架构](../03-Streaming/)
3. [无登录安全方案](../02-Security-System/SECURITY_NO_LOGIN_SYSTEM.md)

---

### 场景 4：性能优化面试

**推荐顺序：**
1. [高并发解决方案](../06-Performance-Optimization/HIGH_CONCURRENCY_SOLUTION.md)
2. [大文本处理](../05-Large-Text-Handling/)
3. [前端性能优化](FRONTEND_INTERVIEW_PREP.md)（虚拟滚动、渐进式加载）

---

## 📊 核心数据速查

| 指标 | 数值 | 说明 |
|-----|------|------|
| **虚拟列表性能提升** | 70% | 2 秒 → 0.6 秒 |
| **渐进式渲染性能提升** | 90% | 10 秒 → 0.5 秒 |
| **首屏加载时间** | 0ms | LocalStorage 缓存 |
| **加密算法** | AES-GCM | 设备绑定 |
| **Markdown 容错率** | 100% | 三层兜底 |
| **压缩率** | 70% | gzip，5MB → 1.5MB |
| **分片大小** | 50KB | 平衡效率和模型友好性 |
| **Canvas 识别准确率** | 90-95% | 跨浏览器设备识别 |
| **重试成功率提升** | 30% | 指数退避相比固定间隔 |
| **最大并发支持** | 500 用户 | 两层队列 + 限流 |
| **SSE 并发限制** | 200 | 用户请求队列 |
| **LLM API 并发限制** | 50 | LLM 请求队列 |
| **LLM API RPM 限制** | 500/分钟 | 滑动窗口 |
| **SSE 最大重连次数** | 3 次 | 指数退避 |
| **Token 节约** | 60% | 5000 → 2000 tokens |
| **LLM 成本降低** | 60% | $0.01 → $0.004/次 |
| **月成本节约** | $1800 | 假设 1000 活跃用户 |
| **内存限制** | 200 条消息 | 约 100KB 内存 |
| **LRU 缓存上限** | 20 个对话 | 7 天过期 |

---

## 🔥 最新更新

### 2025-01-03
- ✅ 新增：[LLM 侧行为预测和防范 - 完整演讲稿](LLM_BEHAVIOR_PREDICTION_SPEECH.md) ⭐ 最新
- ✅ 新增：[LLM 侧行为预测 - 快速参考](LLM_BEHAVIOR_QUICK_REFERENCE.md) ⭐ 最新
- ✅ 新增：[用户侧行为预测和防范 - 完整演讲稿](USER_BEHAVIOR_PREDICTION_SPEECH.md)
- ✅ 新增：[用户侧行为预测 - 快速参考](USER_BEHAVIOR_QUICK_REFERENCE.md)
- ✅ 新增：[服务端行为预测和防范 - 完整演讲稿](SERVER_BEHAVIOR_PREDICTION_SPEECH.md)
- ✅ 新增：[服务端行为预测 - 快速参考](SERVER_BEHAVIOR_QUICK_REFERENCE.md)
- ✅ 更新：[国际化与主题 - 完整实现](../12-Miscellaneous/I18N_THEME_IMPLEMENTATION.md)
- ✅ 更新：[国际化与主题 - 快速参考](I18N_THEME_QUICK_REFERENCE.md)

---

## 💡 使用建议

### 面试前一天
1. 通读所有 **完整版** 文档（约 2-3 小时）
2. 理解核心原理和技术细节
3. 准备好自己的理解和扩展

### 面试前 1 小时
1. 复习所有 **快速参考** 卡片（约 20 分钟）
2. 重点看量化指标和关键术语
3. 默念几遍演讲脚本

### 面试前 5 分钟
1. 只看 **快速参考** 卡片
2. 过一遍核心要点
3. 深呼吸，保持自信

---

## 📞 联系方式

如果发现文档有误或需要补充，请及时更新。

祝你面试顺利！🎉
