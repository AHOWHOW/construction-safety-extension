@echo off
title Ollama 管理工具
color 0B

set OLLAMA_PATH=C:\Users\user\AppData\Local\Programs\Ollama\ollama.exe

:menu
cls
echo ========================================
echo        Ollama 管理工具
echo ========================================
echo.
echo 1. 列出已安裝的模型
echo 2. 下載 qwen3.5:9b 模型
echo 3. 測試 Ollama 服務
echo 4. 啟動 Ollama 服務
echo 5. 重新啟動 Ollama
echo 6. 退出
echo.
echo ========================================
set /p choice="請選擇 (1-6): "

if "%choice%"=="1" goto list_models
if "%choice%"=="2" goto download_model
if "%choice%"=="3" goto test_service
if "%choice%"=="4" goto start_service
if "%choice%"=="5" goto restart_service
if "%choice%"=="6" goto exit
goto menu

:list_models
cls
echo ========================================
echo   已安裝的模型
echo ========================================
echo.
"%OLLAMA_PATH%" list
echo.
pause
goto menu

:download_model
cls
echo ========================================
echo   下載 qwen3.5:9b 模型
echo ========================================
echo.
echo 模型大小: 約 4.5 GB
echo 下載時間: 10-30 分鐘（取決於網速）
echo.
set /p confirm="確定要下載嗎? (y/n): "
if /i not "%confirm%"=="y" goto menu

echo.
echo 開始下載...
"%OLLAMA_PATH%" pull qwen3.5:9b

if %errorlevel% equ 0 (
    echo.
    echo [OK] 模型下載成功！
) else (
    echo.
    echo [ERROR] 模型下載失敗！
)
echo.
pause
goto menu

:test_service
cls
echo ========================================
echo   測試 Ollama 服務
echo ========================================
echo.
echo 測試 http://localhost:11434 ...
echo.

curl -s http://localhost:11434
if %errorlevel% equ 0 (
    echo.
    echo [OK] Ollama 服務正在運行
) else (
    echo.
    echo [ERROR] Ollama 服務未運行
    echo.
    echo 請選擇選項 4 或 5 啟動服務
)
echo.
pause
goto menu

:start_service
cls
echo ========================================
echo   啟動 Ollama 服務
echo ========================================
echo.
echo 正在啟動...
start "" "C:\Users\user\AppData\Local\Programs\Ollama\ollama app.exe"
echo.
echo 等待服務啟動...
timeout /t 5 /nobreak >nul
echo.
echo 測試連線...
curl -s http://localhost:11434
if %errorlevel% equ 0 (
    echo.
    echo [OK] Ollama 服務已啟動
) else (
    echo.
    echo [WARNING] 服務可能需要更多時間啟動
    echo 請稍後使用選項 3 測試
)
echo.
pause
goto menu

:restart_service
cls
echo ========================================
echo   重新啟動 Ollama
echo ========================================
echo.
echo 正在關閉現有程序...
taskkill /F /IM "ollama.exe" >nul 2>&1
taskkill /F /IM "ollama app.exe" >nul 2>&1
echo.
echo 等待 3 秒...
timeout /t 3 /nobreak >nul
echo.
echo 正在啟動 Ollama...
start "" "C:\Users\user\AppData\Local\Programs\Ollama\ollama app.exe"
echo.
echo 等待服務啟動...
timeout /t 5 /nobreak >nul
echo.
echo 測試連線...
curl -s http://localhost:11434
if %errorlevel% equ 0 (
    echo.
    echo [OK] Ollama 服務已重新啟動
) else (
    echo.
    echo [WARNING] 服務可能需要更多時間啟動
    echo 請稍後使用選項 3 測試
)
echo.
pause
goto menu

:exit
exit
