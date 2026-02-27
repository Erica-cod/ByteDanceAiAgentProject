# 安全指南

## 🔒 安全原则

本项目遵循以下安全最佳实践：

1. **不在代码中硬编码敏感信息**
2. **使用环境变量管理配置**
3. **生产环境使用强密码**
4. **定期更换密钥**
5. **最小权限原则**

## ⚠️ 常见安全风险

### 1. API 密钥泄露

**风险：** 将 API 密钥提交到 GitHub，导致密钥被滥用

**防范措施：**
- ✅ 使用 `.env` 文件存储密钥
- ✅ 确保 `.env*` 文件在 `.gitignore` 中
- ✅ 使用 `.env.example` 作为模板，不包含真实密钥
- ✅ 提交代码前运行安全检查脚本

### 2. 默认密码未更改

**风险：** 生产环境使用默认密码，容易被攻击

**防范措施：**
- ✅ 强制要求生产环境更改默认密码
- ✅ 使用复杂密码（至少 32 位随机字符）
- ✅ 定期更换密码

### 3. 容器环境变量泄露

**风险：** Docker 日志或配置文件暴露环境变量

**防范措施：**
- ✅ 不在 Dockerfile 中硬编码敏感信息
- ✅ 使用 Docker secrets 或环境变量传入
- ✅ 不输出完整的环境变量值到日志

## 🛡️ 安全检查清单

### 提交代码前检查

- [ ] `.env.local` 和 `.env.production` 文件未被添加到 Git
- [ ] `docker-compose.yml` 中没有硬编码的密钥
- [ ] `Dockerfile` 中没有硬编码的密钥
- [ ] 代码中没有 `console.log()` 输出完整的密钥
- [ ] 配置文件中使用环境变量而非硬编码值

### 部署生产环境前检查

- [ ] 所有默认密码已更改
- [ ] Redis 密码已设置为强密码
- [ ] IDP_CLIENT_SECRET 已更改
- [ ] OIDC_CLIENT_SECRET 已更改
- [ ] API 密钥已配置且有效
- [ ] 数据库连接使用了强密码（如果适用）
- [ ] HTTPS 已启用（生产环境）
- [ ] 防火墙规则已配置

### 定期安全审计

- [ ] 检查 API 密钥使用量，发现异常立即轮换
- [ ] 审查访问日志，发现可疑访问
- [ ] 更新依赖包，修复安全漏洞
- [ ] 备份重要数据

## 🔍 如何检查敏感信息泄露

### 手动检查

```bash
# 检查是否有文件包含 API 密钥
grep -r "tvly-" . --exclude-dir=node_modules --exclude-dir=.git

# 检查是否有文件包含 ARK API 密钥
grep -r "9a75dc8d" . --exclude-dir=node_modules --exclude-dir=.git
```

### 使用 Git 历史检查

```bash
# 检查 Git 历史中是否包含敏感信息
git log -p | grep -i "api[_-]key\|password\|secret"
```

### 使用自动化工具

推荐使用 [git-secrets](https://github.com/awslabs/git-secrets) 或 [truffleHog](https://github.com/trufflesecurity/trufflehog) 扫描仓库。

## 🚨 如果密钥已泄露

### 立即行动

1. **立即轮换密钥**
   - Tavily: 在控制台重新生成 API Key
   - ARK: 在火山引擎控制台重新生成密钥
   - Redis: 修改密码并重启服务

2. **从 Git 历史中移除敏感信息**
   ```bash
   # 警告：这会重写 Git 历史，谨慎操作！
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch path/to/sensitive/file" \
     --prune-empty --tag-name-filter cat -- --all
   
   # 强制推送到远程仓库
   git push origin --force --all
   ```

3. **通知相关人员**
   - 通知团队成员密钥已泄露
   - 更新所有环境的配置

4. **监控账户活动**
   - 检查 API 使用量是否异常
   - 检查账单是否异常

## 🔐 密码管理建议

### 生成强密码

```bash
# Linux/Mac - 生成 32 位随机密码
openssl rand -base64 32

# PowerShell (Windows) - 生成 32 位随机密码
-join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})

# Node.js - 生成 32 位随机密码
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 密码复杂度要求

- **最小长度：** 32 位
- **字符类型：** 包含大小写字母、数字、特殊字符
- **避免：** 常见单词、生日、连续字符

### 密码存储

- ✅ 使用密码管理器（如 1Password, LastPass）
- ✅ 团队共享密码使用加密的密码管理工具
- ❌ 不要在聊天工具中发送密码
- ❌ 不要在邮件中发送密码
- ❌ 不要在文档中记录密码

## 📋 环境变量安全规范

### 命名规范

```bash
# ✅ 好的命名
TAVILY_API_KEY=xxx
REDIS_PASSWORD=xxx
IDP_CLIENT_SECRET=xxx

# ❌ 不好的命名
API_KEY=xxx  # 太模糊
KEY=xxx      # 太简单
TAVILYKEY=xxx  # 不符合命名规范
```

### 值的格式

```bash
# ✅ 使用占位符（在示例文件中）
TAVILY_API_KEY=your_tavily_api_key_here

# ❌ 使用真实值（在示例文件中）
TAVILY_API_KEY=tvly-abc123xyz  # 不要在示例文件中使用真实值
```

### 日志输出规范

```typescript
// ✅ 安全的日志输出（部分遮蔽）
console.log(`Tavily API Key: ${apiKey.substring(0, 10)}...`);

// ❌ 不安全的日志输出（完整输出）
console.log(`Tavily API Key: ${apiKey}`);
```

## 🔄 密钥轮换策略

### 定期轮换

- **生产环境密钥：** 每 90 天轮换一次
- **开发环境密钥：** 每 180 天轮换一次
- **紧急情况：** 立即轮换

### 轮换流程

1. 生成新密钥
2. 更新环境变量
3. 验证服务正常
4. 吊销旧密钥
5. 记录轮换日期

## 📞 安全事件报告

如果你发现安全漏洞或密钥泄露，请：

1. **不要在公开 Issue 中报告**
2. **发送邮件到项目维护者**（包含详细信息）
3. **等待确认和修复**
4. **修复后再公开披露**

## 📚 相关资源

- [环境变量配置指南](./ENV_SETUP_GUIDE.md)
- [OWASP 安全最佳实践](https://owasp.org/)
- [GitHub 安全指南](https://docs.github.com/en/code-security)
- [Docker 安全最佳实践](https://docs.docker.com/engine/security/)

---

**记住：安全是每个人的责任！** 🛡️
