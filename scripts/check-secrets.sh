#!/bin/bash
# 安全检查脚本 - 在提交代码前检查是否有敏感信息泄露

set -e

echo "🔍 开始安全检查..."
echo ""

# 定义颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查结果计数
WARNINGS=0
ERRORS=0

# 检查 1: 是否有 .env 文件被 git 追踪
echo "📋 检查 1: 检查 .env 文件是否被 Git 追踪..."
if git ls-files --error-unmatch .env.local >/dev/null 2>&1 || \
   git ls-files --error-unmatch .env.production >/dev/null 2>&1 || \
   git ls-files --error-unmatch deploy/.env >/dev/null 2>&1; then
    echo -e "${RED}❌ 错误：敏感的 .env 文件被添加到 Git！${NC}"
    echo "   请运行: git rm --cached .env.local .env.production deploy/.env"
    ((ERRORS++))
else
    echo -e "${GREEN}✓ 通过${NC}"
fi
echo ""

# 检查 2: 搜索硬编码的 Tavily API Key
echo "📋 检查 2: 检查硬编码的 Tavily API Key..."
if grep -r "tvly-[a-zA-Z0-9]\{30,\}" \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    --exclude-dir=dist \
    --exclude="*.log" \
    --exclude="check-secrets.sh" \
    --exclude="SECURITY.md" \
    --exclude="ENV_SETUP_GUIDE.md" \
    . >/dev/null 2>&1; then
    echo -e "${RED}❌ 错误：发现硬编码的 Tavily API Key！${NC}"
    grep -rn "tvly-[a-zA-Z0-9]\{30,\}" \
        --exclude-dir=node_modules \
        --exclude-dir=.git \
        --exclude-dir=dist \
        --exclude="*.log" \
        --exclude="check-secrets.sh" \
        --exclude="SECURITY.md" \
        --exclude="ENV_SETUP_GUIDE.md" \
        . | head -5
    ((ERRORS++))
else
    echo -e "${GREEN}✓ 通过${NC}"
fi
echo ""

# 检查 3: 搜索 UUID 格式的 API Key (ARK API Key)
echo "📋 检查 3: 检查硬编码的 ARK API Key..."
if grep -rE "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}" \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    --exclude-dir=dist \
    --exclude="*.log" \
    --exclude="check-secrets.sh" \
    --exclude="package-lock.json" \
    --exclude="SECURITY.md" \
    --exclude="ENV_SETUP_GUIDE.md" \
    . >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  警告：发现 UUID 格式的字符串，可能是 API Key${NC}"
    grep -rnE "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}" \
        --exclude-dir=node_modules \
        --exclude-dir=.git \
        --exclude-dir=dist \
        --exclude="*.log" \
        --exclude="check-secrets.sh" \
        --exclude="package-lock.json" \
        --exclude="SECURITY.md" \
        --exclude="ENV_SETUP_GUIDE.md" \
        . | head -5
    echo "   请确认这些不是真实的 API Key"
    ((WARNINGS++))
else
    echo -e "${GREEN}✓ 通过${NC}"
fi
echo ""

# 检查 4: 搜索常见的密码模式
echo "📋 检查 4: 检查硬编码的密码..."
if grep -riE "(password|passwd|pwd)\s*[:=]\s*['\"]?[^'\",\s]{8,}['\"]?" \
    --exclude-dir=node_modules \
    --exclude-dir=.git \
    --exclude-dir=dist \
    --exclude="*.log" \
    --exclude="check-secrets.sh" \
    --exclude="*.md" \
    . >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  警告：发现疑似硬编码的密码${NC}"
    grep -rinE "(password|passwd|pwd)\s*[:=]\s*['\"]?[^'\",\s]{8,}['\"]?" \
        --exclude-dir=node_modules \
        --exclude-dir=.git \
        --exclude-dir=dist \
        --exclude="*.log" \
        --exclude="check-secrets.sh" \
        --exclude="*.md" \
        . | head -5
    echo "   请确认这些不是真实的密码"
    ((WARNINGS++))
else
    echo -e "${GREEN}✓ 通过${NC}"
fi
echo ""

# 检查 5: 检查 docker-compose.yml 中的硬编码值
echo "📋 检查 5: 检查 Docker Compose 配置..."
if [ -f "docker-compose.yml" ]; then
    if grep -E "TAVILY_API_KEY=tvly-|ARK_API_KEY=[0-9a-f]{8}-|REDIS_PASSWORD=.{8,}" docker-compose.yml >/dev/null 2>&1; then
        echo -e "${RED}❌ 错误：docker-compose.yml 中发现硬编码的敏感信息！${NC}"
        ((ERRORS++))
    else
        echo -e "${GREEN}✓ 通过${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  docker-compose.yml 不存在${NC}"
fi
echo ""

# 检查 6: 检查 Dockerfile 中的硬编码值
echo "📋 检查 6: 检查 Dockerfile 配置..."
if [ -f "Dockerfile" ]; then
    if grep -E "ENV (TAVILY_API_KEY|ARK_API_KEY|REDIS_PASSWORD)=.+" Dockerfile >/dev/null 2>&1; then
        echo -e "${RED}❌ 错误：Dockerfile 中发现硬编码的敏感信息！${NC}"
        ((ERRORS++))
    else
        echo -e "${GREEN}✓ 通过${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Dockerfile 不存在${NC}"
fi
echo ""

# 总结
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 检查结果汇总："
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${RED}错误: $ERRORS${NC}"
echo -e "${YELLOW}警告: $WARNINGS${NC}"
echo ""

if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}❌ 检查失败！请修复错误后再提交代码。${NC}"
    exit 1
elif [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}⚠️  发现警告，请仔细检查后再提交代码。${NC}"
    exit 0
else
    echo -e "${GREEN}✓ 所有检查通过！可以安全提交代码。${NC}"
    exit 0
fi
