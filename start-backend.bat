@echo off
echo ========================================
echo  Construction Safety AI - Backend
echo ========================================
echo.

echo [1/3] Checking Python environment...
python --version
if errorlevel 1 (
    echo ERROR: Python not found!
    echo Please install Python 3.10+ from https://python.org
    pause
    exit /b 1
)

echo.
echo [2/3] Activating virtual environment (if exists)...
if exist "backend\venv\Scripts\activate.bat" (
    call backend\venv\Scripts\activate.bat
    echo Virtual environment activated
) else (
    echo No virtual environment found - using system Python
)

echo.
echo [3/3] Starting FastAPI backend...
echo URL: http://localhost:8000
echo Press Ctrl+C to stop
echo.

cd backend
python app.py
