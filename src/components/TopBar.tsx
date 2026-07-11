"use client";

import { Map as MapIcon } from 'lucide-react';

import type { MapMode } from '@/lib/distress';

export default function TopBar({
  mapMode,
  onModeChange,
  activeCount = 0,
}: {
  mapMode: MapMode;
  onModeChange: (mode: MapMode) => void;
  activeCount?: number;
}) {
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex gap-4">
      {/* Brand logo placeholder */}
      <div className="flex items-center gap-2 bg-brand-panel text-white px-4 py-2 rounded-full shadow-lg border border-brand-border">
        <MapIcon className="w-5 h-5 text-brand-text-muted" />
        <span className="font-semibold text-sm tracking-widest text-brand-text">CRIMEWATCHER</span>
      </div>

      {/* Mode Toggle — Crime map is the default view, distress is opt-in */}
      <div className="flex bg-brand-panel p-1 rounded-full shadow-lg border border-brand-border">
        <button
          onClick={() => onModeChange('crime')}
          className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
            mapMode === 'crime' ? 'bg-brand-primary text-white' : 'text-brand-text-muted hover:text-white'
          }`}
        >
          Crime Map
        </button>
        <button
          onClick={() => onModeChange('distress')}
          className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
            mapMode === 'distress' ? 'bg-brand-primary text-white' : 'text-brand-text-muted hover:text-white'
          }`}
        >
          Distress Signals
          {activeCount > 0 && (
            <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
              mapMode === 'distress' ? 'bg-white text-brand-primary' : 'bg-brand-primary text-white'
            }`}>
              {activeCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
