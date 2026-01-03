# 环境变量配置说明

## 性能优化环境变量

为了启用所有性能优化，请手动创建 `.env.development.local` 文件（在项目根目录）：

### 创建文件

在项目根目录创建 `.env.development.local` 文件，添加以下内容：

```bash
# Development environment performance optimizations

# Enable fast refresh
FAST_REFRESH=true

# Disable type checking (use IDE checking)
TSC_COMPILE_ON_ERROR=true

# Increase Node.js memory limit (4GB)
NODE_OPTIONS=--max-old-space-size=4096

# Enable parallel builds
MODERN_JS_PARALLEL=true
```

### 说明

- **FAST_REFRESH**: 启用快速刷新（React Fast Refresh）
- **TSC_COMPILE_ON_ERROR**: 即使有类型错误也继续编译（依赖 IDE 检查）
- **NODE_OPTIONS**: 增加 Node.js 内存限制到 4GB（根据机器配置调整）
- **MODERN_JS_PARALLEL**: 启用并行构建

### 根据机器配置调整

#### 如果内存较小（8GB）
```bash
NODE_OPTIONS=--max-old-space-size=2048  # 2GB
```

#### 如果内存充足（32GB+）
```bash
NODE_OPTIONS=--max-old-space-size=8192  # 8GB
```

---

## 注意事项

⚠️ `.env.development.local` 文件已添加到 `.gitignore`，不会被提交到 Git  
✅ 这个文件仅用于本地开发环境  
✅ 不同开发者可以根据自己的机器配置调整

