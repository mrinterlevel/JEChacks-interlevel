"use client";

import React, { useState } from 'react';
import { Search, Map as MapIcon, Filter, Calendar, CheckCircle2 } from 'lucide-react';

import type { MapMode } from '@/lib/distress';

export default function TopBar({
  searchQuery,
  onSearchChange,
  mapMode,
  onModeChange,
  activeCount = 0,
}: {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  mapMode: MapMode;
  onModeChange: (mode: MapMode) => void;
  activeCount?: number;
}) {
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex gap-4">
      {/* Brand logo placeholder */}
      <div className="flex items-center gap-2 bg-brand-panel text-white px-4 py-2 rounded-full shadow-lg border border-brand-border">
        <MapIcon className="w-5 h-5 text-brand-text-muted" />
        <span className="font-semibold text-sm tracking-widest text-brand-text">CRIMEMAP</span>
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

      {/* Search Bar */}
      <div className="flex items-center bg-brand-panel text-white rounded-full shadow-lg border border-brand-border overflow-hidden">
        <div className="px-3 text-brand-text-muted">
          <Search className="w-4 h-4" />
        </div>
        <input 
          type="text" 
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search locations or IDs..." 
          className="bg-transparent border-none outline-none py-2 pr-4 text-sm w-64 placeholder:text-brand-text-muted text-brand-text"
        />
      </div>

      {/* Filter Button & Dropdown */}
      <div className="relative">
        <button 
          onClick={() => setIsFilterOpen(!isFilterOpen)}
          className={`flex items-center gap-2 px-4 py-2 rounded-full shadow-lg border transition-colors ${
            isFilterOpen 
              ? 'bg-brand-card border-brand-primary text-white' 
              : 'bg-brand-panel border-brand-border text-white hover:bg-brand-card'
          }`}
        >
          <Filter className={`w-4 h-4 ${isFilterOpen ? 'text-brand-primary' : 'text-brand-text-muted'}`} />
          <span className="text-sm font-medium text-brand-text">Filters</span>
        </button>

        {isFilterOpen && (
          <div className="absolute top-full mt-2 right-0 w-64 bg-brand-panel border border-brand-border rounded-xl shadow-2xl p-4 flex flex-col gap-4">
            <h4 className="text-sm font-semibold text-brand-text border-b border-brand-border pb-2">Filter Signals</h4>
            
            <div className="flex flex-col gap-2">
              <label className="text-xs text-brand-text-muted flex items-center gap-2">
                <Calendar className="w-3 h-3" /> Report Date
              </label>
              <input 
                type="date" 
                className="bg-brand-bg border border-brand-border rounded-md px-3 py-1.5 text-sm text-brand-text outline-none focus:border-brand-primary"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-brand-text-muted flex items-center gap-2">
                <CheckCircle2 className="w-3 h-3" /> Resolved Since
              </label>
              <input 
                type="date" 
                className="bg-brand-bg border border-brand-border rounded-md px-3 py-1.5 text-sm text-brand-text outline-none focus:border-brand-primary"
              />
            </div>

            <button className="mt-2 w-full bg-brand-primary text-white rounded-md py-2 text-sm font-medium hover:bg-rose-500 transition-colors">
              Apply Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
