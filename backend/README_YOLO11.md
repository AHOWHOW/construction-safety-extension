# YOLO11 Construction Hazard Detection 整合說明

## 🎯 模型資訊

本專案已整合 **YOLO11 Construction Hazard Detection** 模型，專門針對工地安全監控進行訓練。

- **模型來源**: [yihong1120/Construction-Hazard-Detection-YOLO11](https://huggingface.co/yihong1120/Construction-Hazard-Detection-YOLO11)
- **架構**: YOLO11 (Ultralytics)
- **訓練目標**: 工地安全裝備 (PPE) 與危險偵測

---

## 📊 偵測類別 (11 類)

| ID | 類別 | 說明 | 顏色標示 |
|----|------|------|----------|
| 0 | **Hardhat** | 安全帽（正確配戴） | 🟢 綠色 |
| 1 | **Mask** | 口罩（正確配戴） | 🟢 綠色 |
| 2 | **NO-Hardhat** | 未戴安全帽 | 🔴 紅色 |
| 3 | **NO-Mask** | 未戴口罩 | 🔴 紅色 |
| 4 | **NO-Safety Vest** | 未穿安全背心 | 🔴 紅色 |
| 5 | **Person** | 人員 | 🔵 青色 |
| 6 | **Safety Cone** | 安全錐 | 🔵 青色 |
| 7 | **Safety Vest** | 安全背心（正確穿著） | 🟢 綠色 |
| 8 | **Machinery** | 機械設備 | 🟡 黃色 |
| 9 | **Utility Pole** | 電線桿（電氣危險警示） | 🟠 橙色 |
| 10 | **Vehicle** | 車輛 | 🟡 黃色 |

---

## 🚀 快速開始

### 1. 安裝依賴項

```bash
cd backend
pip install -r requirements.txt
```

**重要依賴項**:
- `ultralytics>=8.3.0` - YOLO11 支援
- `huggingface-hub>=0.20.0` - 模型下載
- `torch>=2.1.0` - PyTorch

### 2. 下載 YOLO11 模型

使用提供的下載腳本：

```bash
python download_model.py
```

**選項**:
```bash
# 下載預設模型 (extra-large, 最高準確度)
python download_model.py

# 下載較小的模型 (faster, 較低準確度)
python download_model.py --variant small

# 列出所有可用變體
python download_model.py --list
```

**可用的模型變體**:
- `nano` - 最快速，適合即時應用
- `small` - 平衡速度與準確度
- `medium` - 標準配置
- `large` - 高準確度
- `extra-large` - 最高準確度（推薦）

### 3. 啟動後端服務

```bash
python app.py
```

服務將在 `http://localhost:8000` 啟動。

---

## 🔧 配置說明

### app.py 主要配置

```python
# ===== 設定 =====
OLLAMA_HOST = "http://localhost:11434"
OLLAMA_MODEL = "qwen3-vl:8b"
YOLO_MODEL_PATH = "models/best_yolo11x.pt"  # YOLO11 模型路徑
```

### 偵測參數

```python
# 在 run_yolo_detection() 函數中
results = yolo_model(image, imgsz=640, conf=0.25)
```

**可調整參數**:
- `imgsz=640` - 輸入圖片大小（640x640）
- `conf=0.25` - 信心度閾值（0-1，越高越嚴格）

---

## 📡 API 端點

### 1. 健康檢查
```http
GET /health
```

**回應範例**:
```json
{
  "status": "healthy",
  "yolo_model": "YOLO11 Construction Hazard Detection",
  "yolo_available": true,
  "ollama_available": true,
  "ollama_host": "http://localhost:11434",
  "timestamp": "2026-01-13T10:30:00"
}
```

### 2. 影像分析
```http
POST /api/analyze
Content-Type: multipart/form-data

file: <image_file>
```

**回應範例**:
```json
{
  "yolo_detections": [
    {
      "bbox": [100.5, 200.3, 150.2, 180.7],
      "class_name": "NO-Hardhat",
      "confidence": 0.89,
      "color": "#FF0000"
    }
  ],
  "yolo_annotated_image": "base64_encoded_image...",
  "ai_analysis": {
    "scene_description": "工地現場，發現1名工人未戴安全帽...",
    "hazards": [
      {
        "description": "工人未配戴安全帽",
        "severity": "high"
      }
    ],
    "risk_level": "high",
    "recommendations": [
      "立即要求工人配戴安全帽",
      "加強安全教育訓練"
    ]
  }
}
```

---

## 🆚 與舊版本的差異

### 舊版本 (YOLOv8)
- ❌ 使用 2 個模型（PPE + Construction）
- ❌ 18 個類別（分散在兩個模型）
- ❌ 記憶體佔用較高
- ❌ 推理時間較長

### 新版本 (YOLO11)
- ✅ 單一整合模型
- ✅ 11 個核心類別
- ✅ **新增口罩偵測** (Mask / NO-Mask)
- ✅ **新增電線桿偵測** (Utility Pole)
- ✅ 記憶體佔用減少 50%+
- ✅ 推理速度提升
- ✅ 準確度更高 (YOLO11 架構)

---

## 🔍 程式碼變更摘要

### 主要修改檔案

1. **`app.py`**
   - 簡化模型載入邏輯（單一模型）
   - 更新類別定義（11 類）
   - 優化偵測函數

2. **`requirements.txt`**
   - 升級 `ultralytics>=8.3.0`
   - 新增 `huggingface-hub>=0.20.0`

3. **`download_model.py`** (新增)
   - 自動下載模型腳本

---

## 🐛 故障排除

### 問題 1: 模型載入失敗
```
❌ Model file not found: models/best_yolo11x.pt
```

**解決方案**:
```bash
python download_model.py
```

### 問題 2: YOLO11 不支援
```
AttributeError: 'YOLO' object has no attribute 'yolo11'
```

**解決方案**:
```bash
pip install --upgrade ultralytics
# 確保版本 >= 8.3.0
```

### 問題 3: 記憶體不足
**解決方案**: 使用較小的模型變體
```bash
python download_model.py --variant small
```

然後修改 `app.py`:
```python
YOLO_MODEL_PATH = "models/best_yolo11s.pt"
```

---

## 📈 效能比較

| 模型變體 | 檔案大小 | 推理速度 (GPU) | 準確度 | 記憶體 |
|---------|---------|---------------|--------|--------|
| nano | ~6 MB | ~2 ms | ⭐⭐⭐ | ~500 MB |
| small | ~22 MB | ~3 ms | ⭐⭐⭐⭐ | ~1 GB |
| medium | ~50 MB | ~5 ms | ⭐⭐⭐⭐ | ~2 GB |
| large | ~88 MB | ~8 ms | ⭐⭐⭐⭐⭐ | ~3 GB |
| **extra-large** | ~140 MB | ~12 ms | ⭐⭐⭐⭐⭐ | ~4 GB |

**推薦配置**:
- 開發/測試: `small` 或 `medium`
- 生產環境: `large` 或 `extra-large`

---

## 📚 參考資源

- [YOLO11 官方文件](https://docs.ultralytics.com/)
- [模型 Hugging Face 頁面](https://huggingface.co/yihong1120/Construction-Hazard-Detection-YOLO11)
- [原始 GitHub 專案](https://github.com/yihong1120/Construction-Hazard-Detection)

---

## 📝 更新日誌

### v2.0.0 (2026-01-13)
- ✅ 完全替換為 YOLO11 模型
- ✅ 新增口罩偵測功能
- ✅ 新增電線桿（電氣危險）偵測
- ✅ 簡化架構（單一模型）
- ✅ 提升效能與準確度

### v1.0.0 (原始版本)
- 使用 YOLOv8 雙模型架構

---

## 💡 注意事項

1. **首次使用**: 請確保執行 `download_model.py` 下載模型
2. **GPU 加速**: 如有 NVIDIA GPU，確保安裝 `torch` 的 CUDA 版本
3. **模型選擇**: 根據硬體配置選擇適合的模型變體
4. **備份**: 舊版 `app.py` 已備份為 `app.py.backup`

---

**🎉 祝使用順利！如有問題請參考故障排除或聯繫技術支援。**
