# MongoDB Connection Fix Script
$ErrorActionPreference = "Continue"

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "MongoDB Connection Fix" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Step 1
Write-Host "[1/5] Stopping existing containers..." -ForegroundColor Yellow
docker-compose down 2>&1 | Out-Null
Write-Host "  DONE" -ForegroundColor Green
Write-Host ""

# Step 2
Write-Host "[2/5] Checking for old MongoDB container..." -ForegroundColor Yellow
$oldMongo = docker ps -a -q -f name=mongodb-global 2>$null
if ($oldMongo) {
    Write-Host "  Removing old container..." -ForegroundColor Yellow
    docker stop mongodb-global 2>&1 | Out-Null
    docker rm mongodb-global 2>&1 | Out-Null
    Write-Host "  DONE" -ForegroundColor Green
} else {
    Write-Host "  No old container found" -ForegroundColor Green
}
Write-Host ""

# Step 3
Write-Host "[3/5] Ensuring shared-network exists..." -ForegroundColor Yellow
$networkExists = docker network ls -q -f name=shared-network 2>$null
if (-not $networkExists) {
    docker network create shared-network 2>&1 | Out-Null
    Write-Host "  Created shared-network" -ForegroundColor Green
} else {
    Write-Host "  Network already exists" -ForegroundColor Green
}
Write-Host ""

# Step 4
Write-Host "[4/5] Starting services..." -ForegroundColor Yellow
Write-Host "  This may take a few minutes..." -ForegroundColor Cyan
docker-compose up -d

if ($LASTEXITCODE -eq 0) {
    Write-Host "  DONE" -ForegroundColor Green
} else {
    Write-Host "  ERROR: Failed to start services" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Step 5
Write-Host "[5/5] Waiting for services..." -ForegroundColor Yellow
Write-Host "  Waiting 30 seconds..." -ForegroundColor Cyan
Start-Sleep -Seconds 30

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Service Status" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

docker-compose ps

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Checking MongoDB Connection" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

$mongoLogs = docker logs bytedance-ai-agent 2>&1 | Select-String "MongoDB" | Select-Object -Last 3

if ($mongoLogs) {
    $mongoLogs | ForEach-Object {
        if ($_ -match "connected successfully") {
            Write-Host "SUCCESS: MongoDB connection OK!" -ForegroundColor Green
        } elseif ($_ -match "connection failed") {
            Write-Host "FAILED: MongoDB connection error!" -ForegroundColor Red
        }
        Write-Host "  $_"
    }
} else {
    Write-Host "No MongoDB logs yet..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Next Steps" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "View logs:        docker-compose logs -f app" -ForegroundColor White
Write-Host "Check status:     docker-compose ps" -ForegroundColor White
Write-Host "Access app:       http://localhost:8080" -ForegroundColor White
Write-Host ""
