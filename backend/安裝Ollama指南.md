# 🤖 Ollama 安裝與設定指南

## 什麼是 Ollama？

Ollama 是一個本機 AI 模型運行平台，讓你可以在自己的電腦上運行大型語言模型（LLM），無需雲端服務。

在 Construction Safety AI 中，Ollama 負責：
- 📝 場景描述分析
- ⚠️ 安全隱患識別
- 💡 改善建議生成
- 🔍 物件辨識校正

---

## 📥 步驟 1：下載 Ollama

### Windows 用戶

1. 訪問 Ollama 官網：
   ```
   https://ollama.ai/download
   ```

2. 點擊 **Download for Windows**

3. 下載 `OllamaSetup.exe`（約 300-500 MB）

---

## 💾 步驟 2：安裝 Ollama

1. **執行安裝程式**
   - 雙擊 `OllamaSetup.exe`
   - 按照安裝精靈指示完成安裝

2. **安裝位置**（預設）
   ```
   C:\Users\<你的使用者名稱>\AppData\Local\Programs\Ollama
   ```

3. **自動啟動**
   - 安裝完成後，Ollama 會自動啟動
   - 你會在系統匣（右下角）看到 Ollama 圖示

---

## 🎯 步驟 3：下載 Qwen3-VL 模型

Ollama 安裝完成後，需要下載 AI 模型。

### 開啟命令提示字元

按 `Win + R`，輸入 `cmd`，按 Enter

### 下載模型

```bash
ollama pull qwen3-vl:8b
```

**注意**：
- 模型大小：約 **4.5 GB**
- 下載時間：取決於網速（10-30 分鐘）
- 儲存位置：`%USERPROFILE%\.ollama\models`

### 下載進度示例
```
pulling manifest
pulling 8934d96d3f08... 100% ▕████████████████▏ 4.7 GB
pulling 8ab4849b038c... 100% ▕████████████████▏ 1.4 KB
pulling 577073ffcc6c... 100% ▕████████████████▏ 11 KB
pulling c23fa4d28ec6... 100% ▕████████████████▏ 485 B
verifying sha256 digest
writing manifest
success
```

---

## ✅ 步驟 4：驗證安裝

### 測試 1：檢查 Ollama 服務

```bash
ollama --version
```

應該顯示：
```
ollama version is 0.x.x
```

### 測試 2：列出已安裝的模型

```bash
ollama list
```

應該會看到：
```
NAME            ID              SIZE      MODIFIED
qwen3-vl:8b     abc123def456    4.7 GB    2 minutes ago
```

### 測試 3：測試模型運行

```bash
ollama run qwen3-vl:8b "Hello"
```

應該會得到 AI 回應（確認模型可以正常運行）

---

## 🔧 步驟 5：啟動 Ollama 服務（如果未自動啟動）

通常 Ollama 會在安裝後自動啟動，但如果沒有：

### 方法 1：從開始功能表啟動
1. 按 `Win` 鍵
2. 搜尋 "Ollama"
3. 點擊 "Ollama" 應用程式

### 方法 2：命令列啟動
```bash
ollama serve
```

### 檢查服務是否運行
開啟瀏覽器，訪問：
```
http://localhost:11434
```

應該會看到：
```
Ollama is running
```

---

## 🎉 步驟 6：重新測試 Construction Safety AI

### 6.1 確認 Ollama 正在運行

在系統匣（右下角）檢查是否有 Ollama 圖示

### 6.2 重新啟動後端

關閉並重新執行：
```
backend/start-backend-persistent.bat
```

### 6.3 檢查健康狀態

開啟瀏覽器訪問：
```
http://localhost:8000/health
```

應該會看到：
```json
{
  "status": "healthy",
  "yolo_model": "YOLO11 Construction Hazard Detection",
  "yolo_available": true,
  "ollama_available": true,  ← 這裡應該是 true
  "ollama_host": "http://localhost:11434",
  "timestamp": "2026-01-16T..."
}
```

### 6.4 重新分析圖片

回到 Chrome Extension，重新點擊工地圖片分析。

現在應該會看到完整的 AI 分析：
- ✅ YOLO11 物件偵測
- ✅ 詳細的場景描述
- ✅ 安全隱患識別
- ✅ 改善建議

---

## 🔍 常見問題

### Q1：Ollama 下載很慢怎麼辦？

**A1**：Ollama 從國外伺服器下載，如果太慢可以：
1. 使用 VPN
2. 等待非尖峰時段下載
3. 或使用較小的模型（但效果較差）

### Q2：模型下載失敗或中斷

**A2**：
```bash
# 重新下載
ollama pull qwen3-vl:8b

# 如果還是失敗，刪除後重試
ollama rm qwen3-vl:8b
ollama pull qwen3-vl:8b
```

### Q3：記憶體不足

**A3**：Qwen3-VL 8B 模型需要：
- **最低**：8GB RAM
- **推薦**：16GB RAM
- **GPU**（可選）：NVIDIA GPU with 6GB+ VRAM

如果記憶體不足，可以使用較小的模型：
```bash
ollama pull qwen3-vl:4b  # 較小，約 2.5 GB
```

然後修改 `backend/app.py`：
```python
OLLAMA_MODEL = "qwen3-vl:4b"  # 改為 4b
```

### Q4：Ollama 服務無法啟動

**A4**：檢查端口是否被佔用
```bash
netstat -ano | findstr :11434
```

如果被佔用，關閉佔用的程序或更改端口。

### Q5：想要移除 Ollama

**A5**：
1. 到「設定」→「應用程式」
2. 找到「Ollama」
3. 點擊「解除安裝」

或使用命令列：
```bash
# 刪除模型
ollama rm qwen3-vl:8b

# 刪除所有模型
ollama rm $(ollama list -q)
```

---

## 📊 系統需求總結

| 項目 | 最低要求 | 推薦配置 |
|------|---------|---------|
| 作業系統 | Windows 10+ | Windows 11 |
| RAM | 8GB | 16GB+ |
| 硬碟空間 | 10GB | 20GB+ |
| GPU | 無（CPU運行） | NVIDIA GPU 6GB+ VRAM |
| 網路 | 用於下載模型 | - |

---

## 🎯 完整啟動檢查清單

安裝完成後，確認以下項目：

- [ ] Ollama 已安裝（`ollama --version` 有輸出）
- [ ] Qwen3-VL 模型已下載（`ollama list` 看到模型）
- [ ] Ollama 服務正在運行（http://localhost:11434 可訪問）
- [ ] Python 後端已重新啟動
- [ ] 健康檢查顯示 `ollama_available: true`
- [ ] Chrome Extension 可以顯示完整的 AI 分析

**全部打勾？恭喜，你現在擁有完整的 AI 分析功能了！** 🎉

---

## 📚 進階設定（可選）

### 自定義 Ollama 配置

編輯環境變數：
```
OLLAMA_HOST=0.0.0.0:11434  # 允許外部訪問
OLLAMA_MODELS=%USERPROFILE%\.ollama\models  # 模型儲存路徑
```

### 使用其他模型

Ollama 支援多種模型：
```bash
ollama pull llama3.2-vision  # Meta 的視覺模型
ollama pull llava            # 另一個視覺理解模型
```

修改 `backend/app.py` 的 `OLLAMA_MODEL` 參數即可。

---

**需要幫助？** 如果遇到問題，請檢查：
- Ollama 官方文檔：https://github.com/ollama/ollama
- 或查看後端日誌訊息找出問題所在
