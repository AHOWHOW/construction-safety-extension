# 🐍 Python 安裝指南

## 問題診斷

如果你看到以下錯誤：
```
'python' is not recognized as an internal or external command,
operable program or batch file.
```

這表示：
- ❌ Python 未安裝
- ❌ Python 未加入系統 PATH

---

## 解決方案

### 方法 1：安裝 Python（推薦）

#### 步驟 1：下載 Python

訪問官方網站：
```
https://www.python.org/downloads/
```

**推薦版本**：Python 3.11.x 或 3.12.x

#### 步驟 2：執行安裝程式

**⚠️ 重要**：安裝時必須勾選以下選項：

1. ✅ **Add Python to PATH** ← 這個最重要！
2. ✅ **Install for all users** （可選）
3. 點擊「Install Now」或「Customize installation」

![Python 安裝截圖示意]
```
┌────────────────────────────────────┐
│ Install Python 3.11.x              │
├────────────────────────────────────┤
│                                    │
│ ☑ Install launcher for all users  │
│ ☑ Add Python to PATH  ← 勾選這個  │
│                                    │
│ [ Install Now ]  [ Customize... ]  │
└────────────────────────────────────┘
```

#### 步驟 3：驗證安裝

安裝完成後，開啟**新的**命令提示字元（重要！），執行：

```bash
python --version
```

應該會顯示：
```
Python 3.11.x
```

或嘗試：
```bash
py --version
```

---

### 方法 2：手動加入 PATH（已安裝 Python 但未加入 PATH）

如果你已經安裝了 Python，但忘記勾選「Add to PATH」：

#### 步驟 1：找到 Python 安裝路徑

常見位置：
```
C:\Users\<你的使用者名稱>\AppData\Local\Programs\Python\Python311\
C:\Python311\
C:\Program Files\Python311\
```

#### 步驟 2：加入系統 PATH

1. 按 `Win + R`，輸入 `sysdm.cpl` 按 Enter
2. 點擊「進階」標籤
3. 點擊「環境變數」
4. 在「系統變數」區域，找到「Path」，點擊「編輯」
5. 點擊「新增」，加入以下兩個路徑：
   ```
   C:\Users\<你的使用者名稱>\AppData\Local\Programs\Python\Python311\
   C:\Users\<你的使用者名稱>\AppData\Local\Programs\Python\Python311\Scripts\
   ```
6. 點擊「確定」儲存

#### 步驟 3：重新啟動命令提示字元

**重要**：必須關閉並重新開啟命令提示字元，PATH 才會生效。

---

### 方法 3：使用 Python Launcher (py)

如果安裝時勾選了 Python Launcher，可以使用 `py` 命令：

```bash
py --version
py app.py
```

我已經更新了啟動腳本，會自動檢測 `py`、`python3` 或 `python` 命令。

---

## 驗證安裝

### 測試 1：檢查 Python 版本
```bash
python --version
```

### 測試 2：檢查 pip（套件管理器）
```bash
pip --version
```

或
```bash
python -m pip --version
```

### 測試 3：安裝依賴套件
```bash
cd D:\CODE\4-WEBGPU-02\construction-safety-extension\backend
pip install -r requirements.txt
```

---

## 常見問題

### Q1：安裝後仍然找不到 Python

**A1**：
1. 確認已重新啟動命令提示字元
2. 確認 PATH 設定正確
3. 嘗試使用 `py` 命令
4. 重新安裝 Python，勾選「Add to PATH」

### Q2：有多個 Python 版本

**A2**：
使用 `py` launcher 指定版本：
```bash
py -3.11 app.py     # 使用 Python 3.11
py -3 app.py        # 使用最新的 Python 3.x
```

### Q3：權限錯誤

**A3**：
以系統管理員身分執行命令提示字元：
1. 搜尋「cmd」
2. 右鍵點擊「命令提示字元」
3. 選擇「以系統管理員身分執行」

### Q4：安裝套件時很慢

**A4**：
使用清華大學鏡像：
```bash
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

---

## 安裝後啟動後端

安裝完 Python 後：

### 方法 1：使用更新後的啟動腳本
雙擊執行：
```
backend/start-backend-persistent.bat
```

現在會自動檢測 Python 命令！

### 方法 2：手動啟動
```bash
cd D:\CODE\4-WEBGPU-02\construction-safety-extension\backend
python app.py
```

或
```bash
py app.py
```

---

## 系統需求

- **作業系統**：Windows 10/11
- **Python 版本**：3.10、3.11 或 3.12（推薦 3.11）
- **硬碟空間**：至少 1GB（Python + 依賴套件）
- **記憶體**：建議 8GB 以上

---

## 成功標誌

當你看到以下訊息，表示 Python 環境正常：

```
[INFO] Detecting Python installation...
[OK] Found 'py' launcher
[INFO] Using Python command: py

[週五 2026/01/16 15:00:00.00] Starting Python backend...
🚀 Starting Construction Safety AI Backend...
📍 Ollama Host: http://localhost:11434
🤖 Ollama Model: qwen3-vl:8b
🎯 YOLO Model: YOLO11 Construction Hazard Detection
🔄 Loading YOLO11 Construction Hazard Detection model...
✅ YOLO11 model loaded successfully
✅ Backend ready!
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

---

## 需要幫助？

如果還是無法解決，請檢查：
1. Python 版本是否為 3.10+
2. 是否以系統管理員權限安裝
3. 防毒軟體是否阻擋
4. 硬碟空間是否足夠

---

**提示**：安裝 Python 後，建議重新啟動電腦以確保 PATH 環境變數生效。
