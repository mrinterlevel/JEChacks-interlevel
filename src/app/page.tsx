"use client";

import { useState } from "react";
import TopBar from "@/components/TopBar";
import Sidebar from "@/components/Sidebar";
import MapPlaceholder from "@/components/MapPlaceholder";

export type MapMode = 'live' | 'heatmap';

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [mapMode, setMapMode] = useState<MapMode>('live');

  return (
    <main className="relative w-full h-screen overflow-hidden">
      <MapPlaceholder mapMode={mapMode} />
      <TopBar 
        searchQuery={searchQuery} 
        onSearchChange={setSearchQuery} 
        mapMode={mapMode}
        onModeChange={setMapMode}
      />
      <Sidebar searchQuery={searchQuery} mapMode={mapMode} />
    </main>
  );
}
