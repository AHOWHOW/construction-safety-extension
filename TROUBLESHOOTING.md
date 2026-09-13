# 🔧 疑難排解指南

## 問題：「Analysis Failed - Image is not defined」

### 問題描述
點擊「Analyze Safety」按鈕後，側邊欄顯示：
```
⚠️ Analysis Failed
Image is not defined
```

### 可能原因與解決方法

---

## 解決方案 1：重新載入擴充功能（最常見）

**原因**：程式碼已更新，但 Chrome 仍在使用舊版本

**步驟**：

1. **前往擴充功能管理頁面**
   ```
   chrome://extensions/
   ```

2. **找到 Construction Safety Monitor**

3. **點擊「重新整理」圖示** (🔄)
   - 在擴充功能卡片的右下角
   - 或點擊「移除」後重新載入

4. **重新整理網頁**
   - 按 `F5` 或 `Ctrl+R`

5. **重新測試**
   - 懸停在圖片上
   - 點擊「Analyze Safety」

---

## 解決方案 2：檢查瀏覽器主控台

**步驟**：

1. **開啟開發者工具**
   - 按 `F12` 或 `Ctrl+Shift+I`

2. **切換到 Console 分頁**

3. **清除主控台**
   - 點擊「清除主控台」圖示

4. **重新點擊「Analyze Safety」**

5. **查看錯誤訊息**

### 常見錯誤訊息與解決方法

#### 錯誤 A：「Failed to extract base64 image data」

**原因**：截圖失敗或圖片資料損壞

**解決方法**：
```
1. 嘗試不同的圖片（較大的圖片）
2. 確認圖片完全載入（不是載入中的狀態）
3. 嘗試其他網站的圖片
```

#### 錯誤 B：「Image loading timeout after 10 seconds」

**原因**：圖片載入超時

**解決方法**：
```
1. 檢查網路連線
2. 確認圖片大小合理（不要太大，建議 < 10 MB）
3. 重新啟動 Chrome
```

#### 錯誤 C：「Failed to load image from base64 data」

**原因**：Base64 資料格式錯誤

**解決方法**：
```
1. 重新載入擴充功能
2. 清除瀏覽器快取
3. 確認圖片格式（支援 JPEG、PNG）
```

---

## 解決方案 3：檢查 Ollama 連線

**步驟**：

1. **確認 Ollama 運行中**
   ```bash
   curl http://localhost:11434/api/tags
   ```

   應該看到 JSON 回應，包含已安裝的模型列表。

2. **確認 CORS 設定**
   ```bash
   # Windows PowerShell
   $env:OLLAMA_ORIGINS="*"
   ollama serve

   # macOS/Linux
   export OLLAMA_ORIGINS="*"
   ollama serve
   ```

3. **測試 API**
   - 開啟瀏覽器，訪問：`http://localhost:11434/api/tags`
   - 應該看到 JSON 資料

---

## 解決方案 4：檢查 YOLO 模型

**步驟**：

1. **確認模型檔案存在**
   ```bash
   cd D:\CODE\4-WEBGPU-01\construction-safety-extension
   ls -lh dist/models/
   ```

   應該看到：
   ```
   yolov8-ppe.onnx          (292 KB)
   yolov8-construction.onnx (292 KB)
   ```

2. **如果檔案不存在或太小**
   ```bash
   # 重新下載模型
   npm run download-models

   # 重新建置
   npm run build
   ```

---

## 解決方案 5：完全重新安裝

**步驟**：

1. **移除擴充功能**
   ```
   chrome://extensions/
   → 找到 Construction Safety Monitor
   → 點擊「移除」
   ```

2. **清除建置檔案**
   ```bash
   cd D:\CODE\4-WEBGPU-01\construction-safety-extension
   rm -rf dist
   ```

3. **重新建置**
   ```bash
   npm run build
   ```

4. **重新載入擴充功能**
   ```
   chrome://extensions/
   → 載入未封裝項目
   → 選擇 dist 資料夾
   ```

---

## 除錯模式：啟用詳細日誌

### 查看 Background Script 日誌

1. **前往擴充功能管理頁面**
   ```
   chrome://extensions/
   ```

2. **找到 Construction Safety Monitor**

