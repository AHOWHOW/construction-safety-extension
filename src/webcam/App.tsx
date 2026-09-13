import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play, AlertTriangle, Video, Camera, Target } from 'lucide-react';
import { cn } from '../lib/utils';
import { analyzeWithBackend, checkBackendConnection, type BackendAnalysisResult, type BackendHazard } from '../services/backend-api';

// 結果介面（兼容顯示）
// Phase 3：risk_level 現在是規則引擎依「偵測危害機率×嚴重度」算出來的風險值，
// hazards 也附帶 N-code／法規依據／百分比等欄位（來源見 BackendHazard），
// 跟 Sidebar.tsx 用同一套形狀，欄位定義集中在 backend-api.ts 不重複維護。
interface AnalysisResult {
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
  hazards: BackendHazard[];
  risk_level: 'high' | 'medium' | 'low';
  risk_score?: number;
  risk_percentage?: number;
  recommendations: string[];
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false); // Continuous mode
  const [lastResult, setLastResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backendAvailable, setBackendAvailable] = useState<boolean>(false);
  
  // Check Backend Connection on mount
  useEffect(() => {
    async function checkBackend() {
      const isAvailable = await checkBackendConnection();
      setBackendAvailable(isAvailable);
      if (!isAvailable) {
        setError("Backend 服務未運行，請啟動 FastAPI (python backend/app.py)");
      }
    }
    checkBackend();
  }, []);

  // Start Camera
  useEffect(() => {
    async function startCamera() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            }
        });
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }
      } catch (e) {
        setError("Camera access denied or unavailable.");
      }
    }
    startCamera();

    return () => {
       // Cleanup tracks
       stream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // Analysis Loop
  useEffect(() => {
    let interval: any;
    if (isMonitoring) {
        interval = setInterval(() => {
            if (!isAnalyzing) captureAndAnalyze();
        }, 3000); // 3 seconds interval
    }
    return () => clearInterval(interval);
  }, [isMonitoring, isAnalyzing]);

  const captureAndAnalyze = async () => {
    if (!videoRef.current) return;

    if (!backendAvailable) {
      setError("Backend 服務未運行，請啟動 FastAPI 服務");
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
        const video = videoRef.current;

        // 使用 Backend API 進行分析（YOLO + Ollama 都在後端）
        const backendResult = await analyzeWithBackend(video);

        // 轉換為顯示格式
        const result: AnalysisResult = {
          ...backendResult.ai_analysis,
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
            : undefined
        };

        setLastResult(result);

        // Alert logic for high risk
        if (result.risk_level === 'high') {
            playAlert();
        }
    } catch (e: any) {
        setError(e.message);
    } finally {
        setIsAnalyzing(false);
    }
  };

  const playAlert = () => {
      // Simple beep or speech
      const synth = window.speechSynthesis;
      const u = new SpeechSynthesisUtterance("Warning. High Risk Detected.");
      synth.speak(u);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans flex flex-col">
       {/* Hidden Canvas */}
       <canvas ref={canvasRef} className="hidden" />

       {/* Header */}
       <header className="px-6 py-4 bg-slate-900 border-b border-slate-800 flex justify-between items-center">
            <div className="flex items-center gap-3">
                <Video className="w-6 h-6 text-orange-500" />
                <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-orange-400 to-red-400">
                    Live Site Monitor
                </h1>
            </div>
            <div className="flex gap-4">
                <button 
                    onClick={() => setIsMonitoring(!isMonitoring)}
                    className={cn("flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-all",
                        isMonitoring ? "bg-red-500/20 text-red-400 animate-pulse border border-red-500/50" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                    )}
                >
                    {isMonitoring ? <Pause className="w-4 h-4"/> : <Play className="w-4 h-4"/>}
                    {isMonitoring ? "Monitoring Active" : "Start Monitoring"}
                </button>
            </div>
       </header>

       {/* Main Content */}
       <main className="flex-1 flex gap-6 p-6 overflow-hidden">
            {/* Camera Feed */}
            <div className="flex-1 rounded-2xl overflow-hidden border border-slate-700 bg-black relative">
                {error ? (
                    <div className="absolute inset-0 flex items-center justify-center text-red-500 gap-2">
                        <AlertTriangle /> {error}
                    </div>
                ) : (
                    <video 
                        ref={videoRef} 
                        autoPlay 
                        playsInline 
                        muted 
                        className="w-full h-full object-cover"
                    />
                )}
                
                {/* Overlay Status */}
                <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-xs text-white border border-white/10">
                    {isAnalyzing ? "Analyzing..." : "Ready"}
                </div>
            </div>

            {/* Analysis Panel */}
            <div className="w-[450px] bg-slate-900 rounded-2xl border border-slate-800 p-6 overflow-y-auto">
                <h2 className="text-lg font-semibold mb-4 text-slate-300">Live Analysis</h2>
                
                {!lastResult ? (
                    <div className="text-center py-20 text-slate-500">
                        <Camera className="w-12 h-12 mx-auto mb-4 opacity-20" />
                        <p>Waiting for analysis data...</p>
                        <button 
                            onClick={captureAndAnalyze}
                            className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                        >
                            Capture Single Frame
                        </button>
                    </div>
                ) : (
                    <div className="space-y-6">
                         {/* YOLO Detection Image */}
                         {lastResult.yolo_detections && (
                            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                              <div className="flex items-center gap-2 mb-3">
                                <Target className="w-5 h-5 text-blue-400" />
                                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">物體偵測</h3>
                              </div>
                              <img
                                src={lastResult.yolo_detections.annotatedImageDataURL}
                                alt="Annotated Detection"
                                className="w-full rounded-lg border border-slate-600"
                              />
                              <div className="mt-2 text-xs text-slate-500">
                                偵測到 {lastResult.yolo_detections.detections.length} 個物體
                              </div>
                            </div>
                         )}

                         {/* Risk Card */}
                         <div className={cn("p-6 rounded-xl border text-center transition-colors duration-500",
                            lastResult.risk_level === 'high' ? "bg-red-500/20 border-red-500 text-red-200" :
                            lastResult.risk_level === 'medium' ? "bg-orange-500/20 border-orange-500 text-orange-200" :
                            "bg-green-500/20 border-green-500 text-green-200"
                         )}>
                            <div className="text-3xl font-black uppercase tracking-widest mb-2">
                                {lastResult.risk_level} LEVEL
                            </div>
                            <div className="text-xs opacity-70">CURRENT RISK ASSESSMENT</div>
                            {/* Phase 3：偵測危害機率×嚴重度換算的風險值百分比，不是憑空的等級字串 */}
                            {typeof lastResult.risk_percentage === 'number' && (
                              <div className="text-sm mt-2 opacity-90">
                                偵測危害指數 {lastResult.risk_percentage}%
                                {typeof lastResult.risk_score === 'number' && ` (${lastResult.risk_score}/25)`}
                              </div>
                            )}
                         </div>

                         {/* Hazards List */}
                         <div>
                            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">Detected Hazards</h3>
                            <div className="space-y-2">
                                {lastResult.hazards.map((h, i) => (
                                    <div key={i} className="flex gap-3 p-3 bg-slate-800 rounded-lg border border-slate-700">
                                        <AlertTriangle className={cn("w-5 h-5 flex-shrink-0",
                                            h.severity === 'high' ? "text-red-500" :
                                            h.severity === 'medium' ? "text-orange-500" : "text-blue-400"
                                        )} />
                                        <div>
                                          <span className="text-sm text-slate-200">{h.description}</span>
                                          {/* Phase 3：規則引擎算出來的隱患附帶 N-code／風險值，方便稽核判斷依據；
                                              VLM 補充的敘述類隱患沒有這些欄位，標「AI 補充」區分來源 */}
                                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
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
                                {lastResult.hazards.length === 0 && (
                                    <div className="text-center text-slate-500 py-4">No hazards detected</div>
                                )}
                            </div>
                         </div>

                         {/* Scene Description */}
                         {lastResult.scene_description && (
                            <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">場景描述</h3>
                                <p className="text-sm text-slate-300 leading-relaxed">{lastResult.scene_description}</p>
                            </div>
                         )}

                         {/* Recommendations */}
                         {lastResult.recommendations && lastResult.recommendations.length > 0 && (
                            <div className="bg-gradient-to-br from-blue-900/20 to-indigo-900/20 p-4 rounded-lg border border-blue-500/40">
                                <h3 className="text-sm font-bold text-blue-300 uppercase tracking-wider mb-3">改善建議</h3>
                                <div className="space-y-2">
                                    {lastResult.recommendations.map((r, i) => (
                                        <div key={i} className="flex gap-2 text-sm text-blue-200/90 leading-relaxed">
                                            <span className="text-blue-400 font-bold">{i + 1}.</span>
                                            <span>{r}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                         )}

                         <div className="text-xs text-slate-500 border-t border-slate-800 pt-4">
                            Last Updated: {new Date().toLocaleTimeString()}
                         </div>
                    </div>
                )}
            </div>
       </main>
    </div>
  );
}
