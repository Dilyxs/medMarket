# Load environment variables from .env file
$envFile = Join-Path $PSScriptRoot ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match "^([^#][^=]+)=(.*)$") {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($name, $value, "Process")
        }
    }
    Write-Host "✅ Loaded .env file" -ForegroundColor Green
} else {
    Write-Host "⚠️  No .env file found at $envFile" -ForegroundColor Yellow
}

# Start the server
Write-Host ""
Write-Host "🚀 Starting medMarket backend..." -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host "Treasury Address: $env:SOL_RECEIVER_ADDRESS" -ForegroundColor White
Write-Host "MongoDB: Connected" -ForegroundColor Green
Write-Host "Server: http://localhost:8080" -ForegroundColor White
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""

Set-Location (Join-Path $PSScriptRoot "server")
& ".\medMarket.exe"
