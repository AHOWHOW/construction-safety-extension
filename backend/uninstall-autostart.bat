@echo off
echo ========================================
echo   移除 Backend 開機自動啟動
echo ========================================
echo.

set STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set SHORTCUT_PATH=%STARTUP_FOLDER%\Construction Safety Backend.lnk

if exist "%SHORTCUT_PATH%" (
    del "%SHORTCUT_PATH%"
    echo ✓ 已移除開機自動啟動
    echo.
    echo Backend 將不會在下次開機時自動啟動。
    echo 如需手動啟動，請執行 start-backend-persistent.bat
) else (
    echo ✗ 找不到自動啟動捷徑
    echo Backend 可能尚未設定為開機自動啟動。
)

echo.
pause
