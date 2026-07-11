"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import TopBar from "@/components/TopBar";
import Sidebar from "@/components/Sidebar";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-brand-bg text-sm text-brand-text-muted">
      Preparing map renderer…
    </div>
  ),
});

export type MapMode = 'live' | 'heatmap';

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [mapMode, setMapMode] = useState<MapMode>('live');

  return (
    <main className="relative w-full h-screen overflow-hidden">
      <MapView searchQuery={searchQuery} />
      <TopBar searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      <Sidebar searchQuery={searchQuery} />
    </main>
  );
}
