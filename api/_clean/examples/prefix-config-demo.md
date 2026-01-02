# Modern.js BFF prefix 配置说明

## ❌ 常见误解

很多人认为 `bff.prefix` 可以控制扫描路径，但**实际上不是**！

## ✅ prefix 配置的真实作用

### 配置示例

```typescript
// modern.config.ts
export default defineConfig({
  bff: {
    prefix: '/api',  // ← 这只影响 URL，不影响扫描！
  },
});
```

### 实际效果

`prefix` 只是设置**URL 路由前缀**：

```
文件路径                     →    生成的 URL

api/lambda/chat.ts          →    /api/chat           (有 prefix)
api/lambda/user.ts          →    /api/user           (有 prefix)
api/lambda/health.ts        →    /api/health         (有 prefix)

如果 prefix: '/v1/api'：
api/lambda/chat.ts          →    /v1/api/chat        (不同的前缀)
```

## 🔍 文件扫描路径是什么？

Modern.js 的 BFF 插件**硬编码**扫描这些位置：

1. **固定扫描目录**：`api/` （无法配置）
2. **查找 BFF 文件**：`api/lambda/**/*.ts`
3. **应用忽略规则**：跳过 `_` 开头的文件/文件夹

**关键点**：`api/` 是硬编码的，你无法通过 `prefix` 改变它！

## 📊 对比说明

| 配置项 | 作用 | 可配置性 |
|--------|------|----------|
| `prefix` | 控制生成的 **URL 前缀** | ✅ 可配置 |
| 扫描目录 | 决定**扫描哪些文件** | ❌ 硬编码为 `api/` |
| BFF 路由目录 | Lambda 函数所在位置 | ❌ 硬编码为 `api/lambda/` |

## 🧪 实验验证

### 实验 1：修改 prefix

```typescript
// 配置
bff: { prefix: '/v2' }

// 结果
api/lambda/chat.ts  →  /v2/chat  ✅ URL 变了
api/_clean/         →  仍然被扫描 ❌ 扫描范围没变
```

### 实验 2：尝试改变扫描路径（不支持）

```typescript
// 理想的配置（但 Modern.js 不支持）
bff: {
  prefix: '/api',
  scanDir: 'api/lambda',      // ❌ 没有这个配置项
  exclude: ['api/_clean/**']   // ❌ 也没有这个配置项
}
```

## 💡 为什么会有这个误解？

很多其他框架的配置确实可以控制扫描路径：

```javascript
// Express.js
app.use('/api', router);  // 路径和挂载点一起设置

// Next.js
// pages/api/ 目录 - 路径和文件位置对应

// Modern.js
bff: { prefix: '/api' }  // ⚠️ 但这里不一样！
```

## 🔧 实际的解决方案

既然 `prefix` 无法控制扫描范围，我们只能：

### 方案 1：使用下划线前缀（当前方案）

```
api/
├── _clean/          ← 下划线前缀，告诉 Modern.js "别扫我"
│   └── ...
└── lambda/          ← BFF 路由
    └── ...
```

### 方案 2：物理隔离

```
项目根目录/
├── api/             ← 只放 BFF 路由
│   └── lambda/
└── backend/         ← Clean Architecture（完全独立）
    └── ...
```

### 方案 3：使用 .gitignore 风格的配置（如果未来支持）

```typescript
// 理想的未来配置
bff: {
  prefix: '/api',
  include: ['api/lambda/**'],    // 只包含这些
  exclude: ['api/_clean/**']      // 排除这些
}
```

## 📚 官方文档说明

根据 Modern.js 文档：

> `bff.prefix` 用于设置 BFF API 的路由前缀，默认为 `/api`

**注意**：文档中没有提到任何控制文件扫描路径的配置项。

## ✅ 结论

**`prefix` ≠ 扫描路径**

- `prefix` = URL 前缀（HTTP 请求路径）
- 扫描路径 = 硬编码为 `api/` 目录

所以，改 `prefix` 无法解决 `_clean/` 被扫描的问题！

---

**创建时间**：2026-01-02  
**目的**：澄清 Modern.js BFF prefix 配置的真实作用

