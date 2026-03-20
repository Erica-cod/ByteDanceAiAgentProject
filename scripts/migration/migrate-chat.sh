#!/bin/bash

# Chat.ts 重构迁移脚本
# 使用方法: bash scripts/migrate-chat.sh

echo "🚀 开始迁移 chat.ts 文件..."
echo ""

# 检查文件是否存在
if [ ! -f "api/lambda/chat.simplified.ts" ]; then
    echo "❌ 错误: api/lambda/chat.simplified.ts 不存在"
    exit 1
fi

# 备份旧文件
if [ -f "api/lambda/chat.ts" ]; then
    echo "📦 备份旧文件..."
    cp api/lambda/chat.ts api/lambda/chat.backup.ts
    echo "✅ 已备份到: api/lambda/chat.backup.ts"
    echo ""
fi

# 替换文件
echo "🔄 替换文件..."
mv api/lambda/chat.simplified.ts api/lambda/chat.ts
echo "✅ 已替换 api/lambda/chat.ts"
echo ""

# 显示文件行数对比
echo "📊 文件行数对比："
echo "  旧文件: $(wc -l < api/lambda/chat.backup.ts) 行"
echo "  新文件: $(wc -l < api/lambda/chat.ts) 行"
echo ""

echo "🎉 迁移完成！"
echo ""
echo "📝 下一步："
echo "  1. 启动服务: npm run dev"
echo "  2. 测试功能是否正常"
echo "  3. 如果有问题，恢复备份: cp api/lambda/chat.backup.ts api/lambda/chat.ts"
echo ""
echo "📚 详细文档: docs/CHAT_REFACTORING_GUIDE.md"

