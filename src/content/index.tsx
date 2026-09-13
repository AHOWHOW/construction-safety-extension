import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Sidebar } from './Sidebar';
import { Overlay } from './Overlay';
import cssStyles from '../index.css?inline';

// Create a Shadow Root for our app to isolate styles
const rootHost = document.createElement('div');
rootHost.id = 'construction-safety-extension-root';
rootHost.style.position = 'absolute';
rootHost.style.top = '0';
rootHost.style.left = '0';
rootHost.style.width = '0';
rootHost.style.height = '0';
rootHost.style.zIndex = '2147483647'; // Max z-index
document.body.appendChild(rootHost);

const shadowRoot = rootHost.attachShadow({ mode: 'open' });
// Tailwind 樣式經由下方 <style>{cssStyles}</style> 注入 Shadow DOM

const rootContainer = document.createElement('div');
shadowRoot.appendChild(rootContainer);
const root = ReactDOM.createRoot(rootContainer);

function ContentApp() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarLoading, setSidebarLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const [overlayVisible, setOverlayVisible] = useState(false);
  const [overlayPos, setOverlayPos] = useState({ top: 0, left: 0 });
  const [targetImage, setTargetImage] = useState<HTMLImageElement | null>(null);
  // 滑鼠追蹤的 effect 需要讀「目前鎖定哪張圖」，但不能因此把 targetImage 放進
  // 依賴陣列（否則每換一張圖就重新註冊一次監聽器）。用 ref 讀最新值。
  const targetImageRef = useRef<HTMLImageElement | null>(null);

  // 來自 popup／background 的訊息監聽
  //
  // 2026-09-13 修正：這段原本跟滑鼠偵測合在同一個 useEffect、依賴陣列是
  // [targetImage]，但 cleanup 只移除了滑鼠監聽器、沒有移除 chrome 訊息監聽器。
  // 結果每 hover 到一張新圖片就會多註冊一個訊息監聽器，逛久了會累積數十個，
  // ANALYSIS_NARRATIVE_READY 會被重複處理。拆成獨立 effect 並補上 removeListener。
  useEffect(() => {
    const handleMessage = (msg: any, _sender: any, sendResponse: (r?: any) => void) => {
      if (msg.type === "ANALYZE_CURRENT") {
        alert("Analyzing all images feature coming soon!");
      }
      if (msg.type === "GET_IMAGE_STATS") {
        sendResponse({ count: document.getElementsByTagName('img').length });
      }
      // Phase 2：background 在秒回 YOLO 框之後，會繼續在背景跑 VLM 校核＋敘述，
      // 跑完後用這個訊息主動推播回來（不是原本那次 sendMessage 的回應，
      // 因為那個回應早就在秒回階段用掉了）。收到後直接整個換成最終版本
      // （框跟敘述都是校核後的），對應先前討論選的「直接無縫替換」呈現方式。
      if (msg.type === "ANALYSIS_NARRATIVE_READY") {
        setAnalysisResult(msg.data);
      }
      if (msg.type === "ANALYSIS_NARRATIVE_ERROR") {
        // VLM 校核失敗，但秒回的 YOLO 框還是有效的，保留畫面上已經看到的框，
        // 只是把「AI 分析中」的狀態關掉並附上錯誤訊息。
        setAnalysisResult((prev: any) =>
          prev ? { ...prev, narrativePending: false, narrativeError: msg.error } : prev
        );
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  // 圖片 hover 偵測
  //
  // 2026-09-13 修正（使用者回報 Google 相簿的照片無法啟動分析）：
  // 原本的寫法是 `if (e.target.tagName === 'IMG')`，這要求圖片本身就是滑鼠事件
  // 的目標元素。但 Google 相簿、FB、IG 這類網站會在照片「上面」疊一層透明的 div
  // 來接手勢操作（滑動換張、點擊隱藏介面、縮放），滑鼠事件打到的是那層 div，
  // e.target 永遠不會是 <img>，所以 Analyze 按鈕完全不會出現。
  // （實測 Google 相簿 hover 到的是 DIV.YW656b。）
  //
  // 改用 document.elementsFromPoint()：它回傳該座標上「由上到下堆疊的所有元素」，
  // 不管上面蓋了幾層，只要底下有 <img> 就找得到。對沒有覆蓋層的一般網頁行為完全
  // 不變（stack[0] 本來就是 <img>），只是多涵蓋了有覆蓋層的情況，屬於純擴充。
  useEffect(() => {
    let rafPending = false;
    let lastX = 0;
    let lastY = 0;

    const findImageAt = (x: number, y: number): HTMLImageElement | null => {
      const stack = document.elementsFromPoint(x, y);

      // 滑鼠移到我們自己的 Analyze 按鈕上時維持現狀，不要把 overlay 收掉，
      // 否則按鈕會在「滑鼠正要移過去」的瞬間消失、永遠點不到。按鈕在 shadow DOM
      // 裡，elementsFromPoint 不會穿透 shadow 邊界，回傳的是 shadow host（rootHost）。
      if (stack.includes(rootHost)) return targetImageRef.current;

      for (const el of stack) {
        if (el.tagName !== 'IMG') continue;
        const img = el as HTMLImageElement;
        // 太小的圖（icon、頭像、tracking pixel）不值得分析。
        // 用 getBoundingClientRect 而非 img.width——後者在某些 CSS 佈局下會回傳 0。
        const rect = img.getBoundingClientRect();
        if (rect.width > 100 && rect.height > 100) return img;
      }
      return null;
    };

    const handleMouseMove = (e: MouseEvent) => {
      lastX = e.clientX;
      lastY = e.clientY;
      // mousemove 觸發非常頻繁（每秒可達上百次），用 rAF 節流成一個影格最多算一次，
      // 避免 elementsFromPoint 這種會觸發 layout 的呼叫拖慢頁面捲動。
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        const img = findImageAt(lastX, lastY);

        if (!img) {
          setOverlayVisible(false);
          return;
        }
        // 還在同一張圖上就只確保按鈕是顯示的，不要重設 state——否則滑鼠每動一下
        // 都會觸發一次 React re-render。
        if (img === targetImageRef.current) {
          setOverlayVisible(true);
          return;
        }

        const rect = img.getBoundingClientRect();
        setOverlayPos({
          top: rect.top + window.scrollY + 10,
          left: rect.left + window.scrollX + 10
        });
        targetImageRef.current = img;
        setTargetImage(img);
        setOverlayVisible(true);
      });
    };

    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const handleAnalyze = async () => {
    if (!targetImage) return;

    setSidebarOpen(true);
    setSidebarLoading(true);
    setAnalysisError(null);
    setAnalysisResult(null);
    setOverlayVisible(false); // 隱藏 overlay 按鈕

    try {
      let imageData: string | null = null;

      // 方案 1：優先嘗試直接讀取圖片元素
      console.log("Trying direct image capture...");
      imageData = await tryDirectImageCapture(targetImage);

      // 方案 2：如果直接讀取失敗（CORS），使用後端代理下載
      if (!imageData && targetImage.src) {
        imageData = await tryBackendProxy(targetImage.src);
      }

      // 方案 3：如果代理也失敗，回退到截圖方式
      if (imageData) {
        console.log("✅ Using direct image data");
        const response = await chrome.runtime.sendMessage({
          type: 'ANALYZE_IMAGE_REQUEST',
          data: { directImageData: imageData }
        });

        if (response.success) {
          setAnalysisResult(response.data);
        } else {
          setAnalysisError(response.error);
        }
      } else {
        console.log("ℹ️ Using screenshot fallback (CORS or protected image)");
        setOverlayVisible(false);
        setAnalysisResult(null);

        // 拍截圖瞬間用 opacity:0 隱藏 extension UI（不關閉側欄 React 狀態）
        const rootEl = document.getElementById('construction-safety-extension-root');
        if (rootEl) rootEl.style.opacity = '0';
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        // 發送截圖座標
        const rect = targetImage.getBoundingClientRect();
        const data = {
          rect: {
            x: rect.left,
            y: rect.top,
            w: rect.width,
            h: rect.height,
            pixelRatio: window.devicePixelRatio
          }
        };

        const response = await chrome.runtime.sendMessage({
          type: 'ANALYZE_IMAGE_REQUEST',
          data
        });

        // 截圖完成，立刻恢復顯示
        if (rootEl) rootEl.style.opacity = '1';

        if (response && response.success) {
          setAnalysisResult(response.data);
        } else {
          setAnalysisError(response?.error || "擷取圖片失敗或後端未回應");
        }
      }
    } catch (e: any) {
      if (e?.message?.includes('Extension context invalidated')) {
        setAnalysisError("擴充功能已更新或重新載入。請「重新整理 (F5)」此網頁後再試一次！");
      } else {
        setAnalysisError(e.message || "發生未知錯誤");
      }
      setSidebarOpen(true);
    } finally {
      // 確保 opacity 回復（防止例外流程中沒有恢復）
      const rootEl = document.getElementById('construction-safety-extension-root');
      if (rootEl) rootEl.style.opacity = '1';
      setSidebarLoading(false);
    }
  };

  // 嘗試直接讀取圖片元素（可能會 CORS 錯誤）
  async function tryDirectImageCapture(img: HTMLImageElement): Promise<string | null> {
    try {
      if (!img.complete || img.naturalWidth === 0) {
        return null;
      }

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      console.log(`📐 Using ORIGINAL image dimensions: ${img.naturalWidth}x${img.naturalHeight}px`);
      console.log(`   (Displayed size: ${img.width}x${img.height}px)`);

      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // 這一步可能會因為 CORS 失敗
      ctx.drawImage(img, 0, 0);

      // toDataURL 也可能因為 CORS 拋出 SecurityError
      const base64 = canvas.toDataURL('image/jpeg', 0.9);
      console.log(`   Base64 size: ${(base64.length / 1024).toFixed(2)} KB`);
      return base64;
    } catch (error: any) {
      // 靜默處理 CORS 錯誤，不顯示在控制台
      if (error.name === 'SecurityError' || error.message?.includes('tainted')) {
        // CORS 錯誤，返回 null 讓後續使用代理
        return null;
      }
      // 其他錯誤記錄到控制台
      console.warn("Direct image capture failed:", error);
      return null;
    }
  }

  // 使用後端代理下載圖片 (透過 Background Script 繞過 CSP 限制)
  async function tryBackendProxy(imageUrl: string): Promise<string | null> {
    try {
      console.log("Requesting image via background proxy (CSP Bypass):", imageUrl);

      const response = await chrome.runtime.sendMessage({
        type: 'FETCH_IMAGE_PROXY',
        url: imageUrl
      });

      if (response && response.success && response.image_base64) {
        console.log("✅ Image fetched via background proxy");
        return response.image_base64;
      }

      console.warn("Background proxy failed or returned error");
      return null;
    } catch (error: any) {
      console.warn("Background proxy messaging error:", error);
      if (error?.message?.includes('Extension context invalidated')) {
        throw error;
      }
      return null;
    }
  }

  return (
    <>
      {/* We need to inject the Tailwind Styles into Shadow DOM manually if they don't apply */}
      {/* We need to inject the Tailwind Styles into Shadow DOM manually if they don't apply */}
      <style>{cssStyles}</style>
      <style>{`
            /* Fallback basic styles just in case */
            .fixed { position: fixed; }
            .absolute { position: absolute; }
            .bg-slate-900 { background-color: #0f172a; color: #f8fafc; }
        `}</style>
      <Overlay
        visible={overlayVisible}
        position={overlayPos}
        onAnalyze={handleAnalyze}
      />
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        loading={sidebarLoading}
        result={analysisResult}
        error={analysisError}
      />
    </>
  );
}

// Initial render
// Wait for body?
if (document.body) {
  root.render(<ContentApp />);
} else {
  window.addEventListener('blur', () => { }); // placeholder
}
