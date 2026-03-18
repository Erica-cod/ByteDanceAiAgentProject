# AI Agent 项目文档索引

本目录记录了项目从零到一的完整开发历程：每个技术决策的背景、方案对比、最终选择和实际效果。按模块编号排列，每个目录对应一个核心主题。

> 如果两个文档主题相近，通常是**修改时间更新的那篇**包含了更完善的思考和优化。

---

## 目录结构

```
docs/
├── 00-Project-Overview/            项目总览、架构决策、STAR 故事
├── 01-Architecture-Refactoring/    Clean Architecture 迁移全过程
│   ├── clean-architecture/           CA 核心文档（原则、示例、指南）
│   ├── phases/                       分阶段重构记录（Phase 1/2/3）
│   ├── migration/                    代码迁移对照与状态分析
│   └── troubleshooting/              重构中遇到的坑和修复
├── 02-Security-System/             安全认证体系
│   ├── auth/                         OAuth/OIDC、IdP、限流降级
│   └── cors/                         CORS 配置与更新记录
├── 03-Streaming/                   SSE 流式传输
│   ├── resume/                       断点续传（机制、内存保护、意图识别）
│   └── connection/                   连接管理（守卫、中断修复、跨 Tab）
├── 04-Multi-Agent/                 多智能体协作系统
├── 05-Large-Text-Handling/         大文本处理
│   ├── chunking/                     分片策略（容错、续传、存储方案）
│   └── upload/                       上传优化（渐进式、压缩对比、文件系统）
├── 06-Performance-Optimization/    前端性能优化
│   ├── web-vitals/                   Core Web Vitals（LCP、CLS、SSR）
│   ├── react-rendering/              React 渲染（Hooks、虚拟列表、内存、事件）
│   ├── build-startup/                构建与启动（Bundle、开发启动、环境配置）
│   ├── Bundle-Analyzer-P0/           Bundle 分析报告
│   ├── Large-Markdown-Optimization/  大 Markdown 渲染优化
│   └── Lighthouse-Flow-Prod-Stabilization/ Lighthouse 压测与稳定化
├── 07-Tools-System/                LLM 工具调用与防幻觉
├── 08-Data-Management/             缓存策略、数据库设计、Redis
├── 09-Third-Party-Integration/     LLM 集成（Ollama、火山引擎、Embedding）
├── 10-Deployment/                  部署运维
│   └── docker/                       Docker 配置（部署、迁移、MongoDB、Redis）
├── 11-Interview-Prep/              面试准备
│   ├── questions/                    追问题库（按模块分类）
│   └── transcripts/                  面试演讲稿（可照读版）
└── 12-Miscellaneous/               杂项
    ├── i18n-theme/                   国际化与主题切换
    ├── json-repair/                  JSON 修复（垃圾字符、策略、实现）
    └── markdown-tolerance/           Markdown 容错（方案、实现、react-markdown）
```

---

## 各模块说明

### 00-Project-Overview — 项目总览

项目整体架构、技术设计文档、STAR 法则故事。

| 核心文档 | 内容 |
|---------|------|
| `TECHNICAL_DESIGN_DOC.md` | 多 Agent 协作系统技术方案 |
| `ARCHITECTURE_DECISION.md` | 架构决策记录与数据规模分析 |
| `FINAL_SUMMARY.md` | 项目重构与优化总结 |
| `Star1.md` | STAR 法则版项目亮点故事 |

---

### 01-Architecture-Refactoring — 架构重构

从传统架构迁移到 Clean Architecture 的完整历程，含分阶段记录。

| 子目录 | 内容 |
|--------|------|
| `clean-architecture/` | CA 核心原则、迁移指南、回滚方案、重构示例 |
| `phases/` | Phase 1 清理 → Phase 2 Handler/Service → Phase 3 Message |
| `migration/` | 新旧代码映射表、迁移状态分析、Redis→MongoDB 迁移 |
| `troubleshooting/` | Modern.js 路由 BUG、下划线扫描问题、GitHub 调研 |

根目录保留高级文档：BFF 方案、前端组件重构、Docker 重构等。

| 子目录 | 内容 |
|--------|------|
| `convergence-refactoring/` | 收敛性重构系列（P0 消除重复实现、P1 拆分 chat.ts + 合并流处理器、P2 规则外部化 + 遗留工作流清理 + 管理端鉴权） |

