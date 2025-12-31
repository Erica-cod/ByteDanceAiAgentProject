# 🏗️ 后端重构指南

## 快速导航

本项目正在进行后端架构重构，采用 **Clean Architecture + BFF** 模式。

### 📚 完整文档

所有重构文档位于 `docs/` 目录：

| 文档 | 适合人群 | 阅读时间 |
|------|----------|----------|
| **[📋 文档索引](./docs/REFACTORING_INDEX.md)** | 所有人 | 5 分钟 |
| **[🎯 重构方案总览](./docs/BACKEND_REFACTORING_PLAN.md)** | 项目负责人、架构师 | 20-30 分钟 |
| **[💻 代码示例详解](./docs/REFACTORING_EXAMPLES.md)** | 开发人员 | 30-40 分钟 |
| **[🚀 快速开始指南](./docs/REFACTORING_QUICK_START.md)** | 立即上手的开发者 | 15 分钟 + 1 小时实操 |
| **[🗺️ 迁移对照表](./docs/MIGRATION_MAPPING.md)** | 执行迁移的开发者 | 20 分钟 |

---

## 🎯 为什么要重构？

### 当前问题
- ❌ **职责不清**：services 混合了业务逻辑、数据访问、外部服务调用
- ❌ **依赖混乱**：相互依赖、循环引用
- ❌ **难以测试**：需要真实数据库，无法独立测试
- ❌ **难以扩展**：修改一个功能影响多个文件

### 重构目标
- ✅ **清晰的分层架构**：Presentation → Application → Domain ← Infrastructure
- ✅ **符合 BFF 模式**：利用 Modern.js BFF 特性
- ✅ **易于维护**：代码结构清晰，职责单一
- ✅ **便于扩展**：支持新功能快速接入
- ✅ **提高可测试性**：各层独立，易于单元测试

---

## 📊 新架构预览

```
api/
├── presentation/        # 表示层（API 路由、DTO、验证）
├── application/        # 应用层（Use Cases、接口定义）
├── domain/            # 领域层（实体、业务规则）
├── infrastructure/    # 基础设施层（数据库、外部服务、AI Agents）
└── shared/            # 共享代码（配置、工具）
```

**参考架构：** [eShopOnWeb](https://github.com/dotnet-architecture/eShopOnWeb) (Microsoft .NET 示例应用)

---

## 🚀 立即开始

### 如果你想快速上手
👉 阅读 [快速开始指南](./docs/REFACTORING_QUICK_START.md)，1 小时内完成第一个模块重构

### 如果你想全面了解
👉 从 [文档索引](./docs/REFACTORING_INDEX.md) 开始，按推荐顺序阅读

### 如果你准备开始迁移
👉 使用 [迁移对照表](./docs/MIGRATION_MAPPING.md)，查看每个文件的迁移方式

---

## 📅 实施进度

- [ ] **Phase 1:** 基础设施搭建（1-2 天）
- [ ] **Phase 2:** 数据层重构（2-3 天）
- [ ] **Phase 3:** 业务逻辑层重构（3-5 天）
- [ ] **Phase 4:** AI 功能迁移（3-5 天）
- [ ] **Phase 5:** API 层重构（2-3 天）
- [ ] **Phase 6:** 清理和优化（1-2 天）

**预计总时间：** 2-3 周

---

## 🎓 学习路径

### 新手
```
1. 阅读"重构方案总览"理解整体架构（30 分钟）
2. 跟着"快速开始指南"实操（1 小时）
3. 阅读"代码示例"深入理解（40 分钟）
4. 使用"迁移对照表"迁移其他模块
```

### 有经验者
```
1. 快速浏览"重构方案总览"（30 分钟）
2. 按照"快速开始指南"完成第一个模块（1 小时）
3. 直接使用"迁移对照表"快速迁移
```

---

## ✅ 重构原则

1. **增量迁移**：一次只重构一个模块，保持系统可运行
2. **保持向后兼容**：新旧代码并行，逐步替换
3. **测试先行**：重构前确保有测试覆盖
4. **小步提交**：每完成一个小功能就提交
5. **及时文档**：更新架构文档和 README

---

## 🆘 获取帮助

- 查阅各文档的 **FAQ** 部分
- 参考 [代码示例](./docs/REFACTORING_EXAMPLES.md)
- 团队内讨论

---

## 📚 推荐阅读

- [eShopOnWeb - Microsoft 参考应用](https://github.com/dotnet-architecture/eShopOnWeb)
- [Clean Architecture - Robert C. Martin](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Modern.js BFF 文档](https://modernjs.dev/guides/features/server-side/bff/function.html)
- [Domain-Driven Design Reference](https://domainlanguage.com/ddd/reference/)

---

**开始你的重构之旅！** 🎉

👉 [查看完整文档索引](./docs/REFACTORING_INDEX.md)

