@echo off
title Construction Safety Backend - Install Dependencies
color 0E

echo ========================================
echo   Construction Safety Backend
echo   Dependency Installation
echo ========================================
echo.

cd /d "%~dp0"

REM 檢測 Python
echo [Step 1/4] Detecting Python...
echo.

py --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Found 'py' launcher
    set PYTHON_CMD=py
    goto :install_deps
)

python3 --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Found 'python3'
    set PYTHON_CMD=python3
    goto :install_deps
)

python --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Found 'python'
    set PYTHON_CMD=python
    goto :install_deps
)

echo [ERROR] Python not found!
echo.
echo Please install Python 3.10+ first.
echo See: Python安裝指南.md
echo.
pause
exit /b 1

:install_deps
%PYTHON_CMD% --version
echo.

REM 升級 pip
echo ========================================
echo [Step 2/4] Upgrading pip...
echo ========================================
echo.
%PYTHON_CMD% -m pip install --upgrade pip
echo.

REM 安裝依賴
echo ========================================
echo [Step 3/4] Installing dependencies...
echo ========================================
echo.
echo This may take 5-10 minutes...
echo.

REM 詢問是否使用清華鏡像（中國用戶較快）
set /p USE_MIRROR="Use Tsinghua mirror for faster download in China? (y/n): "
if /i "%USE_MIRROR%"=="y" (
    echo Using Tsinghua mirror...
    %PYTHON_CMD% -m pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
) else (
    echo Using default PyPI...
    %PYTHON_CMD% -m pip install -r requirements.txt
)

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Installation failed!
    echo Please check the error messages above.
    echo.
    pause
    exit /b 1
)

echo.
echo [OK] Dependencies installed successfully!
echo.

REM 下載模型
echo ========================================
echo [Step 4/4] Downloading YOLO model...
echo ========================================
echo.

if exist "models\best_yolo11x.pt" (
    echo [INFO] YOLO11 model already exists. Skip downloading.
    echo.
) else (
    echo Downloading YOLO11 model (~140 MB)...
    echo This may take a few minutes...
    echo.
    %PYTHON_CMD% download_model.py

    if %errorlevel% neq 0 (
        echo.
        echo [WARNING] Model download failed!
        echo You can download it manually later by running:
        echo   %PYTHON_CMD% download_model.py
        echo.
    ) else (
        echo.
        echo [OK] YOLO11 model downloaded!
        echo.
    )
)

REM 完成
echo ========================================
echo   Installation Complete!
echo ========================================
echo.
echo All dependencies and models are ready.
echo.
echo Next steps:
echo 1. Double-click: start-backend-persistent.bat
echo 2. Or run: %PYTHON_CMD% app.py
echo.
echo The backend will start on http://localhost:8000
echo.
echo ========================================
echo.
pause
