import React from 'react';
import { Search, Map as MapIcon, Filter } from 'lucide-react';

export default function TopBar() {
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex gap-4">
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
          placeholder="Search locations..." 
          className="bg-transparent border-none outline-none py-2 pr-4 text-sm w-64 placeholder:text-brand-text-muted text-brand-text"
        />
      </div>

      {/* Filter Button */}
      <button className="flex items-center gap-2 bg-brand-panel text-white px-4 py-2 rounded-full shadow-lg border border-brand-border hover:bg-brand-card transition-colors">
        <Filter className="w-4 h-4 text-brand-text-muted" />
        <span className="text-sm font-medium text-brand-text">Filters</span>
      </button>
    </div>
  );
}
