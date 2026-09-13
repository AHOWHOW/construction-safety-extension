import React, { useState } from 'react';
import { X, AlertTriangle, CheckCircle, Info, Target, ChevronUp, ChevronDown, FileDown } from 'lucide-react';
import { cn } from '../lib/utils';

// 分析結果類型定義（兼容後端 API 返回格式）
export interface IntegratedAnalysisResult {
  yolo_detections?: {
    annotatedImageDataURL: string;
    detections: Array<{
      bbox: number[];
      class: string;
      confidence: number;
      color: string;
    }>;
  };
  scene_description: string;
  // Phase 3：hazards 現在分兩種來源——source === 'rule' 是規則引擎依偵測到的
  // 違規直接算出來的（附帶 N-code／法規依據／偵測危害機率×嚴重度換算的風險值），
  // source === 'narrative' 是 VLM 補充的畫面整體判讀（無法由固定規則涵蓋，
  // 純敘述性質，故意不影響 risk_level，欄位大多是 null）。
  hazards: Array<{
    description: string;
    severity: 'high' | 'medium' | 'low';
    n_code?: string | null;
    hazard_name?: string | null;
    regulation?: string | null;
    detected_probability?: number | null;   // L：偵測危害機率 1~5
    severity_score?: number | null;          // C：嚴重度 1~5
    risk_score?: number | null;              // L×C，1~25
    risk_percentage?: number | null;         // 0~100
    informational?: boolean;                 // true：僅供提示，不影響 risk_level（例如距離類規則）
    source?: 'rule' | 'narrative';
  }>;
  risk_level: 'high' | 'medium' | 'low';
  // Phase 3 新增：risk_level 現在是「偵測危害機率×嚴重度」算出來的風險值，
  // risk_percentage 是這個風險值換算成 0~100 的百分比，risk_score 是原始 1~25 值。
  risk_score?: number;
  risk_percentage?: number;
  recommendations: string[];
  // Phase 2：YOLO 秒回、VLM 校核+敘述還沒跑完時 background 會標記 true，
  // 敘述類欄位（scene_description/hazards/risk_level/recommendations）此時只是
  // 佔位預設值，不是真正的分析結果，Sidebar 要顯示「分析中」而不是照字面呈現。
  narrativePending?: boolean;
  // VLM 那階段失敗時的錯誤訊息；此時偵測框仍是有效的，不需要整個蓋掉。
  narrativeError?: string;
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  loading: boolean;
  result: IntegratedAnalysisResult | null;
  error?: string | null;
}

