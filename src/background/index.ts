import { analyzeWithBackend, detectWithBackend, BACKEND_HOST } from '../services/backend-api';
import type { AnalysisTier, BackendAnalysisResult, BackendDetectResult } from '../services/backend-api';

// Phase 0.5：快取最近一次分析用的原始影像（base64），讓「匯出 PDF」可以直接拿同一張
// 影像重新以 quality（8B）分析一次，而不是重新截圖（重新截圖會抓到頁面「現在」的畫面，
// 不是使用者當初分析的那個畫面，會是正確性 bug）。
//
// 重要：不能用一般的模組層級變數存 —— Manifest V3 的 service worker 在閒置
// （實測約 30 秒無活動）後會被 Chrome 直接終止，下次事件觸發時是「重新啟動」的
// service worker，所有模組層級變數都會被重置成初始值。使用者通常會先看一下分析
// 結果再點「匯出 PDF」，這段等待時間很容易超過 30 秒，導致變數被清空、quality
// 重新分析在背景悄悄失敗（走 fallback，PDF 用的還是舊的 fast 結果，不會有任何
// 前景錯誤訊息）。改用 chrome.storage.session：純記憶體、不寫入磁碟，但會在
// service worker 重啟後仍然存在（直到瀏覽器整個關閉），可以撐過這個生命週期問題。
const SESSION_KEY_LAST_IMAGE = 'lastAnalyzedImageBase64';

async function setLastAnalyzedImage(base64Image: string): Promise<void> {
  await chrome.storage.session.set({ [SESSION_KEY_LAST_IMAGE]: base64Image });
}

async function getLastAnalyzedImage(): Promise<string | null> {
  const stored = await chrome.storage.session.get(SESSION_KEY_LAST_IMAGE);
  return (stored[SESSION_KEY_LAST_IMAGE] as string | undefined) ?? null;
}

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ANALYZE_IMAGE_REQUEST') {
    // Phase 2：把來源分頁 id 一起傳進去，才能在背景把 VLM 敘述算完後
    // 用 chrome.tabs.sendMessage 主動推播回同一個分頁（不能重複呼叫 sendResponse）。
    handleAnalysis(message.data, sendResponse, sender.tab?.id);
    return true; // Keep channel open for async response
  }

  if (message.type === 'CHECK_BACKEND_HEALTH') {
    checkBackendHealth(sendResponse);
    return true; // Keep channel open for async response
  }

  if (message.type === 'EXPORT_PDF_REQUEST') {
    handlePDFExport(message.data, sendResponse);
    return true; // Keep channel open for async response
  }

  if (message.type === 'REANALYZE_QUALITY_REQUEST') {
    handleQualityReanalysis(sendResponse);
    return true; // Keep channel open for async response
  }

  if (message.type === 'FETCH_IMAGE_PROXY') {
    handleFetchImageProxy(message.url, sendResponse);
    return true;
  }

  if (message.type === 'OPEN_WEBCAM') {
    chrome.tabs.create({ url: 'webcam.html' });
  }
});

