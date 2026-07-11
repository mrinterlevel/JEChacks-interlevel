"use client";

import { useState } from "react";
import TopBar from "@/components/TopBar";
import Sidebar from "@/components/Sidebar";
import MapPlaceholder from "@/components/MapPlaceholder";

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <main className="relative w-full h-screen overflow-hidden">
      <MapPlaceholder />
      <TopBar searchQuery={searchQuery} onSearchChange={setSearchQuery} />
      <Sidebar searchQuery={searchQuery} />
    </main>
  );
}
