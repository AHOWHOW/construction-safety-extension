import { useEffect, useState } from 'react';
import { Camera, Image as ImageIcon, ShieldCheck } from 'lucide-react';
import { cn } from '../lib/utils';
import { healthCheck, MODEL_NAME_FAST, MODEL_NAME_QUALITY } from '../services/backend-api';

interface BackendStatus {
  backend: boolean;
  yolo: boolean;
  ollama: boolean;
}

export default function App() {
  const [status, setStatus] = useState<BackendStatus>({
    backend: false,
    yolo: false,
    ollama: false,
  });

  useEffect(() => {
    healthCheck().then((h) =>
      setStatus({
        backend: h.backend_available,
        yolo: h.yolo_available,
        ollama: h.ollama_available,
      })
    );
  }, []);

  const ready = status.backend && status.yolo;

  const openWebCam = () => {
    chrome.tabs.create({ url: 'webcam.html' });
  };

  return (
    <div className="w-[400px] h-[600px] bg-slate-950 text-slate-50 font-sans p-6 flex flex-col relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-[150px] h-[150px] bg-blue-500/20 rounded-full blur-[80px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[150px] h-[150px] bg-orange-500/20 rounded-full blur-[80px]" />

      <header className="flex justify-between items-center mb-8 relative z-10">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-500/10 rounded-lg">
            <ShieldCheck className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-400">
              SafeSite AI
            </h1>
            <p className="text-xs text-slate-400">Construction Monitor</p>
          </div>
        </div>
      </header>

      <div className="bg-slate-900/50 backdrop-blur-md border border-slate-800 rounded-xl p-4 mb-6 relative z-10 space-y-2">
        <StatusRow label="Backend (FastAPI)" online={status.backend} />
        <StatusRow label="YOLO11 Model" online={status.yolo} />
        <StatusRow label="Ollama (Qwen3-VL)" online={status.ollama} />
        <div className="text-xs text-slate-500 pt-2 border-t border-slate-800 space-y-0.5">
          <div>{MODEL_NAME_FAST}（快，網頁／即時分析用）</div>
          <div>{MODEL_NAME_QUALITY}（準，匯出 PDF 時使用）</div>
        </div>
      </div>

      <div className="flex-1 space-y-3 relative z-10">
        <button
          onClick={() =>
            alert('提示：將滑鼠移到任一網頁圖片上，點擊出現的「Analyze Safety」按鈕即可分析。')
          }
          disabled={!ready}
          className="w-full group relative overflow-hidden p-4 rounded-xl border border-slate-700 bg-slate-800/50 hover:bg-slate-800 hover:border-blue-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-left"
        >
          <div className="flex items-center gap-4 relative z-10">
            <div className="p-3 bg-blue-500/10 group-hover:bg-blue-500/20 rounded-lg transition-colors">
              <ImageIcon className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-200 group-hover:text-white">
                Analyze Page Images
              </h3>
              <p className="text-xs text-slate-400">Hover any image and click Analyze</p>
            </div>
          </div>
        </button>

        <button
          onClick={openWebCam}
          disabled={!ready}
          className="w-full group relative overflow-hidden p-4 rounded-xl border border-slate-700 bg-slate-800/50 hover:bg-slate-800 hover:border-orange-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-left"
        >
          <div className="flex items-center gap-4 relative z-10">
            <div className="p-3 bg-orange-500/10 group-hover:bg-orange-500/20 rounded-lg transition-colors">
              <Camera className="w-6 h-6 text-orange-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-200 group-hover:text-white">
                Start WebCam Monitor
              </h3>
              <p className="text-xs text-slate-400">Real-time site surveillance</p>
            </div>
          </div>
        </button>

        {!status.backend && (
          <div className="text-xs text-red-400 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            Backend 未啟動。請執行 <code>backend/start-backend-persistent.bat</code> 或{' '}
            <code>python backend/app.py</code>。
          </div>
        )}
      </div>

      <footer className="mt-auto pt-6 text-center text-xs text-slate-600 relative z-10">
        <p>Construction Safety Assistant v1.0</p>
      </footer>
    </div>
  );
}

function StatusRow({ label, online }: { label: string; online: boolean }) {
  return (
    <div className="flex justify-between items-center text-xs">
      <span className="text-slate-400">{label}</span>
      <div
        className={cn(
          'flex items-center gap-2 px-2 py-1 rounded-full font-medium border',
          online
            ? 'bg-green-500/10 text-green-400 border-green-500/20'
            : 'bg-red-500/10 text-red-400 border-red-500/20'
        )}
      >
        <div
          className={cn(
            'w-1.5 h-1.5 rounded-full',
            online ? 'bg-green-400 animate-pulse' : 'bg-red-400'
          )}
        />
        {online ? 'Online' : 'Offline'}
      </div>
    </div>
  );
}
