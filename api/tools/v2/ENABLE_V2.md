# 🚀 启用工具系统 V2 (Function Calling)

## 📋 概述

工具系统 V2 已实现完整的 Function Calling 支持，通过环境变量控制启用。

## 🔧 如何启用

### 方法 1：修改 `.env` 文件（推荐）

在项目根目录的 `.env` 文件中添加：

```bash
# 启用工具系统 V2 (Function Calling)
TOOL_SYSTEM_V2=true
```

### 方法 2：启动时设置环境变量

#### Windows (PowerShell)
```powershell
$env:TOOL_SYSTEM_V2="true"; npm run dev
```

#### Windows (CMD)
```cmd
set TOOL_SYSTEM_V2=true && npm run dev
```

#### Linux / macOS
```bash
TOOL_SYSTEM_V2=true npm run dev
```

---

## 📊 V1 vs V2 对比

| 特性 | V1 (Prompt-based) | V2 (Function Calling) |
|------|-------------------|----------------------|
| **工具定义方式** | System Prompt 中描述 | 通过 `tools` 参数传递 |
| **模型输出** | 文本（需解析） | 结构化 JSON |
| **准确性** | 容易幻觉 | 高准确性 |
| **Token 消耗** | 高（每次都描述工具） | 低（只传一次 Schema） |
| **限流保护** | ✅ | ✅ |
| **缓存优化** | ✅ | ✅ |
| **熔断保护** | ✅ | ✅ |
| **工具编排** | ❌ | ✅ |
| **监控指标** | ✅ | ✅ |

---

## 🎯 V2 的优势

### 1. 更高的准确性
```
V1: 模型可能输出 <tool_call>{"tool": "search", ...}</tool_call>
    ❌ 工具名错误（正确应该是 search_web）

V2: 模型只能选择定义的工具
    ✅ 不会出现工具名错误
```

### 2. 更少的 Token 消耗
```
V1: 每次请求都在 System Prompt 中包含工具描述（~500 tokens）
V2: 只在第一次传递 Schema，后续不重复（节省 ~70% tokens）
```

### 3. 结构化输出
```
V1: "<tool_call>{"tool":"search_web","query":"AI"}</tool_call>"
    需要正则解析，可能失败

V2: {
      "tool_calls": [{
        "id": "call_123",
        "function": {
          "name": "search_web",
          "arguments": "{\"query\":\"AI\"}"
        }
      }]
    }
    结构化数据，直接使用
```

### 4. 工具编排支持
```
V1: 只能单步执行工具
V2: 支持多步执行计划
    - 依赖解析
    - 变量引用
    - 失败策略
```

---

## 🧪 测试 V2

### 1. 启动项目
```bash
# 设置环境变量
TOOL_SYSTEM_V2=true npm run dev
```

### 2. 查看启动日志
应该看到：
```
🚀 初始化可插拔工具系统 V2
══════════════════════════════════════════════════
✅ 工具 "search_web" 已注册 (v1.0.0)
✅ 工具 "create_plan" 已注册 (v1.0.0)
...
✅ 工具系统初始化完成
```

### 3. 发送测试请求
```bash
POST http://localhost:8080/api/chat
Content-Type: application/json

{
  "message": "搜索 AI 最新动态",
  "userId": "test_user",
  "modelType": "local"
}
```

### 4. 查看运行日志
应该看到：
```
🔧 工具系统版本: V2 (Function Calling)
🔧 传递 5 个工具定义给模型
🔧 [V2] 检测到 Function Calling: [...]
🔧 [V2] 执行工具: search_web
✅ 工具执行成功 (234ms, 缓存: false)
```

### 5. 查看监控数据
```bash
GET http://localhost:8080/api/tool-system-status
```

---

## 🔄 切回 V1

如果 V2 有问题，可以立即切回 V1：

### 方法 1：修改 `.env`
```bash
# 禁用 V2，使用 V1
TOOL_SYSTEM_V2=false
# 或者删除这一行
```

### 方法 2：重启时不设置环境变量
```bash
npm run dev  # 默认使用 V1
```

---

## 📝 已知限制

### 1. 模型支持
- ✅ **Ollama 0.3.0+**: 完全支持 Function Calling
- ✅ **火山引擎豆包**: 完全支持 Function Calling
- ❌ **旧版 Ollama**: 不支持（请升级）

### 2. 递归工具调用
当前 V2 实现对多轮工具调用的处理较简单，后续会优化：
- ✅ 单轮工具调用
- ⚠️ 多轮工具调用（需要优化递归处理）

---

## 🐛 问题排查

### 问题 1：启动后没有看到 V2 初始化日志
**原因：** 环境变量未生效

**解决：**
```bash
# 检查环境变量
echo $env:TOOL_SYSTEM_V2  # PowerShell
echo %TOOL_SYSTEM_V2%     # CMD
echo $TOOL_SYSTEM_V2      # Linux/macOS

# 确保值是 "true"（字符串）
```

### 问题 2：模型返回 "工具调用错误"
**原因：** 模型不支持 Function Calling

**解决：**
```bash
# 检查 Ollama 版本
ollama --version  # 应该 >= 0.3.0

# 或切回 V1
TOOL_SYSTEM_V2=false npm run dev
```

### 问题 3：工具调用没有被限流
**原因：** 兼容适配器被移除了

**解决：**
V2 直接使用 `toolExecutor.execute()`，已集成限流保护。查看监控接口确认：
```bash
GET http://localhost:8080/api/tool-system-status
```

---

## 📞 需要帮助？

查看完整文档：
- [README.md](./README.md) - 系统架构
- [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - 实现总结
- [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) - 迁移指南

---

**祝测试顺利！** 🎉