---

### 02-Security-System — 安全认证

| 核心文档 | 内容 |
|---------|------|
| `SSO_OAUTH2_BFF_DESIGN.md` | SSO + OAuth2/OIDC + BFF 设计 |
| `IDP_OIDC_PROVIDER_QUICKSTART.md` | 自研 IdP 快速开始 |
| `SECURITY_NO_LOGIN_SYSTEM.md` | 无登录安全方案（设备指纹 + 加密缓存） |
| `AUTH_RATE_LIMIT_RESILIENCE_DESIGN.md` | 认证限流与 Redis 降级 |

---

### 03-Streaming — 流式传输

SSE 流式传输的完整实现：自适应背压、断点续传、连接守卫。

| 核心文档 | 内容 |
|---------|------|
| `ADAPTIVE_STREAMING_GUIDE.md` | 自适应流式传输（背压检测、打字机效果） |
| `STREAM_RESUME_GUIDE.md` | 断点续传机制 |
| `STREAM_RESUME_USER_INTENT.md` | 区分主动停止与网络波动 |
| `SSE_CONNECTION_GUARD.md` | 连接断开保护 |
| `useSSEStream-ARCHITECTURE.md` | useSSEStream Hook 架构设计 |

---

### 04-Multi-Agent — 多智能体系统

| 核心文档 | 内容 |
|---------|------|
| `MULTI_AGENT_PROTOCOL.md` | 多 Agent 协作 JSON 协议规范 |
| `MULTI_AGENT_IMPLEMENTATION_SUMMARY.md` | 实现总结 |
| `MULTI_AGENT_STREAMING_PERFORMANCE_OPTIMIZATION.md` | 流式输出与 CLS 优化 |

---

### 05-Large-Text-Handling — 大文本处理

| 核心文档 | 内容 |
|---------|------|
| `COMPLETE_LARGE_TEXT_SOLUTION.md` | 端到端完整方案 |
| `COMPRESSION_VS_CHUNKING_ANALYSIS.md` | 压缩 vs 分片技术决策 |
| `PROGRESSIVE_UPLOAD_STRATEGY.md` | 渐进式上传策略 |
| `CHUNKING_FAULT_TOLERANCE_GUIDE.md` | 分片容错机制 |

---

### 06-Performance-Optimization — 性能优化

前端全链路性能优化，从 Web Vitals 到 Bundle 到内存泄漏。

| 核心文档 | 内容 |
|---------|------|
| `LCP_OPTIMIZATION_GUIDE.md` | 最大内容绘制优化 |
| `CLS_OPTIMIZATION_GUIDE.md` | 累积布局偏移优化 |
| `FINAL_PERFORMANCE_REPORT.md` | 最终性能报告 |
| `MEMORY_LEAK_FIX.md` | 内存泄漏排查与修复 |
| `DEV_STARTUP_OPTIMIZATION.md` | 开发环境启动速度优化 |
| `HIGH_CONCURRENCY_SOLUTION.md` | 高并发解决方案 |

子目录：`Bundle-Analyzer-P0/`、`Large-Markdown-Optimization/`、`Lighthouse-Flow-Prod-Stabilization/`

---

### 07-Tools-System — 工具调用系统

| 核心文档 | 内容 |
|---------|------|
| `TOOL_CALLING_IMPLEMENTATION.md` | 工具调用完整实现 |
| `TOOL_HALLUCINATION_PREVENTION.md` | LLM 工具幻觉防范 |
| `PLANNING_TOOLS_GUIDE.md` | 计划管理工具指南 |

---

### 08-Data-Management — 数据管理

| 核心文档 | 内容 |
|---------|------|
| `DATABASE_DESIGN.md` | MongoDB 数据库设计 |
| `CACHE_CLEANUP_STRATEGY.md` | 缓存清理（TTL 索引） |
| `REQUEST_CACHE_GUIDE.md` | 请求缓存与 Embedding 匹配 |
| `CONVERSATION_MEMORY_GUIDE.md` | 对话记忆管理 |

> 另见：`09-Third-Party-Integration/REMOTE_MODEL_LOAD_OPTIMIZATION.md` — 三级语义缓存 (L1/L2/L3) 与上下文压缩策略

