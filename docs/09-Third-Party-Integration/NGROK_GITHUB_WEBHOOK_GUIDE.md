# 使用 ngrok 转发 GitHub Webhook 请求指南

## 📋 目录
- [为什么需要 ngrok](#为什么需要-ngrok)
- [安装 ngrok](#安装-ngrok)
- [配置 ngrok](#配置-ngrok)
- [启动 Jenkins 和 ngrok](#启动-jenkins-和-ngrok)
- [配置 GitHub Webhook](#配置-github-webhook)
- [测试 Webhook](#测试-webhook)
- [常见问题解决](#常见问题解决)
- [生产环境建议](#生产环境建议)

---

## 为什么需要 ngrok？

在开发环境中，你的 Jenkins 运行在本地电脑（localhost）上，GitHub 无法直接访问到你的本地服务器。ngrok 可以：

```
GitHub 服务器 (互联网) 
    ↓
ngrok 云服务 (公网 URL)
    ↓
ngrok 本地客户端 (隧道)
    ↓
本地 Jenkins (http://localhost:8081)
```

**简单来说**：ngrok 为你的本地服务创建一个临时的公网地址，让 GitHub 可以发送 webhook 请求到你的本地 Jenkins。

---

## 安装 ngrok

### 步骤 1: 下载 ngrok

1. 访问官网：https://ngrok.com/download
2. 选择 Windows 版本下载
3. 解压到一个方便访问的目录，例如：
   ```
   C:\tools\ngrok\
   ```

### 步骤 2: 添加到系统 PATH（可选但推荐）

1. 右键 "此电脑" → "属性" → "高级系统设置"
2. 点击 "环境变量"
3. 在 "系统变量" 中找到 "Path"，点击 "编辑"
4. 点击 "新建"，添加：`C:\tools\ngrok`
5. 点击 "确定" 保存

**验证安装**：
```powershell
# 打开新的 PowerShell 窗口
ngrok version
```

应该显示类似：`ngrok version 3.x.x`

---

## 配置 ngrok

### 步骤 1: 注册 ngrok 账号

1. 访问：https://dashboard.ngrok.com/signup
2. 免费注册一个账号（可以用 GitHub/Google 登录）
3. 注册后会进入 Dashboard

### 步骤 2: 获取 AuthToken

1. 在 ngrok Dashboard 中，找到左侧菜单的 "Your Authtoken"
2. 或直接访问：https://dashboard.ngrok.com/get-started/your-authtoken
3. 复制你的 authtoken（格式类似：`2abc...xyz123`）

### 步骤 3: 配置 AuthToken

在 PowerShell 中运行：

```powershell
ngrok config add-authtoken YOUR_AUTH_TOKEN
```

将 `YOUR_AUTH_TOKEN` 替换为你刚才复制的 token。

**成功提示**：
```
Authtoken saved to configuration file: C:\Users\你的用户名\.ngrok2\ngrok.yml
```

---

## 启动 Jenkins 和 ngrok

### 步骤 1: 确保 Jenkins 正在运行

```powershell
# 检查 Jenkins 容器状态
docker ps | findstr jenkins

# 如果没有运行，启动它
docker start jenkins

# 验证 Jenkins 可以访问
# 在浏览器打开: http://localhost:8081
```

### 步骤 2: 启动 ngrok 隧道

在 PowerShell 中运行：

```powershell
ngrok http 8081
```

**注意**：
- `8081` 是 Jenkins 的端口号（本项目使用 8081 而不是默认的 8080，因为应用占用了 8080）
- 保持这个 PowerShell 窗口**一直打开**

### 步骤 3: 获取公网 URL

ngrok 启动后，你会看到类似的输出：

```
ngrok                                                               

Session Status                online
Account                       your-email@example.com
Version                       3.x.x
Region                        United States (us)
Latency                       45ms
Web Interface                 http://127.0.0.1:4040
Forwarding                    https://abc123xyz.ngrok-free.app -> http://localhost:8081

Connections                   ttl     opn     rt1     rt5     p50     p90
                              0       0       0.00    0.00    0.00    0.00
```

**重要信息**：
- **Forwarding URL**: `https://abc123xyz.ngrok-free.app` 
  - 这就是你需要的公网地址！
  - **每次重启 ngrok，这个 URL 都会变化**（免费版）
- **Web Interface**: `http://127.0.0.1:4040`
  - 可以在浏览器打开，查看所有请求日志

### 步骤 4: 测试 ngrok 转发

在浏览器中访问：
```
https://abc123xyz.ngrok-free.app
```

应该能看到 Jenkins 登录页面（可能会先显示 ngrok 的警告页面，点击 "Visit Site" 继续）。

---

## 配置 GitHub Webhook

### 步骤 1: 构建 Webhook URL

将你的 ngrok URL 加上 Jenkins 的 GitHub webhook 路径：

```
https://abc123xyz.ngrok-free.app/github-webhook/
```

**注意**：
- 末尾的 `/` 很重要，不要遗漏
- 使用 `https` 而不是 `http`

### 步骤 2: 在 GitHub 添加 Webhook

1. 打开你的 GitHub 仓库
2. 进入 **Settings** → **Webhooks** → **Add webhook**
3. 填写以下信息：

| 字段 | 值 |
|------|-----|
| **Payload URL** | `https://abc123xyz.ngrok-free.app/github-webhook/` |
| **Content type** | `application/json` |
| **Secret** | 留空（或设置密钥，需在 Jenkins 中配置） |
| **Which events would you like to trigger this webhook?** | 选择 "Just the push event" |
| **Active** | ✓ 勾选 |

4. 点击 **Add webhook**

### 步骤 3: 验证 Webhook

GitHub 会自动发送一个测试 ping 请求。

在 Webhook 页面，你应该能看到：
- ✅ 绿色对勾 = 成功
- ❌ 红色叉号 = 失败（点击查看详情）

---

## 测试 Webhook

### 方法 1: 查看 GitHub Webhook 日志

1. 在 GitHub Webhook 设置页面
2. 点击你刚创建的 webhook
3. 切换到 **Recent Deliveries** 标签
4. 查看最近的请求和响应

### 方法 2: 查看 ngrok Web Interface

1. 在浏览器打开：http://127.0.0.1:4040
2. 可以看到所有通过 ngrok 的 HTTP 请求
3. 点击某个请求可以查看详细的请求和响应内容

### 方法 3: 触发实际推送

1. 修改项目中的任意文件（如 README.md）
2. 提交并推送到 GitHub：

```bash
git add .
git commit -m "test: trigger webhook"
git push origin main
```

3. 观察以下位置：
   - **GitHub**: 仓库 → Settings → Webhooks → Recent Deliveries
   - **ngrok**: http://127.0.0.1:4040 (查看请求日志)
   - **Jenkins**: http://localhost:8081 (应该自动开始构建)

### 方法 4: 手动触发测试

在 GitHub Webhook 页面：
1. 点击你的 webhook
2. 切换到 **Recent Deliveries** 标签
3. 点击某个请求
4. 点击 **Redeliver** 按钮重新发送

---

## 常见问题解决

### 问题 1: Webhook 返回 502 Bad Gateway

**原因**：Jenkins 没有运行或 ngrok 没有正确转发

**解决方案**：
```powershell
# 检查 Jenkins 状态
docker ps | findstr jenkins

# 如果没运行，启动它
docker start jenkins

# 检查 Jenkins 日志
docker logs jenkins --tail 50

# 确保 ngrok 正在运行
# 在浏览器测试：https://你的ngrok地址.ngrok-free.app
```

### 问题 2: Webhook 返回 403 Forbidden

**原因**：Jenkins 的 CSRF 保护或认证问题

**解决方案**：
1. 进入 Jenkins: **Manage Jenkins** → **Configure System**
2. 找到 **GitHub** 部分
3. 勾选 **Override Hook URL**（如果有）
4. 或者在 Jenkins 的安全设置中允许匿名读取权限给 GitHub webhook

### 问题 3: ngrok 连接断开或 URL 改变

**原因**：免费版 ngrok 的 URL 是临时的，每次重启都会变

**解决方案**：
1. **短期解决**：每次 ngrok URL 改变后，更新 GitHub webhook 的 URL
2. **长期解决**：
   - 升级到 ngrok 付费版（获得固定域名）
   - 或使用其他固定 IP 方案（VPS、云服务器）

### 问题 4: Jenkins 没有自动触发构建

**检查清单**：

1. **Jenkins 任务配置**：
   - 进入 Jenkins 任务配置
   - 确保勾选了 **GitHub hook trigger for GITScm polling**

2. **GitHub Webhook 配置**：
   - 确保 URL 正确（包含 `/github-webhook/`）
   - 确保事件类型选择了 "push"

3. **Jenkins GitHub 插件**：
   ```
   Manage Jenkins → Manage Plugins → Installed
   ```
   确认已安装：
   - GitHub Integration Plugin
   - GitHub plugin

4. **查看 Jenkins 系统日志**：
   ```
   Manage Jenkins → System Log
   ```

### 问题 5: ngrok 显示 "ERR_NGROK_108"

**原因**：免费版有连接数限制

**解决方案**：
- 关闭其他不用的 ngrok 进程
- 或升级到付费版

### 问题 6: Windows 防火墙阻止

**解决方案**：
```powershell
# 以管理员身份运行 PowerShell
# 添加防火墙规则允许 ngrok
New-NetFirewallRule -DisplayName "ngrok" -Direction Inbound -Program "C:\tools\ngrok\ngrok.exe" -Action Allow
```

---

## 快速参考命令

### ngrok 相关

```powershell
# 启动 ngrok（转发端口 8081）
ngrok http 8081

# 查看 ngrok 配置
ngrok config check

# 使用自定义域名（需付费版）
ngrok http 8081 --domain=your-domain.ngrok-free.app

# 查看 ngrok 版本
ngrok version

# 显示帮助
ngrok help
```

### Jenkins 相关

```powershell
# 启动 Jenkins
docker start jenkins

# 停止 Jenkins
docker stop jenkins

# 重启 Jenkins
docker restart jenkins

# 查看 Jenkins 日志
docker logs jenkins --tail 50 -f

# 进入 Jenkins 容器
docker exec -it jenkins bash
```

### Docker 相关

```powershell
# 查看所有运行的容器
docker ps

# 查看所有容器（包括停止的）
docker ps -a

# 查看 Jenkins 容器详细信息
docker inspect jenkins

# 查看端口映射
docker port jenkins
```

---

## 生产环境建议

**⚠️ 重要提示**：ngrok 适合开发和测试，但**不推荐用于生产环境**。

### 生产环境方案

#### 方案 1: 云服务器（推荐）

使用云服务提供商（如阿里云、腾讯云、AWS、Azure）：

```
优点：
✅ 固定公网 IP
✅ 稳定可靠
✅ 可配置 SSL 证书
✅ 无连接限制

缺点：
❌ 需要付费
❌ 需要服务器运维知识
```

#### 方案 2: GitHub Actions（推荐）

直接在 GitHub 上运行 CI/CD，无需本地 Jenkins：

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build and Deploy
        run: |
          npm ci
          npm run build
          docker build -t myapp .
```

```
优点：
✅ 完全免费（对于公开仓库）
✅ 无需维护服务器
✅ 原生集成 GitHub
✅ 无需 webhook 配置

缺点：
❌ 无法访问本地资源
❌ 构建时间有限制
```

#### 方案 3: Vercel / Netlify（适合前端应用）

```
优点：
✅ 自动 CD（push 后自动部署）
✅ 免费 SSL
✅ CDN 加速
✅ 零配置

缺点：
❌ 主要适合静态站点或 Serverless
❌ 不适合复杂后端
```

#### 方案 4: 内网穿透服务（国内）

如 frp、Cloudflare Tunnel：

```
优点：
✅ 可自建
✅ 国内访问快
✅ 可配置固定域名

缺点：
❌ 需要有公网 IP 的服务器
❌ 配置相对复杂
```

---

## 最佳实践总结

### 开发阶段
```powershell
# 1. 启动 Jenkins
docker start jenkins

# 2. 启动 ngrok
ngrok http 8081

# 3. 复制 ngrok URL 到 GitHub webhook

# 4. 开始开发和测试
```

### 注意事项

1. ⚠️ **保持 ngrok 窗口打开**：关闭窗口会断开隧道
2. ⚠️ **URL 会变化**：每次重启 ngrok，记得更新 GitHub webhook
3. ⚠️ **查看 ngrok 日志**：http://127.0.0.1:4040 是你的好朋友
4. ⚠️ **测试先行**：每次修改配置后，用 GitHub 的 "Redeliver" 测试
5. ⚠️ **安全第一**：不要在 ngrok URL 上暴露敏感信息

### 调试技巧

```powershell
# 同时打开多个窗口监控：

# 窗口 1: ngrok 日志
ngrok http 8081

# 窗口 2: Jenkins 日志
docker logs jenkins -f

# 窗口 3: 网络请求监控
# 浏览器打开: http://127.0.0.1:4040

# 窗口 4: GitHub Webhook 页面
# 浏览器打开: https://github.com/你的用户名/你的仓库/settings/hooks
```

---

## 故障排查流程图

```
GitHub Webhook 不工作？
    ↓
1. 检查 ngrok 是否运行？
   → 否：运行 ngrok http 8081
   ↓
2. 访问 ngrok URL 能看到 Jenkins 吗？
   → 否：检查 Jenkins 是否运行（docker ps）
   ↓
3. GitHub webhook 收到响应了吗？
   → 否：检查 URL 是否正确（要有 /github-webhook/）
   ↓
4. Jenkins 收到 webhook 了吗？
   → 查看 ngrok web interface (http://127.0.0.1:4040)
   ↓
5. Jenkins 触发构建了吗？
   → 检查 Jenkins 任务配置（GitHub hook trigger）
   ↓
✅ 成功！
```

---

## 额外资源

- 📚 **ngrok 官方文档**：https://ngrok.com/docs
- 📚 **Jenkins GitHub 插件**：https://plugins.jenkins.io/github/
- 📚 **GitHub Webhooks 文档**：https://docs.github.com/en/webhooks
- 🎥 **视频教程**（YouTube）：搜索 "ngrok jenkins github webhook"

---

## 更新日志

- **2025-11-21**: 创建初始版本
  - 添加完整的 ngrok 配置指南
  - 添加 GitHub webhook 配置步骤
  - 添加详细的故障排查方案

---

**🎉 完成！**

现在你应该能够成功使用 ngrok 将 GitHub webhook 转发到本地 Jenkins 了。

有任何问题，记得查看：
1. ngrok Web Interface: http://127.0.0.1:4040
2. GitHub Webhook Recent Deliveries
3. Jenkins 系统日志

祝开发顺利！🚀

