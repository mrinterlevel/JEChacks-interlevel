import TopBar from "@/components/TopBar";
import Sidebar from "@/components/Sidebar";
import MapPlaceholder from "@/components/MapPlaceholder";

export default function Home() {
  return (
    <main className="relative w-full h-screen overflow-hidden">
      <MapPlaceholder />
      <TopBar />
      <Sidebar />
    </main>
  );
}
