# Lighthouse Flow 生产压测稳定化（feat/lcp-phase1-3）

## 背景

本轮改动目标是让多 Agent 历史场景的 Lighthouse User Flow 压测更稳定、结果更可解释，并同步落地首屏 LCP 优化的 1-3 项实施：

1. 生产模式压测入口可复用；
2. 重数据延后注入，降低首屏主线程压力；
3. 历史多 Agent 卡片首屏先展示摘要，按需再展开完整内容。

---

## 本分支代码改动总览

### 1) Chat 首屏渲染策略优化

- 文件：`src/components/business/Chat/ChatInterfaceRefactored.tsx`
- 改动点：
  - `perfMock` 不再一次性注入全部重消息；
  - 先注入轻量首屏消息，再通过 `runWhenIdle + setTimeout + startTransition` 补齐重数据；
  - `?perfMock=1` 在本地生产压测（localhost）同样可用，便于接近真实构建环境。
- 目的：
  - 减少首屏渲染期同步工作量，缩短 LCP 的 render delay。

### 2) 多 Agent 历史卡片首屏降载

- 文件：`src/components/business/Message/MessageItemRenderer.tsx`
- 改动点：
  - 新增摘要卡模式：首屏默认仅展示轮次/状态/共识度摘要；
  - 点击“查看完整讨论过程”后再懒加载 `MultiAgentDisplay`。
- 目的：
  - 避免初始阶段渲染大量 Markdown 与复杂 DOM，降低首屏阻塞。

### 3) Lighthouse Flow 脚本稳定化

- 文件：`scripts/run-lighthouse-user-flow-multi-agent.js`
- 改动点：
  - 增加 `HEADLESS` 开关，支持前台可视化排障；
  - 增加页面空白检测（Fail Fast），避免产出 NO_FCP 无效报告；
  - 失败时自动输出 debug 截图与 console/page error 摘要；
  - 增加构建产物引用一致性校验（HTML 引用脚本必须在 dist 存在）；
  - 统一端口清理流程，避免 `EADDRINUSE` 干扰；
  - 生产压测模式切换为 `static`（`http-server dist`），提升可重复性。

### 4) NPM 脚本入口

- 文件：`package.json`
- 新增/调整：
  - `bench:lighthouse:flow:multi-agent:prod`
  - `bench:lighthouse:flow:multi-agent:prod:headed`
- 默认使用 `FLOW_MODE=static`，保证本地压测路径可复现。

---

## 为什么生产压测采用 static 模式

在本项目当前配置下，直接走 `start/serve` 可能出现以下不稳定因素：

- 路由/入口处理与静态资源探测存在差异，影响探针判定；
- 端口占用与启动时序更复杂，容易误报“未启动”；
- 不同模式对开发特性注入行为不同，可能引入额外噪声。

`static + dist` 的优势是：

- 资源路径与构建产物一一对应，可快速定位缺失引用；
- 启动简单，利于 CI 或本地重复跑；
- 适合当前“首屏渲染能力 + 交互流”压测目标。

---

## 当前压测流程（推荐）

```bash
npm run bench:lighthouse:flow:multi-agent:prod
```

如需可视化排障：

```bash
npm run bench:lighthouse:flow:multi-agent:prod:headed
```

输出目录：

- `test/bench-results/*.html`
- `test/bench-results/*.json`
- 失败时附带 `*-debug.png`

---

## 已知 404 说明（静态压测下属预期）

在 `FLOW_MODE=static` 下，前端访问下列 API 会 404：

- `/api/auth/csrf`
- `/api/auth/me`
- `/api/conversations...`

原因：静态服务器不承载 BFF API。  
这类 404 属于压测噪声，不影响“首屏渲染 + 交互过程”性能观测本身。

如需进一步降噪，可在 `perfMock` 压测模式下短路鉴权/会话 API 请求（后续可选项）。

---

## 后续建议

1. 将 `perfMock` 模式的 API 请求短路，减少 console error 干扰；
2. 在 CI 中固定一组 flow 脚本参数，做趋势对比（LCP/INP/TBT）；
3. 若要评估“真实后端路径”下的最终数据，再补一组 BFF 联调压测基线。

