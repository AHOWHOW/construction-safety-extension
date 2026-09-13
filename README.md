# 工地安全監控 Chrome 擴充功能

使用 AI 技術（YOLO11x + Qwen3-VL）進行工地安全分析的 Chrome 瀏覽器擴充功能。

## 架構

```
┌─────────────────────────────────────┐
│  Chrome Extension (前端)            │
│  • Popup / Content Script / Webcam  │
│  • 透過 HTTP 呼叫本機後端 API        │
└──────────────┬──────────────────────┘
               │  POST /api/analyze
               ▼
┌─────────────────────────────────────┐
│  FastAPI Backend (localhost:8000)   │
│  • YOLO11x 物件偵測 (PyTorch)       │
│  • Qwen3-VL 視覺校核 (Ollama)       │
│  • PDF 報告生成                      │
└─────────────────────────────────────┘
```

所有 AI 推論皆在後端執行；擴充功能本身不執行模型。

## 功能

- **網頁圖片分析**：滑鼠懸停在圖片上 → 點擊 Analyze Safety → 側邊欄顯示風險等級、隱患、建議
- **即時攝影機監控**：開啟 webcam.html，每 3 秒自動分析畫面
- **PDF 報告**：分析完成後可匯出繁體中文 PDF
- **YOLO11 偵測類別**：Hardhat / Mask / Safety Vest / NO-Hardhat / NO-Mask / NO-Safety Vest / Person / Safety Cone / Machinery / Utility Pole / Vehicle

## 快速開始

### 1. 安裝 Ollama 與 Qwen3-VL

```bash
# https://ollama.com/
ollama pull qwen3-vl:8b
ollama serve   # 預設 http://localhost:11434
```

### 2. 安裝後端

```bash
cd backend
pip install -r requirements.txt
python download_model.py        # 下載 best_yolo11x.pt
python app.py                   # 啟動 FastAPI (http://localhost:8000)
```

或在 Windows 雙擊 `backend/start-backend-persistent.bat`。

### 3. 建置擴充功能

```bash
npm install
npm run build
```

### 4. 載入到 Chrome

1. `chrome://extensions/` → 啟用「開發人員模式」
2. 點擊「載入未封裝項目」→ 選擇 `dist/` 資料夾

## 專案結構

```
construction-safety-extension/
├── manifest.json
├── index.html / webcam.html        # 擴充功能進入點
├── src/
│   ├── background/index.ts         # Service Worker（截圖 / 代理 / PDF）
│   ├── content/                    # Content Script + Overlay + Sidebar
│   ├── popup/                      # 擴充功能彈窗
│   ├── webcam/                     # 即時監控頁
│   └── services/backend-api.ts     # 與 FastAPI 通訊
├── backend/
│   ├── app.py                      # FastAPI 主程式
│   ├── config.py                   # 標籤標準化
│   ├── pdf_generator.py            # PDF 生成
│   ├── download_model.py           # 模型下載
│   ├── requirements.txt
│   └── models/best_yolo11x.pt
└── README.md / TROUBLESHOOTING.md / YOLO11-MODEL-SETUP.md
```

## 系統需求

- **後端**：Python 3.10+、PyTorch 2.1+、16GB RAM、建議 8GB+ VRAM
- **前端**：Node.js 18+、Chrome 最新版

## 開發指令

```bash
npm run dev      # Vite 熱重載
npm run build    # 生產建置
npm run lint
```

## 模型來源

- YOLO11 Construction Hazard Detection: [yihong1120/Construction-Hazard-Detection-YOLO11](https://huggingface.co/yihong1120/Construction-Hazard-Detection-YOLO11)
- Qwen3-VL: [Ollama Library](https://ollama.com/library/qwen3-vl)

## 授權

- YOLO11 / Ultralytics: AGPL-3.0
- Qwen3-VL: Apache 2.0
- 本專案：見 LICENSE

---

**⚠️ 此工具僅供輔助參考，不能取代專業工地安全檢查。**