export function Sidebar({ isOpen, onClose, loading, result, error }: SidebarProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  // Phase 0.5：匯出前用 quality（8B）模型重新分析時的獨立狀態文字，
  // 讓使用者知道這次要多等幾秒，跟一般的「正在生成 PDF...」分開顯示
  const [exportStage, setExportStage] = useState<string | null>(null);

  // 檢查 Backend 是否運行（透過 Background Script 避免 CORS）
  const checkBackendHealth = async (): Promise<boolean> => {
    try {
      // 透過 Background Script 發送請求（避免 CORS 問題）
      const response = await chrome.runtime.sendMessage({
        type: 'CHECK_BACKEND_HEALTH'
      });
      return response?.healthy || false;
    } catch (error) {
      console.warn('Backend health check failed:', error);
      return false;
    }
  };

  // 匯出 PDF 功能
  const handleExportPDF = async () => {
    if (!result) return;

    setIsExportingPDF(true);

    try {
      // 1. 先檢查 Backend 是否運行
      console.log('📡 Checking backend status...');
      const backendRunning = await checkBackendHealth();

      if (!backendRunning) {
        // Backend 未運行，顯示友善提示
        const message = `🚫 Backend 服務未運行\n\n` +
          `請執行以下任一操作啟動 Backend：\n\n` +
          `方法 1（推薦）：\n` +
          `雙擊執行：backend/start-backend-hidden.vbs\n` +
          `（背景運行，無視窗）\n\n` +
          `方法 2：\n` +
          `雙擊執行：backend/start-backend-persistent.bat\n` +
          `（可看到運行狀態）\n\n` +
          `等待 3-5 秒後再試一次。`;

        alert(message);
        setIsExportingPDF(false);
        return;
      }

      console.log('✅ Backend is running');

      // 2. Phase 0.5：先嘗試用 quality（8B）模型重新分析同一張影像，取得更準確、
      // 用字更穩定的繁體中文報告。若重新分析失敗（例如影像已遺失），退回原本
      // 畫面上顯示的（fast/4B）結果，PDF 匯出本身不會因此被卡住。
      let reportSource: IntegratedAnalysisResult = result;
      setExportStage('正在以高品質模式重新分析（8B），需要多等幾秒...');
      try {
        const reanalysis = await chrome.runtime.sendMessage({
          type: 'REANALYZE_QUALITY_REQUEST'
        });
        if (reanalysis?.success && reanalysis.data) {
          reportSource = reanalysis.data as IntegratedAnalysisResult;
          console.log('✅ Quality (8B) re-analysis used for PDF report');
        } else {
          console.warn('⚠️ Quality re-analysis failed, falling back to on-screen result:', reanalysis?.error);
        }
      } catch (reanalysisError) {
        console.warn('⚠️ Quality re-analysis threw, falling back to on-screen result:', reanalysisError);
      } finally {
        setExportStage(null);
      }

      // 3. 準備 PDF 請求資料
      const pdfRequest = {
        yolo_image_base64: reportSource.yolo_detections?.annotatedImageDataURL?.split(',')[1] || '',
        risk_level: reportSource.risk_level,
        // Phase 3 新增：偵測危害機率×嚴重度換算的百分比，PDF 會一併顯示
        risk_percentage: reportSource.risk_percentage,
        scene_description: reportSource.scene_description,
        hazards: (reportSource.hazards || []).map(h => ({
          description: h.description,
          severity: h.severity,
          n_code: h.n_code,
          risk_percentage: h.risk_percentage,
          source: h.source,
        })),
        recommendations: reportSource.recommendations || [],
        detection_count: reportSource.yolo_detections?.detections?.length || 0
      };

      console.log('📄 Requesting PDF generation...');

      // 透過 Background Script 發送請求（避免 CORS 問題）
      const response = await chrome.runtime.sendMessage({
        type: 'EXPORT_PDF_REQUEST',
        data: pdfRequest
      });

      if (!response?.success) {
        throw new Error(response?.error || 'PDF generation failed');
      }

      // 從 base64 建立 blob
      const byteCharacters = atob(response.pdfData);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });

      // 建立下載連結
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = response.filename;
      document.body.appendChild(a);
      a.click();

      // 清理
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      console.log(`✅ PDF downloaded: ${response.filename}`);
    } catch (error: any) {
      console.error('❌ PDF export failed:', error);
      alert(`PDF 匯出失敗: ${error.message}`);
    } finally {
      setIsExportingPDF(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={cn(
      "fixed top-0 right-0 h-full bg-slate-900 border-l border-slate-700 shadow-2xl z-[99999] text-slate-100 font-sans overflow-y-auto transform transition-all duration-300",
      isExpanded ? "w-[400px] p-6" : "w-[80px] p-3"
    )}>
      {/* Header - 不同佈局根據展開狀態 */}
      {isExpanded ? (
        // 展開狀態：水平排列
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400">
            Safety Analysis
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full" title="關閉側邊欄">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
      ) : (
        // 收起狀態：垂直排列，居中對齊
        <div className="flex flex-col items-center mb-4">
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full mb-2" title="關閉側邊欄">
            <X className="w-4 h-4 text-slate-400" />
          </button>
          <div className="flex flex-col items-center gap-1">
            {['安', '全', '分', '析'].map((char, i) => (
              <span key={i} className="text-sm font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400">
                {char}
              </span>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-slate-400">Analyzing image...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-500/50 p-4 rounded-xl text-red-200 mb-4">
          <div className="flex items-center gap-2 mb-2 font-semibold">
            <AlertTriangle className="w-5 h-5" />
            Analysis Failed
          </div>
          <p className="text-sm opacity-80">{error}</p>
        </div>
      )}

      {result && !loading && (
        <div className={cn("space-y-4", !isExpanded && "space-y-3")}>
          {/* 收起狀態：只顯示風險指示器和展開按鈕 */}
          {!isExpanded && (
            <div className="flex flex-col items-center gap-4">
              {/* 風險指示器（垂直版本）——Phase 2：VLM 還沒跑完時 risk_level 只是佔位值，改顯示「分析中」 */}
              {result.narrativePending ? (
                <div className="p-3 rounded-xl border w-full flex flex-col items-center gap-2 bg-slate-800/50 border-slate-700">
                  <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  <div className="flex flex-col items-center gap-0.5">
                    {['分', '析', '中'].map((char, i) => (
                      <span key={i} className="text-xs font-bold text-slate-400">{char}</span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className={cn("p-3 rounded-xl border w-full flex flex-col items-center gap-2",
                  result.risk_level === 'high' ? "bg-red-500/10 border-red-500/50" :
                  result.risk_level === 'medium' ? "bg-orange-500/10 border-orange-500/50" :
                  "bg-green-500/10 border-green-500/50"
                )}>
                  {result.risk_level === 'high' ? <AlertTriangle className="w-8 h-8 text-red-500" /> :
                   result.risk_level === 'medium' ? <Info className="w-8 h-8 text-orange-500" /> :
                   <CheckCircle className="w-8 h-8 text-green-500" />
                  }
                  <div className="flex flex-col items-center gap-0.5">
                    {(result.risk_level === 'high' ? ['高', '風', '險'] :
                      result.risk_level === 'medium' ? ['中', '風', '險'] :
                      ['低', '風', '險']).map((char, i) => (
                      <span key={i} className={cn("text-xs font-bold",
                        result.risk_level === 'high' ? "text-red-400" :
                        result.risk_level === 'medium' ? "text-orange-400" :
                        "text-green-400"
                      )}>
                        {char}
                      </span>
                    ))}
                  </div>
                  {typeof result.risk_percentage === 'number' && (
                    <span className={cn("text-[10px] font-semibold",
                      result.risk_level === 'high' ? "text-red-400" :
                      result.risk_level === 'medium' ? "text-orange-400" :
                      "text-green-400"
                    )}>
                      {result.risk_percentage}%
                    </span>
                  )}
                </div>
              )}

              {/* 展開按鈕 */}
              <button
                onClick={() => setIsExpanded(true)}
                className="w-full p-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex flex-col items-center gap-2"
                title="展開詳細說明"
              >
                <ChevronDown className="w-6 h-6 text-white" />
                <div className="flex flex-col items-center gap-0.5">
                  {['展', '開'].map((char, i) => (
                    <span key={i} className="text-xs text-white font-medium">
                      {char}
                    </span>
                  ))}
                </div>
              </button>
            </div>
          )}

          {/* 展開狀態：完整內容 */}
          {isExpanded && (
            <>
              {/* Annotated Image */}
              {result.yolo_detections && (
                <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                  <div className="flex items-center gap-2 mb-3">
                    <Target className="w-5 h-5 text-blue-400" />
                    <h3 className="font-semibold text-slate-300">YOLO 物體偵測</h3>
                  </div>
                  <img
                    src={result.yolo_detections.annotatedImageDataURL}
                    alt="Annotated Detection"
                    className="w-full rounded-lg border border-slate-600"
                  />
                  <div className="mt-3 text-xs text-slate-400">
                    偵測到 {result.yolo_detections.detections.length} 個物體
                  </div>
                </div>
              )}

              {/* Phase 2：VLM 校核＋敘述還沒跑完——只顯示上面秒回的 YOLO 框，
                  敘述類區塊（風險等級／場景描述／隱患／建議）先用單一提示取代，
                  避免把 scene_description/hazards/risk_level 的佔位預設值當成真的結果顯示出來 */}
              {result.narrativePending ? (
                <div className="p-4 rounded-xl border border-slate-700 bg-slate-800/50 flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-200">AI 詳細分析中...</p>
                    <p className="text-xs text-slate-500 mt-0.5">正在校核偵測結果並產生風險評估與建議，通常需要數秒到二十幾秒</p>
                  </div>
                </div>
              ) : (
                <>
                  {result.narrativeError && (
                    <div className="p-3 rounded-lg border border-orange-500/40 bg-orange-500/10 text-orange-200 text-xs">
                      ⚠️ AI 詳細分析失敗，以下風險等級／建議可能不完整：{result.narrativeError}
                    </div>
                  )}

                  {/* Risk Level with Toggle Button */}
                  <div className={cn("p-4 rounded-xl border relative overflow-hidden",
                    result.risk_level === 'high' ? "bg-red-500/10 border-red-500/50" :
                    result.risk_level === 'medium' ? "bg-orange-500/10 border-orange-500/50" :
                    "bg-green-500/10 border-green-500/50"
                  )}>
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-3">
                        {result.risk_level === 'high' ? <AlertTriangle className="w-6 h-6 text-red-500" /> :
                         result.risk_level === 'medium' ? <Info className="w-6 h-6 text-orange-500" /> :
                         <CheckCircle className="w-6 h-6 text-green-500" />
                        }
                        <div className="flex flex-col">
                          <span className={cn("text-lg font-bold uppercase",
                              result.risk_level === 'high' ? "text-red-400" :
                              result.risk_level === 'medium' ? "text-orange-400" :
                              "text-green-400"
                          )}>
                              {result.risk_level} RISK
                          </span>
                          {typeof result.risk_percentage === 'number' && (
                            <span className="text-[11px] text-slate-400">
                              偵測危害指數 {result.risk_percentage}%
                              {typeof result.risk_score === 'number' && ` (${result.risk_score}/25)`}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 收起按鈕 */}
                      <button
                        onClick={() => setIsExpanded(false)}
                        className="p-2 hover:bg-slate-800/50 rounded-full transition-colors"
                        title="收起詳細說明"
                      >
                        <ChevronUp className="w-5 h-5 text-slate-400" />
                      </button>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                    <h3 className="font-semibold mb-2 text-slate-300">Scene Description</h3>
                    <p className="text-sm text-slate-200 leading-relaxed">{result.scene_description}</p>
                  </div>

                  {/* Hazards */}
                  <div>
                    <h3 className="font-semibold mb-3 text-slate-300">Identified Hazards</h3>
                    <div className="space-y-2">
                        {result.hazards?.map((h, i) => (
                            <div key={i} className="flex gap-3 p-3 bg-slate-800/30 rounded-lg border border-slate-700/50">
                                <div className={cn("w-2 h-2 mt-2 rounded-full flex-shrink-0",
                                     h.severity === 'high' ? "bg-red-500" :
                                     h.severity === 'medium' ? "bg-orange-500" : "bg-blue-500"
                                )} />
                                <div>
                                    <p className="text-sm font-medium text-slate-200">{h.description}</p>
                                    {/* Phase 3：規則引擎算出來的隱患附帶 N-code／風險值，用來稽核判斷依據；
                                        VLM 補充的敘述類隱患沒有這些欄位，改標「AI 補充」區分來源 */}
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
                                      <span className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">{h.severity}</span>
                                      {h.n_code && (
                                        <span className="text-[10px] text-slate-500">{h.n_code}</span>
                                      )}
                                      {typeof h.risk_percentage === 'number' && (
                                        <span className="text-[10px] text-slate-500">偵測危害指數 {h.risk_percentage}%</span>
                                      )}
                                      {h.informational && (
                                        <span className="text-[10px] text-slate-500 italic">僅供提示，不影響風險等級</span>
                                      )}
                                      {h.source === 'narrative' && (
                                        <span className="text-[10px] text-blue-400/70 italic">AI 補充</span>
                                      )}
                                    </div>
                                    {h.regulation && (
                                      <p className="text-[10px] text-slate-600 mt-0.5">{h.regulation}</p>
                                    )}
                                </div>
                            </div>
                        ))}
                        {(!result.hazards || result.hazards.length === 0) && (
                            <p className="text-sm text-slate-500 italic">No significant hazards detected.</p>
                        )}
                    </div>
                  </div>

                   {/* Recommendations */}
                   {result.recommendations && result.recommendations.length > 0 && (
                      <div className="bg-gradient-to-br from-blue-900/20 to-indigo-900/20 p-5 rounded-xl border border-blue-500/40 shadow-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <h3 className="font-bold text-blue-300 text-base">改善建議</h3>
                        </div>
                        <div className="space-y-3">
                            {result.recommendations.map((r, i) => (
                              <div key={i} className="flex gap-3 bg-slate-800/40 p-3 rounded-lg border-l-4 border-blue-500">
                                <span className="text-blue-400 font-bold text-sm mt-0.5">{i + 1}.</span>
                                <p className="text-sm text-slate-200 leading-relaxed flex-1">{r}</p>
                              </div>
                            ))}
                        </div>
                      </div>
                   )}
                </>
              )}

              {/* 匯出 PDF 按鈕——VLM 校核還沒跑完前先停用，避免匯出的報告用到佔位敘述 */}
              <button
                onClick={handleExportPDF}
                disabled={isExportingPDF || result.narrativePending}
                title={result.narrativePending ? '請等待 AI 詳細分析完成後再匯出' : undefined}
                className={cn(
                  "w-full p-4 rounded-xl border border-blue-600 bg-blue-600/10 hover:bg-blue-600/20 transition-colors flex items-center justify-center gap-3",
                  (isExportingPDF || result.narrativePending) && "opacity-50 cursor-not-allowed"
                )}
              >
                <FileDown className="w-5 h-5 text-blue-400" />
                <span className="font-semibold text-blue-300">
                  {isExportingPDF ? (exportStage || '正在生成 PDF...') : '匯出 PDF 報告'}
                </span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
