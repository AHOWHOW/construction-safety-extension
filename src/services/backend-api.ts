/**
 * Backend API Service
 * 與本機 FastAPI 後端通訊，處理 YOLO + Ollama 分析
 */

// Phase 3：hazards 現在分兩種來源——source === 'rule' 是規則引擎依偵測到的違規
// 直接算出來的（附帶 N-code／法規依據／偵測危害機率×嚴重度換算的風險值），
// source === 'narrative' 是 VLM 補充的畫面整體判讀，純敘述性質，故意不影響
// risk_level，其餘欄位大多是 null。跟 backend/app.py 的 hazard dict 形狀對齊。
export interface BackendHazard {
  description: string;
  severity: 'high' | 'medium' | 'low';
  n_code?: string | null;
  hazard_name?: string | null;
  regulation?: string | null;
  detected_probability?: number | null;  // L：偵測危害機率 1~5
  severity_score?: number | null;         // C：嚴重度 1~5
  risk_score?: number | null;             // L×C，1~25
  risk_percentage?: number | null;        // 0~100
  informational?: boolean;
  source?: 'rule' | 'narrative';
}

export interface BackendAnalysisResult {
  yolo_detections: Array<{
    bbox: number[];
    class_name: string;
    confidence: number;
    color: string;
  }> | null;
  yolo_annotated_image: string | null; // Base64
  ai_analysis: {
    scene_description: string;
    hazards: BackendHazard[];
    risk_level: 'high' | 'medium' | 'low';
    // Phase 3 新增：risk_level 現在是規則引擎算出來的，這兩個欄位是實際依據。
    risk_score: number;       // 1~25（0 代表沒有命中任何規則）
    risk_percentage: number;  // 0~100
    recommendations: string[];
  };
}

// Phase 2 新增：/api/detect 的回應形狀——只有 YOLO 原始（未經 VLM 校核）偵測結果，
// 沒有 ai_analysis。用於秒回讓 Sidebar 立刻顯示框。
// Phase 3 擴充：risk_level 是純規則引擎算出來的，不需要等 VLM，秒回階段
// 就直接附上 hazards/risk_level/risk_score/risk_percentage。
export interface BackendDetectResult {
  yolo_detections: Array<{
    bbox: number[];
    class_name: string;
    confidence: number;
    color: string;
  }> | null;
  yolo_annotated_image: string | null; // Base64（未校核標籤畫的框）
  hazards: BackendHazard[];
  risk_level: 'high' | 'medium' | 'low';
  risk_score: number;
  risk_percentage: number;
}

// Backend API 配置
// Phase 0 修正：8000 這個 port 曾被電腦上另一支服務（"edse"/"workbench"）佔用，
// 診斷時 /health 打到的完全是別的服務的回應。換一個不容易撞的 port，並匯出這個常數，
// 讓 background script 也從這裡引用，不要各自硬寫一份（會漂移，先前 MODEL_NAME 就漂移過一次）。
export const BACKEND_HOST = 'http://localhost:8877';
const ANALYZE_ENDPOINT = `${BACKEND_HOST}/api/analyze`;
const DETECT_ENDPOINT = `${BACKEND_HOST}/api/detect`;
const HEALTH_ENDPOINT = `${BACKEND_HOST}/health`;

// Ollama 模型名稱（顯示用，實際呼叫由後端執行，對照 backend/app.py 的 OLLAMA_MODELS）
// Phase 0 修正：qwen3.5 是文字模型命名，不是視覺語言模型。
// Phase 0.5：分成 fast（網頁分析／webcam）與 quality（匯出 PDF 時重新分析）兩層。
export const MODEL_NAME_FAST = 'qwen3-vl:4b';
export const MODEL_NAME_QUALITY = 'qwen3-vl:8b';
/** @deprecated 請改用 MODEL_NAME_FAST / MODEL_NAME_QUALITY；保留是避免舊程式碼直接壞掉 */
export const MODEL_NAME = MODEL_NAME_FAST;

export type AnalysisTier = 'fast' | 'quality';

/**
 * 檢查 Backend 服務是否運行
 */
export async function checkBackendConnection(): Promise<boolean> {
  try {
    const response = await fetch(BACKEND_HOST, {
      method: 'GET',
      cache: 'no-store', // 禁用快取
      signal: AbortSignal.timeout(3000), // 3 秒超時
    });
    return response.ok;
  } catch (error) {
    console.error('Backend connection failed:', error);
    return false;
  }
}

/**
 * 將影像元素轉換為 Blob
 */
async function imageElementToBlob(
  imageElement: HTMLImageElement | HTMLVideoElement
): Promise<Blob> {
  const canvas = document.createElement('canvas');

  if (imageElement instanceof HTMLVideoElement) {
    canvas.width = imageElement.videoWidth;
    canvas.height = imageElement.videoHeight;
  } else {
    canvas.width = imageElement.naturalWidth || imageElement.width;
    canvas.height = imageElement.naturalHeight || imageElement.height;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  ctx.drawImage(imageElement, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to convert canvas to blob'));
        }
      },
      'image/jpeg',
      0.9
    );
  });
}

