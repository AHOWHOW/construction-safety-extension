Set WshShell = CreateObject("WScript.Shell")
' 取得當前 VBS 檔案的目錄
strPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
' 執行批次檔，0 代表隱藏視窗
WshShell.Run Chr(34) & strPath & "\start-backend-persistent.bat" & Chr(34), 0
Set WshShell = Nothing
