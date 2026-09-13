import React from 'react';
import { Search } from 'lucide-react';

interface OverlayProps {
  onAnalyze: () => void;
  visible: boolean;
  position: { top: number; left: number };
}

export function Overlay({ onAnalyze, visible, position }: OverlayProps) {
  if (!visible) return null;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onAnalyze();
      }}
      className="absolute z-[99998] flex items-center gap-2 bg-slate-900/90 text-white px-4 py-2 rounded-full shadow-lg backdrop-blur-sm border border-blue-500/30 hover:bg-blue-600 transition-all transform hover:scale-105 cursor-pointer group"
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      <Search className="w-4 h-4 text-blue-400 group-hover:text-white" />
      <span className="text-sm font-semibold">Analyze Safety</span>
    </button>
  );
}