/**
 * 將 Base64 字串轉換為 Blob
 */
function base64ToBlob(base64: string, mimeType: string = 'image/jpeg'): Blob {
  // 移除 data URL 前綴（如果有）
  const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;

  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);

  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }

  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

/**
 * 依輸入類型（HTMLImageElement / HTMLVideoElement / Base64 字串）轉成 Blob，
 * 供 /api/analyze、/api/detect 共用。
 */
async function toImageBlob(image: HTMLImageElement | HTMLVideoElement | string): Promise<Blob> {
  if (typeof image === 'string') {
    return base64ToBlob(image);
  }
  return imageElementToBlob(image);
}

/**
 * 把各種失敗原因轉成使用者看得懂的訊息，/api/analyze、/api/detect 共用。
 */
function toFriendlyError(error: unknown, timeoutMessage: string): Error {
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      return new Error(timeoutMessage);
    }
    if (error.message.includes('Failed to fetch')) {
      return new Error(
        '無法連接到後端服務，請確認 FastAPI 服務正在運行\n\n' +
        '啟動方式（二選一）：\n' +
        '1. 雙擊執行：backend/start-backend-persistent.bat\n' +
        '2. 命令列執行：cd backend && python app.py\n\n' +
        `檢查服務：${BACKEND_HOST}`
      );
    }
    return error;
  }
  return new Error(String(error));
}

/**
 * Phase 2 新增：只跑 YOLO、不等 VLM 的秒回偵測。
 * 用於 Sidebar 立即顯示偵測框，之後再呼叫 analyzeWithBackend() 取得校核後的最終版本。
 */
export async function detectWithBackend(
  image: HTMLImageElement | HTMLVideoElement | string
): Promise<BackendDetectResult> {
  console.log('⚡ Sending image to backend for fast YOLO-only detection...');

  const imageBlob = await toImageBlob(image);
  const formData = new FormData();
  formData.append('file', imageBlob, 'frame.jpg');

  try {
    const response = await fetch(DETECT_ENDPOINT, {
      method: 'POST',
      body: formData,
      cache: 'no-store',
      signal: AbortSignal.timeout(15000), // 純 YOLO，正常應該 <1 秒，給寬裕的 15 秒容錯
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backend API error (${response.status}): ${errorText}`);
    }

    const result: BackendDetectResult = await response.json();
    console.log(`✅ Fast detection complete — ${result.yolo_detections?.length || 0} objects (未經 AI 校核)`);
    return result;
  } catch (error) {
    console.error('❌ Fast detection failed:', error);
    throw toFriendlyError(error, '偵測逾時（超過 15 秒），請稍後再試');
  }
}

/**
 * 分析影像（主要函數）
 * 支援 HTMLImageElement, HTMLVideoElement 或 Base64 字串
 *
 * Phase 0.5：新增 tier 參數，決定後端要用 fast（4B，預設）還是 quality（8B，
 * 匯出 PDF 前重新分析用）。不傳就是 'fast'，維持舊呼叫方相容。
 */
export async function analyzeWithBackend(
  image: HTMLImageElement | HTMLVideoElement | string,
  tier: AnalysisTier = 'fast'
): Promise<BackendAnalysisResult> {
  console.log(`🚀 Sending image to backend for analysis... (tier=${tier})`);

  const imageBlob = await toImageBlob(image);

  // 建立 FormData
  const formData = new FormData();
  formData.append('file', imageBlob, 'frame.jpg');
  formData.append('tier', tier);

  try {
    const response = await fetch(ANALYZE_ENDPOINT, {
      method: 'POST',
      body: formData,
      cache: 'no-store', // 禁用快取
      signal: AbortSignal.timeout(60000), // 60 秒超時
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Backend API error (${response.status}): ${errorText}`
      );
    }

    const result: BackendAnalysisResult = await response.json();

    console.log('✅ Backend analysis complete');
    console.log(`- YOLO detections: ${result.yolo_detections?.length || 0} objects`);
    console.log(`- Risk level: ${result.ai_analysis.risk_level}`);

    return result;
  } catch (error) {
    console.error('❌ Backend analysis failed:', error);
    throw toFriendlyError(error, '分析超時（超過 60 秒），請稍後再試');
  }
}

/**
 * 健康檢查（後端 /health 端點，回傳 YOLO 與 Ollama 狀態）
 */
export async function healthCheck(): Promise<{
  backend_available: boolean;
  yolo_available: boolean;
  ollama_available: boolean;
}> {
  try {
    const response = await fetch(HEALTH_ENDPOINT, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return {
        backend_available: false,
        yolo_available: false,
        ollama_available: false,
      };
    }

    const data = await response.json();

    return {
      backend_available: data.status === 'healthy',
      yolo_available: data.yolo_available || false,
      ollama_available: data.ollama_available || false,
    };
  } catch (error) {
    console.error('Health check failed:', error);
    return {
      backend_available: false,
      yolo_available: false,
      ollama_available: false,
    };
  }
}