---

### 09-Third-Party-Integration — 第三方 / LLM 集成

| 核心文档 | 内容 |
|---------|------|
| `OLLAMA_MULTI_MODEL_FORMAT_COMPATIBILITY.md` | Ollama 多模型流式格式兼容方案 |
| `VOLCENGINE_DOUBAO_GUIDE.md` | 火山引擎豆包集成 |
| `REMOTE_MODEL_LOAD_OPTIMIZATION.md` | 远程模型负载调度优化（智能路由 + 分级缓存 + 上下文压缩） |
| `EMBEDDING_SETUP_GUIDE.md` | Embedding 模型配置 |
| `TAVILY_SEARCH_GUIDE.md` | Tavily 搜索集成 |
| `LANGGRAPH_WORKFLOW_GUIDE.md` | LangGraph 工作流 |

---

### 10-Deployment — 部署运维

| 核心文档 | 内容 |
|---------|------|
| `GLOBAL_DEPLOYMENT_GUIDE.md` | 全球化部署指南 |
| `DEPLOYMENT_GUIDE.md` | Jenkins + Docker CI/CD |
| `ENV_SETUP_GUIDE.md` | 环境变量配置 |

---

### 11-Interview-Prep — 面试准备

| 路径 | 内容 |
|------|------|
| `FRONTEND_INTERVIEW_PREP.md` | 前端面试综合准备 |
| `INTERVIEW_TRANSCRIPT.md` | 面试演讲稿总纲 |
| `questions/` | 按模块分类的追问题库 |
| `transcripts/` | 各专题面试演讲稿（可照读版） |

---

### 12-Miscellaneous — 杂项

| 核心文档 | 内容 |
|---------|------|
| `I18N_AND_THEME_GUIDE.md` | 国际化与主题切换 |
| `JSON_REPAIR_IMPLEMENTATION.md` | JSON 修复实现 |
| `MARKDOWN_FAULT_TOLERANCE.md` | Markdown 容错处理 |
| `DEVICE_CLEANUP_SINGLETON_FIX.md` | 设备清理单例修复 |

---

## 新增文档指南

往项目里加新文档时，遵循以下规则：

### 1. 放对目录

根据文档主题，放到对应编号的目录下。如果涉及多个主题，放到**最核心**的那个。

| 主题关键词 | 放到 |
|-----------|------|
| 架构、重构、Clean Architecture | `01-Architecture-Refactoring/` |
| 认证、安全、CORS、OAuth | `02-Security-System/` |
| SSE、流式、续流、背压 | `03-Streaming/` |
| 多 Agent、协作、工作流 | `04-Multi-Agent/` |
| 大文本、分片、上传 | `05-Large-Text-Handling/` |
| 性能、LCP、CLS、Bundle、内存 | `06-Performance-Optimization/` |
| 工具调用、Function Calling | `07-Tools-System/` |
| 缓存、数据库、Redis | `08-Data-Management/` |
| Ollama、火山引擎、LLM、Embedding | `09-Third-Party-Integration/` |
| Docker、部署、CI/CD、环境变量 | `10-Deployment/` |
| 面试、演讲稿 | `11-Interview-Prep/` |
| 以上都不沾边 | `12-Miscellaneous/` |

### 2. 命名规范

```
大写蛇形: FEATURE_NAME_DESCRIPTION.md

好: OLLAMA_MULTI_MODEL_FORMAT_COMPATIBILITY.md
好: STREAM_RESUME_USER_INTENT.md
差: stream-resume.md
差: 流式续传说明.md
```

### 3. 内容结构

每篇文档建议包含：

```markdown
# 标题

## 一、问题背景
为什么要做这个？遇到了什么问题？

## 二、方案设计
考虑了哪些方案？为什么选这个？

## 三、实现细节
改了哪些文件？核心逻辑是什么？

## 四、效果验证
怎么验证的？结果如何？
```

### 4. 更新 README

新增文档后，在本文件对应模块的表格中加一行即可。

### 5. 同主题迭代

如果是对已有文档主题的升级（比如更优的方案），直接写新文档，不用删旧的。新文档的修改时间会比旧的晚，自然能看出演进顺序。
