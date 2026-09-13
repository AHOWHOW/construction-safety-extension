import React, { useEffect, useState } from 'react';
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

  useEffect(() => {
    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
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
    });

    // Image Hover Detection
    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'IMG') {
        const img = target as HTMLImageElement;
        // Check if image is large enough to matter
        if (img.width > 100 && img.height > 100) {
          const rect = img.getBoundingClientRect();
          // Position overlay at top-right of image, but relative to viewport
          // accounting for scroll
          setOverlayPos({
            top: rect.top + window.scrollY + 10,
            left: rect.left + window.scrollX + 10
          });
          setTargetImage(img);
          setOverlayVisible(true);
        }
      } else if (target === rootHost || rootHost.contains(target)) {
        // Don't hide if hovering our own UI
      } else {
        // Maybe hide with delay? For now simple implementation.
        // setOverlayVisible(false); 
        // Logic needs to be smarter to handle mouse out of image vs into button
      }
    };

    // Better hover handling
    let hoverTimeout: any;
    const handleMouseOut = (e: MouseEvent) => {
      const related = e.relatedTarget as HTMLElement;
      if (related && (related === rootHost || rootHost.contains(related))) return;
      if (e.target === targetImage) {
        setOverlayVisible(false);
      }
    };

    document.addEventListener('mouseover', handleMouseOver);
    // document.addEventListener('mouseout', handleMouseOut); // Simplistic

    return () => {
      document.removeEventListener('mouseover', handleMouseOver);
      // document.removeEventListener('mouseout', handleMouseOut);
    };
  }, [targetImage]);

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
