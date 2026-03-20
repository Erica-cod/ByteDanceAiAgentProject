# ByteDance AI Agent 项目 Docker 启动脚本 (PowerShell)

Write-Host "🚀 启动 ByteDance AI Agent 项目" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# 1. 确保 shared-network 存在
Write-Host ""
Write-Host "📡 [1/5] 检查 Docker 网络..." -ForegroundColor Yellow

$networkExists = docker network ls --format "{{.Name}}" | Select-String -Pattern "^shared-network$" -Quiet

if (-not $networkExists) {
    Write-Host "   ⚠️  shared-network 不存在，正在创建..." -ForegroundColor Yellow
    docker network create shared-network
    Write-Host "   ✅ 网络创建成功" -ForegroundColor Green
} else {
    Write-Host "   ✅ shared-network 已存在" -ForegroundColor Green
}

# 2. 检查 MongoDB 容器
Write-Host ""
Write-Host "🗄️  [2/5] 检查 MongoDB 容器..." -ForegroundColor Yellow

$mongoRunning = docker ps --format "{{.Names}}" | Select-String -Pattern "^mongodb-global$" -Quiet

if (-not $mongoRunning) {
    Write-Host "   ⚠️  mongodb-global 容器未运行" -ForegroundColor Yellow
    
    # 检查容器是否存在但未运行
    $mongoExists = docker ps -a --format "{{.Names}}" | Select-String -Pattern "^mongodb-global$" -Quiet
    
    if ($mongoExists) {
        Write-Host "   🔄 启动已存在的 mongodb-global 容器..." -ForegroundColor Yellow
        docker start mongodb-global
    } else {
        Write-Host "   📦 创建并启动新的 MongoDB 容器..." -ForegroundColor Yellow
        docker run -d `
            --name mongodb-global `
            --network shared-network `
            -p 27017:27017 `
            -v mongodb-data:/data/db `
            mongo:latest
    }
    
    Write-Host "   ⏳ 等待 MongoDB 启动..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
    Write-Host "   ✅ MongoDB 容器已启动" -ForegroundColor Green
} else {
    Write-Host "   ✅ MongoDB 已运行" -ForegroundColor Green
    
    # 确保 MongoDB 在 shared-network 中
    $mongoInNetwork = docker network inspect shared-network --format "{{range .Containers}}{{.Name}} {{end}}" | Select-String -Pattern "mongodb-global" -Quiet
    
    if (-not $mongoInNetwork) {
        Write-Host "   🔗 将 MongoDB 连接到 shared-network..." -ForegroundColor Yellow
        docker network connect shared-network mongodb-global 2>$null
    }
}

# 3. 停止并删除旧的应用容器
Write-Host ""
Write-Host "🛑 [3/5] 清理旧容器..." -ForegroundColor Yellow

$appExists = docker ps -a --format "{{.Names}}" | Select-String -Pattern "^bytedance-ai-agent$" -Quiet

if ($appExists) {
    Write-Host "   🗑️  删除旧的应用容器..." -ForegroundColor Yellow
    docker rm -f bytedance-ai-agent
    Write-Host "   ✅ 旧容器已删除" -ForegroundColor Green
} else {
    Write-Host "   ✅ 没有旧容器需要清理" -ForegroundColor Green
}

# 4. 构建新镜像
Write-Host ""
Write-Host "🔨 [4/5] 构建 Docker 镜像..." -ForegroundColor Yellow
docker compose -f "$PSScriptRoot/docker-compose.yml" build --no-cache
Write-Host "   ✅ 镜像构建完成" -ForegroundColor Green

# 5. 启动应用容器
Write-Host ""
Write-Host "🚀 [5/5] 启动应用容器..." -ForegroundColor Yellow
docker compose -f "$PSScriptRoot/docker-compose.yml" up -d

# 6. 等待健康检查
Write-Host ""
Write-Host "⏳ 等待服务启动..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# 7. 显示容器状态
Write-Host ""
Write-Host "📊 容器状态：" -ForegroundColor Cyan
docker compose -f "$PSScriptRoot/docker-compose.yml" ps

# 8. 验证网络连接
Write-Host ""
Write-Host "🔍 网络连接验证：" -ForegroundColor Cyan
Write-Host "   应用容器在的网络："
docker inspect bytedance-ai-agent --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}'
Write-Host "   MongoDB 容器在的网络："
docker inspect mongodb-global --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}'

# 9. 测试 MongoDB 连接
Write-Host ""
Write-Host "🔌 测试 MongoDB 连接..." -ForegroundColor Cyan
docker exec bytedance-ai-agent node -e "const { MongoClient } = require('mongodb'); const client = new MongoClient('mongodb://mongodb-global:27017'); client.connect().then(() => { console.log('✅ MongoDB 连接成功'); client.close(); }).catch(err => console.error('❌ MongoDB 连接失败:', err.message));" 2>$null

# 10. 显示日志
Write-Host ""
Write-Host "📋 应用日志（最后 20 行）：" -ForegroundColor Cyan
docker logs --tail 20 bytedance-ai-agent

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "✅ 启动完成！" -ForegroundColor Green
Write-Host "🌐 访问地址: http://localhost:8080" -ForegroundColor Green
Write-Host ""
Write-Host "📝 常用命令：" -ForegroundColor Yellow
Write-Host "   查看日志: docker logs -f bytedance-ai-agent"
Write-Host "   停止服务: docker compose -f deploy/docker-compose.yml down"
Write-Host "   重启服务: docker compose -f deploy/docker-compose.yml restart"
Write-Host "   进入容器: docker exec -it bytedance-ai-agent sh"
Write-Host ""

