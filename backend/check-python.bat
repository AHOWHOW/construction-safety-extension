@echo off
title Python Environment Check
color 0B

echo ========================================
echo   Python Environment Check
echo ========================================
echo.

REM 檢測 Python 命令
echo [1/5] Checking Python installation...
echo.

REM 方法 1: py launcher
py --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] 'py' command found
    py --version
    set FOUND_PY=1
) else (
    echo [X] 'py' command not found
    set FOUND_PY=0
)
echo.

REM 方法 2: python3
python3 --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] 'python3' command found
    python3 --version
    set FOUND_PYTHON3=1
) else (
    echo [X] 'python3' command not found
    set FOUND_PYTHON3=0
)
echo.

REM 方法 3: python
python --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] 'python' command found
    python --version
    set FOUND_PYTHON=1
) else (
    echo [X] 'python' command not found
    set FOUND_PYTHON=0
)
echo.

REM 檢查是否找到任何 Python
if %FOUND_PY% equ 1 (
    set PYTHON_CMD=py
    goto :check_pip
)
if %FOUND_PYTHON3% equ 1 (
    set PYTHON_CMD=python3
    goto :check_pip
)
if %FOUND_PYTHON% equ 1 (
    set PYTHON_CMD=python
    goto :check_pip
)

REM 找不到 Python
echo ========================================
echo [ERROR] Python not found!
echo ========================================
echo.
echo Please install Python 3.10+ from:
echo https://www.python.org/downloads/
echo.
echo Make sure to check "Add Python to PATH" during installation.
echo.
echo See: backend\Python安裝指南.md
echo.
pause
exit /b 1

:check_pip
echo ========================================
echo [2/5] Checking pip...
echo.
%PYTHON_CMD% -m pip --version
if %errorlevel% equ 0 (
    echo [OK] pip is installed
) else (
    echo [X] pip not found
)
echo.

echo ========================================
echo [3/5] Checking required packages...
echo.
cd /d "%~dp0"
%PYTHON_CMD% -c "import fastapi; print('[OK] fastapi installed')" 2>nul || echo [X] fastapi not installed
%PYTHON_CMD% -c "import uvicorn; print('[OK] uvicorn installed')" 2>nul || echo [X] uvicorn not installed
%PYTHON_CMD% -c "import PIL; print('[OK] Pillow installed')" 2>nul || echo [X] Pillow not installed
%PYTHON_CMD% -c "import ultralytics; print('[OK] ultralytics installed')" 2>nul || echo [X] ultralytics not installed
%PYTHON_CMD% -c "import torch; print('[OK] PyTorch installed')" 2>nul || echo [X] PyTorch not installed
echo.

echo ========================================
echo [4/5] Checking YOLO model...
echo.
if exist "models\best_yolo11x.pt" (
    echo [OK] YOLO11 model found
    for %%A in ("models\best_yolo11x.pt") do echo     Size: %%~zA bytes
) else (
    echo [X] YOLO11 model not found
    echo     Run: python download_model.py
)
echo.

echo ========================================
echo [5/5] Checking backend directory...
echo.
if exist "app.py" (
    echo [OK] app.py found
) else (
    echo [X] app.py not found
    echo     Are you in the backend directory?
)
echo.

echo ========================================
echo   Summary
echo ========================================
echo.
echo Python Command: %PYTHON_CMD%
echo Backend Directory: %CD%
echo.

REM 給建議
echo ========================================
echo   Recommendations
echo ========================================
echo.

if not exist "models\best_yolo11x.pt" (
    echo 1. Download YOLO model:
    echo    %PYTHON_CMD% download_model.py
    echo.
)

%PYTHON_CMD% -c "import fastapi" 2>nul
if %errorlevel% neq 0 (
    echo 2. Install dependencies:
    echo    pip install -r requirements.txt
    echo.
)

echo 3. Start backend:
echo    Double-click: start-backend-persistent.bat
echo    Or run: %PYTHON_CMD% app.py
echo.

echo ========================================
echo.
pause