3. **點擊「檢查檢視」下的「service worker」連結**
   - 會開啟一個新的開發者工具視窗
   - 這是 background script 的主控台

4. **查看日誌輸出**

   正常情況下，你應該看到：
   ```
   Construction Safety Background Service Started v2-screenshot
   Background: Starting analysis with screenshot strategy...
   Background: Base64 image ready (XXXXX chars)
   Background: Starting integrated analysis...
   analyzeBase64WithYOLO: Starting...
   Base64 image length: XXXXX characters
   Image loaded successfully: WIDTHxHEIGHT
   analyzeBase64WithYOLO: Image loaded, starting integrated analysis...
   Starting integrated analysis...
   Stage 1: Running YOLO detection...
   YOLO detected X objects
   Stage 2: Running Qwen3-VL analysis...
   Integrated analysis complete
   Background: Analysis complete
   ```

### 查看 Content Script 日誌

1. **在任何網頁上按 F12**
   - 開啟開發者工具

2. **切換到 Console 分頁**

3. **查看相關日誌**

---

## 常見問題 FAQ

### Q1: 為什麼首次分析需要很長時間？

**A**: 首次分析需要載入 YOLO 模型（約 3-5 秒），之後會快很多。

### Q2: 為什麼有些圖片沒有「Analyze Safety」按鈕？

**A**: 擴充功能只會在大於 100x100 像素的圖片上顯示按鈕。太小的圖片會被忽略。

### Q3: 可以分析本地圖片嗎？

**A**: 可以，但需要：
1. 將圖片拖曳到瀏覽器（會開啟 file:// URL）
2. 或使用「Open Webcam Monitor」功能

### Q4: 為什麼 YOLO 沒有偵測到物體？

**A**: 可能原因：
1. 圖片中確實沒有可偵測的物體
2. 使用的是通用 YOLOv8n 模型（準確度有限）
3. 建議下載專門的 PPE 和工地安全模型

### Q5: 如何提升偵測準確度？

**A**:
1. 從 Roboflow Universe 下載專門訓練的模型
2. 調整信心度閾值（編輯 `src/services/yolo.ts`）
3. 使用更大的 YOLO 模型（如 YOLOv8m）

---

## 效能優化

### 如果分析速度很慢

1. **確認 GPU 加速已啟用**
   - ONNX Runtime 會自動使用 WebGL
   - 在主控台查看是否有 WebGL 錯誤

2. **減少連續監控頻率**
   - 編輯 `src/webcam/App.tsx`
   - 將 `setInterval` 時間從 3000 改為 5000（5 秒）

3. **使用較小的圖片**
   - 避免分析超過 2000x2000 的大圖
   - YOLO 會自動縮放到 640x640

---

## 聯絡支援

如果以上方法都無法解決問題：

1. **收集資訊**
   - 瀏覽器主控台的錯誤訊息（截圖）
   - Background script 的日誌（截圖）
   - 作業系統和 Chrome 版本
   - 嘗試分析的圖片 URL

2. **檢查已知問題**
   - 查看專案的 GitHub Issues

3. **提交問題報告**
   - 包含完整的錯誤訊息
   - 重現步驟
   - 系統環境資訊

---

## 快速診斷檢查清單

使用以下檢查清單快速診斷問題：

- [ ] Ollama 正在運行（`curl http://localhost:11434/api/tags`）
- [ ] CORS 已設定（`OLLAMA_ORIGINS="*"`）
- [ ] 擴充功能已載入（`chrome://extensions/`）
- [ ] 擴充功能已啟用（開關是藍色）
- [ ] 沒有錯誤訊息（擴充功能卡片上）
- [ ] YOLO 模型檔案存在（`dist/models/*.onnx`）
- [ ] 模型檔案大小正確（約 292 KB 每個）
- [ ] 擴充功能已重新整理（點擊🔄圖示）
- [ ] 網頁已重新整理（按 F5）
- [ ] 圖片大小足夠（> 100x100 像素）
- [ ] 瀏覽器主控台沒有錯誤（按 F12 查看）

如果以上全部打勾✓，但仍有問題，請查看詳細日誌輸出。

---

**祝你除錯順利！** 🔧
