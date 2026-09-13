@echo off
echo ========================================
echo   設定 Backend 開機自動啟動
echo ========================================
echo.
echo 此腳本將會：
echo 1. 在 Windows 啟動資料夾建立捷徑
echo 2. 讓 Backend 在開機時自動啟動（隱藏視窗）
echo.
pause

set STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set VBS_PATH=%~dp0start-backend-hidden.vbs

echo 正在建立捷徑...
powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%STARTUP_FOLDER%\Construction Safety Backend.lnk'); $Shortcut.TargetPath = '%VBS_PATH%'; $Shortcut.WorkingDirectory = '%~dp0'; $Shortcut.Description = 'Construction Safety Backend Auto-Start'; $Shortcut.Save()"

if %errorlevel% equ 0 (
    echo.
    echo ✓ 設定成功！
    echo.
    echo Backend 將在下次開機時自動啟動。
    echo 如要立即啟動，請執行 start-backend-hidden.vbs
    echo.
    echo 如要移除自動啟動：
    echo 刪除此檔案：%STARTUP_FOLDER%\Construction Safety Backend.lnk
) else (
    echo.
    echo ✗ 設定失敗！
    echo 請以管理員身分執行此批次檔。
)

echo.
pause
