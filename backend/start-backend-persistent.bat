@echo off
title Construction Safety Backend Service
color 0A

echo ========================================
echo   Construction Safety Backend Service
echo ========================================
echo.
echo Starting backend server...
echo Backend will auto-restart if it crashes.
echo Close this window to stop the service.
echo.
echo ========================================
echo.

cd /d "%~dp0"

REM 檢測 Python 命令
echo [INFO] Detecting Python installation...
echo.

REM 方法 1: 嘗試 py launcher (Windows Python Launcher)
py --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Found 'py' launcher
    set PYTHON_CMD=py
    goto :start_loop
)

REM 方法 2: 嘗試 python3
python3 --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Found 'python3'
    set PYTHON_CMD=python3
    goto :start_loop
)

REM 方法 3: 嘗試 python
python --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Found 'python'
    set PYTHON_CMD=python
    goto :start_loop
)

REM 都找不到，顯示錯誤訊息
echo [ERROR] Python not found!
echo.
echo Please install Python 3.10+ from:
echo https://www.python.org/downloads/
echo.
echo Make sure to check "Add Python to PATH" during installation.
echo.
pause
exit /b 1

:start_loop
echo [INFO] Using Python command: %PYTHON_CMD%
echo.
echo ========================================
echo.

:loop
echo [%date% %time%] Starting Python backend...
%PYTHON_CMD% app.py

if errorlevel 1 (
    echo.
    echo [ERROR] Backend crashed or stopped!
    echo Restarting in 3 seconds...
    timeout /t 3 /nobreak >nul
    goto loop
) else (
    echo.
    echo Backend stopped normally.
    pause
    exit
)
