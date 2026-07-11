"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import TopBar from "@/components/TopBar";
import Sidebar from "@/components/Sidebar";
import { useDistressSignals, type MapMode } from "@/lib/distress";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center bg-brand-bg text-sm text-brand-text-muted">
      Preparing map renderer…
    </div>
  ),
});

export default function Home() {
  const [mapMode, setMapMode] = useState<MapMode>("crime");
  const { signals: distressSignals, resolveSignal } = useDistressSignals();

  const activeCount = distressSignals.filter((signal) => signal.status === "active").length;

  return (
    <main className="relative w-full h-screen overflow-hidden">
      <MapView mapMode={mapMode} distressSignals={distressSignals} />
      <TopBar
        mapMode={mapMode}
        onModeChange={setMapMode}
        activeCount={activeCount}
      />
      <Sidebar
        mapMode={mapMode}
        distressSignals={distressSignals}
        onResolve={resolveSignal}
      />
    </main>
  );
}
