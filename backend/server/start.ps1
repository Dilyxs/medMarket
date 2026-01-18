$env:MONGODB_URI="mongodb+srv://amongus:amongus1234@cluster0.c1nykom.mongodb.net/db?retryWrites=true&w=majority"
$env:MONGODB_DB="db"
$env:SOL_RECEIVER_ADDRESS="Dy33yxHZhbEMmdRk3CkK1bEngHBRZLxP7rD9nAAejE7L"
$env:SOL_TREASURY_SECRET_KEY='[168,43,122,253,78,60,100,92,240,127,17,92,75,174,102,17,228,226,30,67,62,242,78,167,245,211,226,147,236,189,104,71,192,167,22,132,214,191,253,128,12,166,145,97,174,57,54,141,111,30,78,64,3,160,231,223,102,38,227,139,108,144,129,131]'
$env:SOLANA_RPC="https://api.devnet.solana.com"

Write-Host "🚀 Starting medMarket backend..." -ForegroundColor Cyan
Write-Host "Treasury: $env:SOL_RECEIVER_ADDRESS" -ForegroundColor Green
Write-Host "MongoDB: Connected" -ForegroundColor Green
Write-Host "Server: http://localhost:8080" -ForegroundColor White
Write-Host ""

.\medMarket.exe
