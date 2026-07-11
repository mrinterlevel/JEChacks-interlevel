"use client";

import React, { useState } from 'react';
import { Search, Map as MapIcon, Filter, Calendar, CheckCircle2 } from 'lucide-react';

export default function TopBar() {
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex gap-4">
      {/* Brand logo placeholder */}
      <div className="flex items-center gap-2 bg-brand-panel text-white px-4 py-2 rounded-full shadow-lg border border-brand-border">
        <MapIcon className="w-5 h-5 text-brand-text-muted" />
        <span className="font-semibold text-sm tracking-widest text-brand-text">CRIMEMAP</span>
      </div>

      {/* Search Bar */}
      <div className="flex items-center bg-brand-panel text-white rounded-full shadow-lg border border-brand-border overflow-hidden">
        <div className="px-3 text-brand-text-muted">
          <Search className="w-4 h-4" />
        </div>
        <input 
          type="text" 
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
