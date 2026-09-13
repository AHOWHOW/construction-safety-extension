# YOLO 模型目錄

將 YOLO 模型檔案放置於此目錄。

## 📁 檔案結構

```
models/
├── yolov8-ppe.pt              # PPE Detection 模型（PyTorch 格式）
├── yolov8-construction.pt     # Construction Safety 模型（PyTorch 格式）
└── README.md                  # 本檔案
```

## 🔽 模型來源

### **選項 A：從 Roboflow Universe 下載**

1. 訪問 [Roboflow Universe](https://universe.roboflow.com/)
2. 搜尋 "PPE Detection" 和 "Construction Safety"
3. 下載 **YOLOv8 PyTorch** 格式（`.pt` 檔案）
4. 重新命名為：
   - `yolov8-ppe.pt`
   - `yolov8-construction.pt`
5. 放置於此目錄

### **選項 B：使用預訓練的 YOLOv8 模型（測試用）**

如果沒有專門的工地安全模型，可以先使用 YOLOv8 預訓練模型測試：

```python
from ultralytics import YOLO

# 下載預訓練模型（第一次運行會自動下載）
model = YOLO('yolov8n.pt')  # nano 版本（最快）
# model = YOLO('yolov8s.pt')  # small 版本
# model = YOLO('yolov8m.pt')  # medium 版本
# model = YOLO('yolov8l.pt')  # large 版本
```

## 🎯 模型格式說明

後端支援兩種格式：

### **1. PyTorch 格式（`.pt`）** - 推薦
- 使用 Ultralytics YOLO
- 安裝簡單，效能好
- 支援 CUDA GPU 加速
- 檔案大小：6-50 MB

### **2. ONNX 格式（`.onnx`）**
- 使用 ONNX Runtime
- 跨平台兼容性好
- 需要額外配置

## ⚙️ 切換模型後端

編輯 `app.py` 第 20 行：

```python
YOLO_BACKEND = "ultralytics"  # 或 "onnx"
```

## 🚀 測試模型

啟動後端後，訪問：
```
http://localhost:8000/
```

應該會看到：
```json
{
  "status": "running",
  "yolo_available": true  // ← 如果模型載入成功
}
```

## 📊 模型效能參考

在 RTX 4090 16GB VRAM 上：

| 模型大小 | 推論速度（GPU） | 準確度 |
|---------|---------------|--------|
| YOLOv8n | 5-10ms | 中等 |
| YOLOv8s | 10-15ms | 良好 |
| YOLOv8m | 15-25ms | 優秀 |
| YOLOv8l | 25-40ms | 極佳 |

**推薦**：使用 YOLOv8s 或 YOLOv8m，平衡速度與準確度。
