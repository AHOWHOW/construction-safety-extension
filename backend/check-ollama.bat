@echo off
title Ollama Environment Check
color 0D

echo ========================================
echo   Ollama Environment Check
echo ========================================
echo.

REM 檢查 Ollama 是否已安裝
echo [1/4] Checking Ollama installation...
echo.

ollama --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Ollama is installed
    ollama --version
    set OLLAMA_INSTALLED=1
) else (
    echo [X] Ollama not found
    echo.
    echo Please install Ollama from:
    echo https://ollama.ai/download
    echo.
    set OLLAMA_INSTALLED=0
)
echo.

if %OLLAMA_INSTALLED% equ 0 (
    echo ========================================
    echo   Installation Required
    echo ========================================
    echo.
    echo 1. Visit: https://ollama.ai/download
    echo 2. Download OllamaSetup.exe
    echo 3. Run the installer
    echo 4. Run this script again
    echo.
    pause
    exit /b 1
)

REM 檢查 Qwen3.5 模型
echo ========================================
echo [2/4] Checking Qwen3.5 model...
echo ========================================
echo.

ollama list | findstr "qwen3.5" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Qwen3.5 model installed
    ollama list | findstr "qwen3.5"
    set MODEL_INSTALLED=1
) else (
    echo [X] Qwen3.5 model not found
    echo.
    set MODEL_INSTALLED=0
)
echo.

if %MODEL_INSTALLED% equ 0 (
    echo Model not installed. Do you want to download it now?
    echo (Size: ~4.5 GB, Time: 10-30 minutes depending on internet speed)
    echo.
    set /p DOWNLOAD="Download qwen3.5:9b model? (y/n): "

    if /i "%DOWNLOAD%"=="y" (
        echo.
        echo Downloading qwen3.5:9b...
        echo This will take a while. Please be patient...
        echo.
        ollama pull qwen3.5:9b

        if %errorlevel% equ 0 (
            echo.
            echo [OK] Model downloaded successfully!
        ) else (
            echo.
            echo [ERROR] Model download failed!
            echo Please try again or check your internet connection.
            pause
            exit /b 1
        )
    ) else (
        echo.
        echo Model not downloaded. You can download it later with:
        echo   ollama pull qwen3.5:9b
        echo.
    )
)

REM 檢查 Ollama 服務
echo ========================================
echo [3/4] Checking Ollama service...
echo ========================================
echo.

curl -s http://localhost:11434 >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Ollama service is running
    echo Service URL: http://localhost:11434
) else (
    echo [X] Ollama service not running
    echo.
    echo Starting Ollama service...
    start /B ollama serve

    echo Waiting for service to start...
    timeout /t 3 /nobreak >nul

    curl -s http://localhost:11434 >nul 2>&1
    if %errorlevel% equ 0 (
        echo [OK] Ollama service started successfully
    ) else (
        echo [WARNING] Could not start Ollama service automatically
        echo Please start it manually:
        echo   ollama serve
    )
)
echo.

REM 測試模型
echo ========================================
echo [4/4] Testing model...
echo ========================================
echo.

if %MODEL_INSTALLED% equ 1 (
    echo Testing qwen3.5:9b model...
    echo.
    echo Prompt: "Hello, test"
    echo.

    ollama run qwen3.5:9b "Hello, test" --verbose

    if %errorlevel% equ 0 (
        echo.
        echo [OK] Model test successful!
    ) else (
        echo.
        echo [WARNING] Model test had issues
    )
) else (
    echo [SKIP] Model not installed, skipping test
)
echo.

REM 總結
echo ========================================
echo   Summary
echo ========================================
echo.

if %OLLAMA_INSTALLED% equ 1 (
    echo [OK] Ollama: Installed
) else (
    echo [X] Ollama: Not installed
)

if %MODEL_INSTALLED% equ 1 (
    echo [OK] Model: qwen3.5:9b installed
) else (
    echo [X] Model: Not installed
)

curl -s http://localhost:11434 >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Service: Running on port 11434
) else (
    echo [X] Service: Not running
)

echo.
echo ========================================
echo   Next Steps
echo ========================================
echo.

if %OLLAMA_INSTALLED% equ 1 (
    if %MODEL_INSTALLED% equ 1 (
        echo Everything is ready!
        echo.
        echo 1. Restart backend: start-backend-persistent.bat
        echo 2. Check health: http://localhost:8000/health
        echo 3. Test analysis in Chrome Extension
    ) else (
        echo Please download the model:
        echo   ollama pull qwen3.5:9b
    )
) else (
    echo Please install Ollama first:
    echo   https://ollama.ai/download
)

echo.
echo ========================================
echo.
pause
