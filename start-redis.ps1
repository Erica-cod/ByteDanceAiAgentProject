# 启动 Redis 容器的脚本
Write-Host "🚀 启动 Redis 容器..." -ForegroundColor Green

# 检查 shared-network 是否存在
$networkExists = docker network ls | Select-String "shared-network"
if (-not $networkExists) {
    Write-Host "⚠️  shared-network 不存在，正在创建..." -ForegroundColor Yellow
    docker network create shared-network
}

# 启动 Redis
Write-Host "📦 拉取 Redis 镜像并启动容器..." -ForegroundColor Cyan
docker-compose up -d redis

# 检查状态
Start-Sleep -Seconds 3
$redisStatus = docker ps -a | Select-String "redis-ai-agent"
if ($redisStatus) {
    Write-Host "✅ Redis 容器已启动!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Redis 连接信息:" -ForegroundColor Cyan
    Write-Host "   Host: localhost (或 redis-ai-agent)" -ForegroundColor White
    Write-Host "   Port: 6379" -ForegroundColor White
    Write-Host "   Password: your_redis_password" -ForegroundColor White
    Write-Host ""
    Write-Host "🔍 查看日志: docker logs -f redis-ai-agent" -ForegroundColor Yellow
    Write-Host "🛑 停止容器: docker stop redis-ai-agent" -ForegroundColor Yellow
} else {
    Write-Host "❌ Redis 容器启动失败，请检查日志" -ForegroundColor Red
    docker logs redis-ai-agent
}
