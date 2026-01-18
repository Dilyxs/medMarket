@echo off
cd /d "%~dp0server"
echo Starting medMarket backend server...
echo.

REM Load environment from .env file in parent directory
for /f "usebackq tokens=1,* delims==" %%a in ("..\..env") do (
    if not "%%a"=="" if not "%%b"=="" (
        set "%%a=%%b"
    )
)

echo Connected to MongoDB
echo Solana Treasury: %SOL_RECEIVER_ADDRESS%
echo.

medMarket.exe