async function handleFetchImageProxy(url: string, sendResponse: (response: any) => void) {
  try {
    console.log("Background: Fetching image proxy for:", url);
    const response = await fetch(`${BACKEND_HOST}/api/fetch-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    if (!response.ok) throw new Error(`Proxy failed with status ${response.status}`);
    const data = await response.json();
    sendResponse(data);
  } catch (error: any) {
    console.error("Background: Fetch image proxy failed", error);
    sendResponse({ success: false, error: error.message });
  }
}

// Phase 2：把後端回應轉成 Sidebar/webcam 用的前端格式，handleAnalysis 的
// 快／慢兩階段跟 handleQualityReanalysis 共用同一個轉換邏輯。
// narrativePending=true 代表這是「YOLO 秒回、VLM 還沒跑完」的中間狀態——
// Sidebar 會用這個欄位決定敘述區塊要顯示「AI 分析中」還是實際內容。
function toFrontendResult(
  backendResult: BackendAnalysisResult | (BackendDetectResult & { ai_analysis?: undefined }),
  narrativePending: boolean
) {
  const aiAnalysis = 'ai_analysis' in backendResult ? backendResult.ai_analysis : undefined;
  // Phase 3：risk_level/hazards 現在是規則引擎算出來的，不再只存在於 ai_analysis
  // 底下——/api/detect（秒回階段）也會直接附上，因為 PPE 類別本來就不用等 VLM
  // 校核。有 ai_analysis 就用那份（校核後的最終版本），沒有就退回頂層欄位
  // （DetectResult 秒回版本），兩邊欄位形狀刻意對齊，讀法可以共用。
  const detectResult = backendResult as BackendDetectResult;
  const hazards = aiAnalysis?.hazards ?? detectResult.hazards ?? [];
  const riskLevel = aiAnalysis?.risk_level ?? detectResult.risk_level ?? 'low';
  const riskScore = aiAnalysis?.risk_score ?? detectResult.risk_score ?? 0;
  const riskPercentage = aiAnalysis?.risk_percentage ?? detectResult.risk_percentage ?? 0;
  return {
    scene_description: aiAnalysis?.scene_description ?? '',
    hazards,
    risk_level: riskLevel,
    risk_score: riskScore,
    risk_percentage: riskPercentage,
    recommendations: aiAnalysis?.recommendations ?? [],
    yolo_detections: backendResult.yolo_annotated_image
      ? {
        annotatedImageDataURL: `data:image/jpeg;base64,${backendResult.yolo_annotated_image}`,
        detections: (backendResult.yolo_detections || []).map(d => ({
          bbox: d.bbox,
          class: d.class_name,
          confidence: d.confidence,
          color: d.color
        }))
      }
      : undefined,
    narrativePending,
  };
}

// 把各種失敗原因轉成使用者看得懂的訊息，handleAnalysis／handleQualityReanalysis 共用。
function friendlyBackendError(error: any): string {
  let msg = error?.message || String(error);
  if (msg.includes("Failed to fetch") || msg.includes("無法連接")) {
    msg = "Backend 服務連線失敗，請確認 FastAPI 正在運行\n\n" +
      "啟動方式（二選一）：\n" +
      "1. 雙擊執行：backend/start-backend-persistent.bat\n" +
      "2. 命令列執行：cd backend && python app.py\n\n" +
      "等待 3-5 秒後重新嘗試分析。";
  }
  return msg;
}

async function handleAnalysis(
  data: { rect?: { x: number, y: number, w: number, h: number, pixelRatio: number }, directImageData?: string, prompt?: string, tier?: AnalysisTier },
  sendResponse: (response: any) => void,
  tabId?: number
) {
  let base64Image = "";
  try {

    // 檢查是否為直接傳送的圖片資料（方案 2：直接讀取 <img>）
    if (data.directImageData) {
      console.log("Background: Using direct image data (no screenshot, no sidebar occlusion)");

      // 移除 data:image 前綴
      base64Image = data.directImageData;
      if (base64Image.startsWith("data:")) {
        const comma = base64Image.indexOf(",");
        if (comma !== -1) {
          base64Image = base64Image.substring(comma + 1);
        }
      }
    } else {
      // 方案 1：使用截圖方式（側邊欄已在 content script 中暫時隱藏）
      console.log("Background: Starting analysis with screenshot strategy...");

      // 1. Capture visible tab
      const screenshotDataUrl = await new Promise<string>((resolve, reject) => {
        chrome.tabs.captureVisibleTab({ format: "png" }, (dataUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error("Screenshot failed: " + chrome.runtime.lastError.message));
          } else {
            resolve(dataUrl);
          }
        });
      });

      // 2. Crop if rect provided
      if (data.rect) {
        console.log("Background: Cropping image...", data.rect);
        const response = await fetch(screenshotDataUrl);
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);

        const { x, y, w, h, pixelRatio } = data.rect;

        const sx = x * pixelRatio;
        const sy = y * pixelRatio;
        const sw = w * pixelRatio;
        const sh = h * pixelRatio;

        const canvas = new OffscreenCanvas(sw, sh);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Failed to get canvas context");

        ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);

        const croppedBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.95 });
        const buffer = await croppedBlob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        base64Image = btoa(binary);
      } else {
        base64Image = screenshotDataUrl.split(',')[1];
      }
    }

    // Validate base64Image
    if (!base64Image || base64Image.length === 0) {
      throw new Error("Failed to extract base64 image data");
    }

    console.log(`Background: Base64 image ready (${base64Image.length} chars)`);

    // Phase 0.5：記住這次分析用的原始影像，供「匯出 PDF」時的 quality 重新分析使用
    await setLastAnalyzedImage(base64Image);
  } catch (error: any) {
    console.error("Background: Image extraction failed", error);
    sendResponse({ success: false, error: friendlyBackendError(error) });
    return;
  }

  // Phase 2（第一階段，快）：只跑 YOLO，秒回未經 AI 校核的偵測框，
  // 讓 Sidebar 立刻有東西可以看，不用整個等 VLM 跑完。
  try {
    console.log("Background: Requesting fast YOLO-only detection...");
    const detectResult = await detectWithBackend(base64Image);
    sendResponse({ success: true, data: toFrontendResult(detectResult, /* narrativePending */ true) });
  } catch (error: any) {
    console.error("Background: Fast detection failed", error);
    sendResponse({ success: false, error: friendlyBackendError(error) });
    return; // 連秒回的 YOLO 都失敗了，不用再嘗試後面的完整分析
  }

  // Phase 2（第二階段，慢）：在背景繼續跑完整分析（VLM 校核＋敘述）。
  // 這時 sendResponse 已經呼叫過一次，不能再呼叫第二次——改用
  // chrome.tabs.sendMessage 主動推播給同一個分頁，由 content script 監聽並更新畫面。
  try {
    console.log("Background: Running full (narrative) analysis in background...");
    const backendResult = await analyzeWithBackend(base64Image, data.tier ?? 'fast');
    console.log("Background: Narrative analysis complete");
    if (tabId != null) {
      chrome.tabs.sendMessage(tabId, {
        type: 'ANALYSIS_NARRATIVE_READY',
        data: toFrontendResult(backendResult, /* narrativePending */ false)
      }).catch(() => {
        // 分頁可能已經關閉或導航離開，忽略即可——使用者反正也看不到了
      });
    }
  } catch (error: any) {
    console.error("Background: Narrative analysis failed", error);
    if (tabId != null) {
      chrome.tabs.sendMessage(tabId, {
        type: 'ANALYSIS_NARRATIVE_ERROR',
        error: friendlyBackendError(error)
      }).catch(() => {});
    }
  }
}

// Phase 0.5：匯出 PDF 前，用同一張影像重新以 quality（8B）分析一次。
// 刻意重用 lastAnalyzedImageBase64，而不是重新截圖 —— 重新截圖抓到的會是「現在」的頁面畫面，
// 跟使用者當初按下分析、看到結果的那個畫面可能已經不一樣了。
async function handleQualityReanalysis(sendResponse: (response: any) => void) {
  const lastAnalyzedImageBase64 = await getLastAnalyzedImage();
  if (!lastAnalyzedImageBase64) {
    sendResponse({ success: false, error: '找不到原始影像，請重新分析一次' });
    return;
  }
  try {
    console.log("Background: Re-analyzing with quality (8B) model for PDF export...");
    const backendResult = await analyzeWithBackend(lastAnalyzedImageBase64, 'quality');
    console.log("Background: Quality re-analysis complete");
    sendResponse({ success: true, data: toFrontendResult(backendResult, /* narrativePending */ false) });
  } catch (error: any) {
    console.error("Background: Quality re-analysis failed", error);
    sendResponse({ success: false, error: friendlyBackendError(error) });
  }
}

// Check backend health status
async function checkBackendHealth(sendResponse: (response: any) => void) {
  try {
    console.log("Background: Checking backend health...");

    const response = await fetch(`${BACKEND_HOST}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    });

    if (response.ok) {
      const data = await response.json();
      console.log("Background: Backend is healthy", data);
      sendResponse({ healthy: true, data });
    } else {
      console.warn("Background: Backend health check failed with status", response.status);
      sendResponse({ healthy: false });
    }
  } catch (error: any) {
    console.warn("Background: Backend health check failed", error);
    sendResponse({ healthy: false, error: error.message });
  }
}

// Handle PDF export request
async function handlePDFExport(pdfRequest: any, sendResponse: (response: any) => void) {
  try {
    console.log("Background: Exporting PDF...");

    const response = await fetch(`${BACKEND_HOST}/api/export-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pdfRequest)
    });

    if (!response.ok) {
      throw new Error(`PDF export failed with status ${response.status}`);
    }

    // Convert response to blob
    const blob = await response.blob();

    // Convert blob to base64 for sending back to content script
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64data = btoa(binary);

    const filename = response.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1]
      || `工地安全報告_${new Date().toISOString().slice(0, 10)}.pdf`;

    console.log("Background: PDF export successful");
    sendResponse({
      success: true,
      pdfData: base64data,
      filename: filename
    });
  } catch (error: any) {
    console.error("Background: PDF export failed", error);
    sendResponse({
      success: false,
      error: error.message || 'PDF export failed'
    });
  }
}

console.log("Construction Safety Background Service Started v3-port8877");
