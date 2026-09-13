# Backend 自動啟動設定指南

## 🎯 目的

讓 Construction Safety Backend 在 Windows 開機時自動啟動，無需每次手動執行。

---

## ⚡ 快速設定（3 步驟）

### **方式 1：開機自動啟動（推薦）**

1. **雙擊執行** `install-autostart.bat`
2. 完成！下次開機時 Backend 會自動啟動
3. 可選：立即啟動 → 雙擊 `start-backend-hidden.vbs`

### **方式 2：手動啟動（有視窗版）**

- 雙擊執行 `start-backend-persistent.bat`
- Backend 會在視窗中運行，可看到即時 log
- 關閉視窗即停止 Backend

### **方式 3：手動啟動（無視窗版）**

- 雙擊執行 `start-backend-hidden.vbs`
- Backend 在背景運行，完全隱藏
- 需手動關閉程序（工作管理員 → 結束 python.exe）

---

## 🔧 管理

### **檢查 Backend 是否運行**

開啟瀏覽器訪問：
```
http://localhost:8000/health
```

如果看到 JSON 回應，表示 Backend 正在運行。

### **停止 Backend**

- **有視窗版**：關閉命令提示字元視窗
- **無視窗版**：
  1. 開啟工作管理員 (Ctrl + Shift + Esc)
  2. 尋找 `python.exe` 或 `pythonw.exe`
  3. 點擊「結束工作」

### **移除開機自動啟動**

雙擊執行 `uninstall-autostart.bat`

---

## 📂 檔案說明

| 檔案名稱 | 用途 |
|---------|------|
| `start-backend-persistent.bat` | 持續運行版本（有視窗，可看 log） |
| `start-backend-hidden.vbs` | 隱藏視窗版本（背景運行） |
| `install-autostart.bat` | 設定開機自動啟動 |
| `uninstall-autostart.bat` | 移除開機自動啟動 |
| `app.py` | Backend 主程式 |

---

## 🐛 常見問題

### **Q: Backend 無法啟動？**

**A:** 檢查以下項目：
1. Python 是否已安裝？ `python --version`
2. 套件是否已安裝？ `pip install -r requirements.txt`
3. 檢查 8000 port 是否被佔用

### **Q: 如何查看 Backend 運行狀態？**

**A:**
- 有視窗版：直接看命令提示字元的輸出
- 無視窗版：檢查工作管理員是否有 `python.exe`

### **Q: Backend 會佔用很多資源嗎？**

**A:**
- 閒置時：約 100-200 MB RAM
- 分析時：約 500-800 MB RAM（YOLO 模型載入）
- CPU：閒置時 < 1%，分析時 10-30%

### **Q: 我想讓 Backend 只在需要時才啟動**

**A:**
不要設定開機自動啟動，改用手動啟動：
- 使用前雙擊 `start-backend-persistent.bat`
- 使用完畢後關閉視窗

---

## 🚀 最佳實踐

### **推薦設定**

1. **執行一次** `install-autostart.bat` 設定開機自動啟動
2. **重新開機** 或 **手動執行** `start-backend-hidden.vbs`
3. **享受無縫體驗** - 以後都不用手動啟動 Backend！

### **適合誰使用？**

- ✅ 經常使用此擴充功能
- ✅ 不想每次使用前都要手動啟動 Backend
- ✅ 電腦效能足夠（建議 8GB+ RAM）

### **不推薦誰使用？**

- ❌ 偶爾才使用此擴充功能
- ❌ 電腦效能較弱
- ❌ 想節省系統資源

---

## 📞 技術支援

如有問題，請檢查：
1. Backend Console 輸出（如果使用有視窗版）
2. Chrome Extension Console（F12 → Console）
3. 確認 `http://localhost:8000/health` 可訪問

---

**祝您使用愉快！** 🎉
