# Security Check Script (PowerShell)
# Check for leaked secrets before commit

$ErrorActionPreference = "Continue"

Write-Host "Starting security checks..." -ForegroundColor Cyan
Write-Host ""

$WARNINGS = 0
$ERRORS = 0

# Check 1: .env files tracked by git
Write-Host "[1/6] Checking if .env files are tracked by Git..." -ForegroundColor Yellow

$gitTrackedEnv = @(".env.local", ".env.production", "deploy/.env")
$foundTracked = $false

foreach ($file in $gitTrackedEnv) {
    $null = git ls-files --error-unmatch $file 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ERROR: Sensitive .env file tracked: $file" -ForegroundColor Red
        Write-Host "  Run: git rm --cached $file" -ForegroundColor Red
        $foundTracked = $true
        $ERRORS++
    }
}

if (-not $foundTracked) {
    Write-Host "  PASS" -ForegroundColor Green
}
Write-Host ""

# Check 2: Hardcoded Tavily API Key
Write-Host "[2/6] Checking for hardcoded Tavily API Key..." -ForegroundColor Yellow
$foundTavily = $false

$files = Get-ChildItem -Recurse -File -ErrorAction SilentlyContinue | 
    Where-Object { 
        $_.DirectoryName -notmatch "node_modules|\.git|dist" -and
        $_.Name -notmatch "\.log$|check-secrets\.ps1$|SECURITY\.md$|ENV_SETUP_GUIDE\.md$"
    }

foreach ($file in $files) {
    try {
        $content = Get-Content $file.FullName -ErrorAction Stop | Out-String
        if ($content -match "tvly-[a-zA-Z0-9]{30,}") {
            Write-Host "  ERROR: Found hardcoded Tavily Key in: $($file.FullName)" -ForegroundColor Red
            $foundTavily = $true
            $ERRORS++
        }
    }
    catch {
        # Skip files that can't be read
    }
}

if (-not $foundTavily) {
    Write-Host "  PASS" -ForegroundColor Green
}
Write-Host ""

# Check 3: UUID format API Key
Write-Host "[3/6] Checking for hardcoded ARK API Key..." -ForegroundColor Yellow
$foundUUID = $false

$files = Get-ChildItem -Recurse -File -ErrorAction SilentlyContinue | 
    Where-Object { 
        $_.DirectoryName -notmatch "node_modules|\.git|dist" -and
        $_.Name -notmatch "\.log$|check-secrets\.ps1$|package-lock\.json$|SECURITY\.md$|ENV_SETUP_GUIDE\.md$"
    }

foreach ($file in $files) {
    try {
        $content = Get-Content $file.FullName -ErrorAction Stop | Out-String
        if ($content -match "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}") {
            Write-Host "  WARNING: Found UUID in: $($file.FullName)" -ForegroundColor Yellow
            Write-Host "  Please verify these are not real API Keys" -ForegroundColor Yellow
            $foundUUID = $true
            $WARNINGS++
        }
    }
    catch {
        # Skip files that can't be read
    }
}

if (-not $foundUUID) {
    Write-Host "  PASS" -ForegroundColor Green
}
Write-Host ""

# Check 4: Hardcoded passwords
Write-Host "[4/6] Checking for hardcoded passwords..." -ForegroundColor Yellow
$foundPassword = $false

$files = Get-ChildItem -Recurse -File -ErrorAction SilentlyContinue | 
    Where-Object { 
        $_.DirectoryName -notmatch "node_modules|\.git|dist" -and
        $_.Name -notmatch "\.log$|check-secrets\.ps1$|\.md$"
    }

foreach ($file in $files) {
    try {
        $content = Get-Content $file.FullName -ErrorAction Stop | Out-String
        if ($content -match "(password|passwd|pwd)\s*[:=]\s*['\`"]?[^'\`",\s]{8,}") {
            Write-Host "  WARNING: Potential hardcoded password in: $($file.FullName)" -ForegroundColor Yellow
            $foundPassword = $true
            $WARNINGS++
        }
    }
    catch {
        # Skip files that can't be read
    }
}

if (-not $foundPassword) {
    Write-Host "  PASS" -ForegroundColor Green
}
Write-Host ""

# Check 5: docker-compose.yml
Write-Host "[5/6] Checking Docker Compose configuration..." -ForegroundColor Yellow
if (Test-Path "docker-compose.yml") {
    try {
        $content = Get-Content "docker-compose.yml" -ErrorAction Stop | Out-String
        if ($content -match "TAVILY_API_KEY=tvly-|ARK_API_KEY=[0-9a-f]{8}-|REDIS_PASSWORD=[^`$\s]{8,}") {
            Write-Host "  ERROR: Found hardcoded secrets in docker-compose.yml" -ForegroundColor Red
            $ERRORS++
        }
        else {
            Write-Host "  PASS" -ForegroundColor Green
        }
    }
    catch {
        Write-Host "  ERROR: Cannot read docker-compose.yml" -ForegroundColor Red
    }
}
else {
    Write-Host "  SKIP: docker-compose.yml not found" -ForegroundColor Yellow
}
Write-Host ""

# Check 6: Dockerfile
Write-Host "[6/6] Checking Dockerfile configuration..." -ForegroundColor Yellow
if (Test-Path "Dockerfile") {
    try {
        $content = Get-Content "Dockerfile" -ErrorAction Stop | Out-String
        if ($content -match "ENV (TAVILY_API_KEY|ARK_API_KEY|REDIS_PASSWORD)=[^\s#]+") {
            Write-Host "  ERROR: Found hardcoded secrets in Dockerfile" -ForegroundColor Red
            $ERRORS++
        }
        else {
            Write-Host "  PASS" -ForegroundColor Green
        }
    }
    catch {
        Write-Host "  ERROR: Cannot read Dockerfile" -ForegroundColor Red
    }
}
else {
    Write-Host "  SKIP: Dockerfile not found" -ForegroundColor Yellow
}
Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Check Results Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Errors  : $ERRORS" -ForegroundColor $(if ($ERRORS -gt 0) { "Red" } else { "Green" })
Write-Host "Warnings: $WARNINGS" -ForegroundColor $(if ($WARNINGS -gt 0) { "Yellow" } else { "Green" })
Write-Host ""

if ($ERRORS -gt 0) {
    Write-Host "FAILED: Please fix errors before committing!" -ForegroundColor Red
    exit 1
}
elseif ($WARNINGS -gt 0) {
    Write-Host "WARNING: Please review warnings before committing." -ForegroundColor Yellow
    exit 0
}
else {
    Write-Host "SUCCESS: All checks passed! Safe to commit." -ForegroundColor Green
    exit 0
}
