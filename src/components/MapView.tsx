"use client";

import { useEffect, useRef, useState } from "react";
import {
  Building2,
  Flame,
  Layers3,
  LocateFixed,
  MapPin,
  SlidersHorizontal,
} from "lucide-react";
import maplibregl, {
  GeoJSONSource,
  Map as MapLibreMap,
  MapLayerMouseEvent,
} from "maplibre-gl";
import type {
  FeatureCollection,
  MultiPolygon,
  Point,
} from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";

const TORONTO_CENTER: [number, number] = [-79.3832, 43.6532];
const MAP_STYLE = "https://tiles.openfreemap.org/styles/fiord";

const LAYERS = {
  buildings: "toronto-3d-buildings",
  heatmap: "crime-density-heatmap",
  points: "crime-incident-points",
  riskFill: "high-risk-zones-fill",
  riskOutline: "high-risk-zones-outline",
} as const;

const SOURCES = {
  crime: "crime-incidents",
  risk: "high-risk-zones",
} as const;

type CrimePointRecord = {
  lat: number;
  lng: number;
  offence: string;
  date: string;
};

type CrimePointProperties = {
  offence: string;
  date: string;
};

type RiskZoneProperties = {
  name: string;
  risk: number;
};

type RiskZoneCollection = FeatureCollection<MultiPolygon, RiskZoneProperties>;

type LayerVisibility = {
  buildings: boolean;
  heatmap: boolean;
  points: boolean;
  riskZones: boolean;
};

const INITIAL_VISIBILITY: LayerVisibility = {
  buildings: true,
  heatmap: true,
  points: true,
  riskZones: true,
};

function toCrimeGeoJSON(
  records: CrimePointRecord[],
): FeatureCollection<Point, CrimePointProperties> {
  return {
    type: "FeatureCollection",
    features: records.map((record, index) => ({
      type: "Feature",
      id: index,
      geometry: {
        type: "Point",
        coordinates: [record.lng, record.lat],
      },
      properties: {
        offence: record.offence,
        date: record.date,
      },
    })),
  };
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#039;",
        '"': "&quot;",
      })[character] ?? character,
  );
}

function findFirstLabelLayer(map: MapLibreMap) {
  return map
    .getStyle()
    .layers.find(
      (layer) =>
        layer.type === "symbol" && Boolean(layer.layout?.["text-field"]),
    )?.id;
}

function addBuildingLayer(map: MapLibreMap) {
  const buildingLayer = map
    .getStyle()
    .layers.find(
      (layer) =>
        "source-layer" in layer && layer["source-layer"] === "building",
    );

  if (!buildingLayer || !("source" in buildingLayer)) return false;

  map.addLayer(
    {
      id: LAYERS.buildings,
      type: "fill-extrusion",
      source: buildingLayer.source,
      "source-layer": "building",
      minzoom: 13.5,
      filter: ["!=", ["get", "hide_3d"], true],
      paint: {
        "fill-extrusion-base": [
          "coalesce",
          ["get", "render_min_height"],
          0,
        ],
        "fill-extrusion-color": [
          "interpolate",
          ["linear"],
          ["coalesce", ["get", "render_height"], 8],
          0,
          "#253848",
          60,
          "#36546a",
          180,
          "#4b718a",
        ],
        "fill-extrusion-height": [
          "interpolate",
          ["linear"],
          ["zoom"],
          13.5,
          0,
          15,
          ["coalesce", ["get", "render_height"], 8],
        ],
        "fill-extrusion-opacity": 0.72,
      },
    },
    findFirstLabelLayer(map),
  );

  return true;
}

function addAnalysisLayers(
  map: MapLibreMap,
  crimeData: FeatureCollection<Point, CrimePointProperties>,
  riskData: RiskZoneCollection,
) {
  const firstLabelLayer = findFirstLabelLayer(map);

  map.addSource(SOURCES.risk, {
    type: "geojson",
    data: riskData,
    generateId: true,
  });

  map.addLayer(
    {
      id: LAYERS.riskFill,
      type: "fill",
      source: SOURCES.risk,
      paint: {
        "fill-color": [
          "interpolate",
          ["linear"],
          ["get", "risk"],
          0.45,
          "#fbbf24",
          0.65,
          "#fb923c",
          0.8,
          "#f43f5e",
          1,
          "#be123c",
        ],
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          8,
          0.28,
          13,
          0.16,
          16,
          0.08,
        ],
      },
    },
    firstLabelLayer,
  );

  map.addLayer(
    {
      id: LAYERS.riskOutline,
      type: "line",
      source: SOURCES.risk,
      paint: {
        "line-color": [
          "interpolate",
          ["linear"],
          ["get", "risk"],
          0.45,
          "#fbbf24",
          0.75,
          "#fb7185",
          1,
          "#e11d48",
        ],
        "line-opacity": 0.9,
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1, 15, 2.5],
      },
    },
    firstLabelLayer,
  );

  map.addSource(SOURCES.crime, {
    type: "geojson",
    data: crimeData,
    tolerance: 0.35,
  });

  map.addLayer(
    {
      id: LAYERS.heatmap,
      type: "heatmap",
      source: SOURCES.crime,
      maxzoom: 16,
      paint: {
        "heatmap-weight": 1,
        "heatmap-intensity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          8,
          0.7,
          12,
          1.35,
          15,
          2.2,
        ],
        "heatmap-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          8,
          18,
          12,
          34,
          15,
          48,
        ],
        "heatmap-color": [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          0,
          "rgba(14, 165, 233, 0)",
          0.12,
          "rgba(14, 165, 233, 0.55)",
          0.3,
          "rgba(34, 211, 238, 0.72)",
          0.5,
          "rgba(250, 204, 21, 0.82)",
          0.7,
          "rgba(251, 146, 60, 0.9)",
          0.88,
          "rgba(244, 63, 94, 0.96)",
          1,
          "rgba(190, 24, 93, 1)",
        ],
        "heatmap-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          8,
          0.85,
          13,
          0.78,
          16,
          0,
        ],
      },
    },
    firstLabelLayer,
  );

  map.addLayer(
    {
      id: LAYERS.points,
      type: "circle",
      source: SOURCES.crime,
      minzoom: 12.5,
      paint: {
        "circle-color": "#fb7185",
        "circle-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          12.5,
          0,
          14,
          0.78,
          17,
          0.92,
        ],
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          12.5,
          2,
          15,
          4.5,
          18,
          8,
        ],
        "circle-stroke-color": "#fff1f2",
        "circle-stroke-opacity": 0.85,
        "circle-stroke-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          13,
          0.5,
          17,
          1.5,
        ],
      },
    },
    firstLabelLayer,
  );
}

function setLayerVisibility(
  map: MapLibreMap,
  layerIds: string[],
  visible: boolean,
) {
  layerIds.forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
    }
  });
}

export default function MapView({ searchQuery }: { searchQuery: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const crimeRecordsRef = useRef<CrimePointRecord[]>([]);
  const [dataReady, setDataReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [incidentCount, setIncidentCount] = useState(0);
  const [riskZoneCount, setRiskZoneCount] = useState(0);
  const [visibility, setVisibility] =
    useState<LayerVisibility>(INITIAL_VISIBILITY);
  const [radius, setRadius] = useState(34);
  const [intensity, setIntensity] = useState(1.35);
  const [opacity, setOpacity] = useState(0.82);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const abortController = new AbortController();
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: TORONTO_CENTER,
      zoom: 10.4,
      pitch: 48,
      bearing: -17,
      minZoom: 8,
      maxZoom: 19,
      attributionControl: false,
      canvasContextAttributes: { antialias: true },
    });

    mapRef.current = map;
    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: true }),
      "bottom-left",
    );
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    map.on("load", async () => {
      try {
        const [crimeResponse, riskResponse] = await Promise.all([
          fetch("/crime_points.json", { signal: abortController.signal }),
          fetch("/high_risk_zones.json", { signal: abortController.signal }),
        ]);

        if (!crimeResponse.ok || !riskResponse.ok) {
          throw new Error("One or more map datasets could not be loaded.");
        }

        const crimeRecords = (await crimeResponse.json()) as CrimePointRecord[];
        const riskZones = (await riskResponse.json()) as RiskZoneCollection;

        if (abortController.signal.aborted) return;

        const validCrimeRecords = crimeRecords.filter(
          (record) =>
            Number.isFinite(record.lat) &&
            Number.isFinite(record.lng) &&
            typeof record.offence === "string" &&
            typeof record.date === "string",
        );

        crimeRecordsRef.current = validCrimeRecords;
        setIncidentCount(validCrimeRecords.length);
        setRiskZoneCount(riskZones.features.length);

        addBuildingLayer(map);
        addAnalysisLayers(map, toCrimeGeoJSON(validCrimeRecords), riskZones);

        const showPointer = () => {
          map.getCanvas().style.cursor = "pointer";
        };
        const clearPointer = () => {
          map.getCanvas().style.cursor = "";
        };

        map.on("mouseenter", LAYERS.points, showPointer);
        map.on("mouseleave", LAYERS.points, clearPointer);
        map.on("mouseenter", LAYERS.riskFill, showPointer);
        map.on("mouseleave", LAYERS.riskFill, clearPointer);

        map.on("click", LAYERS.points, (event: MapLayerMouseEvent) => {
          const feature = event.features?.[0];
          const coordinates =
            feature?.geometry.type === "Point"
              ? (feature.geometry.coordinates as [number, number])
              : event.lngLat.toArray();
          const offence = String(feature?.properties?.offence ?? "Incident");
          const date = String(feature?.properties?.date ?? "Unknown date");

          new maplibregl.Popup({ closeButton: true, offset: 12 })
            .setLngLat(coordinates)
            .setHTML(
              `<div class="crime-popup"><span class="crime-popup__eyebrow">Reported incident</span><strong>${escapeHtml(offence)}</strong><span>${escapeHtml(date)}</span></div>`,
            )
            .addTo(map);
        });

        map.on("click", LAYERS.riskFill, (event: MapLayerMouseEvent) => {
          const incidentAtPoint = map.queryRenderedFeatures(event.point, {
            layers: [LAYERS.points],
          });
          if (incidentAtPoint.length > 0) return;

          const feature = event.features?.[0];
          const name = String(feature?.properties?.name ?? "High-risk zone");
          const risk = Number(feature?.properties?.risk ?? 0);

          new maplibregl.Popup({ closeButton: true, offset: 8 })
            .setLngLat(event.lngLat)
            .setHTML(
              `<div class="crime-popup"><span class="crime-popup__eyebrow">Predicted risk zone</span><strong>${escapeHtml(name)}</strong><span>${Math.round(risk * 100)}% relative risk score</span></div>`,
            )
            .addTo(map);
        });

        setDataReady(true);
      } catch (loadError) {
        if (abortController.signal.aborted) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "The map data could not be loaded.",
        );
      }
    });

    map.on("error", (event) => {
      if (!map.isStyleLoaded()) {
        setError(event.error?.message ?? "The basemap could not be loaded.");
      }
    });

    return () => {
      abortController.abort();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!dataReady || !mapRef.current) return;

    const normalizedQuery = searchQuery.trim().toLowerCase();
    const filteredRecords = normalizedQuery
      ? crimeRecordsRef.current.filter((record) =>
          record.offence.toLowerCase().includes(normalizedQuery),
        )
      : crimeRecordsRef.current;

    const source = mapRef.current.getSource(SOURCES.crime) as
      | GeoJSONSource
      | undefined;
    source?.setData(toCrimeGeoJSON(filteredRecords));
    setIncidentCount(filteredRecords.length);
  }, [dataReady, searchQuery]);

  useEffect(() => {
    if (!dataReady || !mapRef.current) return;
    setLayerVisibility(mapRef.current, [LAYERS.heatmap], visibility.heatmap);
    setLayerVisibility(mapRef.current, [LAYERS.points], visibility.points);
    setLayerVisibility(
      mapRef.current,
      [LAYERS.riskFill, LAYERS.riskOutline],
      visibility.riskZones,
    );
    setLayerVisibility(
      mapRef.current,
      [LAYERS.buildings],
      visibility.buildings,
    );
  }, [dataReady, visibility]);

  useEffect(() => {
    const map = mapRef.current;
    if (!dataReady || !map?.getLayer(LAYERS.heatmap)) return;

    map.setPaintProperty(LAYERS.heatmap, "heatmap-radius", [
      "interpolate",
      ["linear"],
      ["zoom"],
      8,
      Math.max(8, radius * 0.55),
      12,
      radius,
      15,
      radius * 1.4,
    ]);
  }, [dataReady, radius]);

  useEffect(() => {
    const map = mapRef.current;
    if (!dataReady || !map?.getLayer(LAYERS.heatmap)) return;

    map.setPaintProperty(LAYERS.heatmap, "heatmap-intensity", [
      "interpolate",
      ["linear"],
      ["zoom"],
      8,
      intensity * 0.52,
      12,
      intensity,
      15,
      intensity * 1.65,
    ]);
  }, [dataReady, intensity]);

  useEffect(() => {
    const map = mapRef.current;
    if (!dataReady || !map?.getLayer(LAYERS.heatmap)) return;

    map.setPaintProperty(LAYERS.heatmap, "heatmap-opacity", [
      "interpolate",
      ["linear"],
      ["zoom"],
      8,
      opacity,
      13,
      opacity * 0.9,
      16,
      0,
    ]);
  }, [dataReady, opacity]);

  const toggleLayer = (layer: keyof LayerVisibility) => {
    setVisibility((current) => ({ ...current, [layer]: !current[layer] }));
  };

  const resetView = () => {
    mapRef.current?.easeTo({
      center: TORONTO_CENTER,
      zoom: 10.4,
      pitch: 48,
      bearing: -17,
      duration: 900,
    });
  };

  return (
    <div className="absolute inset-0 overflow-hidden bg-brand-bg">
      <div ref={containerRef} className="h-full w-full" aria-label="Toronto crime density map" />

      <section className="map-analysis-panel absolute left-4 top-20 z-10 w-72 overflow-hidden rounded-2xl border border-brand-border bg-brand-panel/95 shadow-2xl backdrop-blur-md">
        <div className="border-b border-brand-border px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-brand-primary/15 p-2 text-brand-primary">
                <Flame className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-brand-text">Density analysis</h2>
                <p className="text-[11px] text-brand-text-muted">Observed incidents + predicted risk</p>
              </div>
            </div>
            <span className={`h-2.5 w-2.5 rounded-full ${dataReady ? "bg-brand-success" : "animate-pulse bg-brand-warning"}`} />
          </div>
        </div>

        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-brand-border bg-brand-bg/70 p-3">
              <span className="block text-lg font-semibold text-brand-text">{incidentCount.toLocaleString()}</span>
              <span className="text-[10px] uppercase tracking-wider text-brand-text-muted">Visible incidents</span>
            </div>
            <div className="rounded-xl border border-brand-border bg-brand-bg/70 p-3">
              <span className="block text-lg font-semibold text-brand-text">{riskZoneCount}</span>
              <span className="text-[10px] uppercase tracking-wider text-brand-text-muted">Risk zones</span>
            </div>
          </div>

          <div className="space-y-2">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-brand-text-muted">
              <Layers3 className="h-3.5 w-3.5" /> Layers
            </p>
            <LayerToggle icon={Flame} label="Incident heatmap" active={visibility.heatmap} onClick={() => toggleLayer("heatmap")} />
            <LayerToggle icon={MapPin} label="Incident points" active={visibility.points} onClick={() => toggleLayer("points")} />
            <LayerToggle icon={SlidersHorizontal} label="Predicted risk zones" active={visibility.riskZones} onClick={() => toggleLayer("riskZones")} />
            <LayerToggle icon={Building2} label="3D buildings" active={visibility.buildings} onClick={() => toggleLayer("buildings")} />
          </div>

          <div className="space-y-3 border-t border-brand-border pt-4">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-brand-text-muted">
              <SlidersHorizontal className="h-3.5 w-3.5" /> Heatmap tuning
            </p>
            <RangeControl label="Radius" value={radius} min={12} max={60} step={1} display={`${radius}px`} onChange={setRadius} />
            <RangeControl label="Intensity" value={intensity} min={0.5} max={3} step={0.05} display={`${intensity.toFixed(2)}×`} onChange={setIntensity} />
            <RangeControl label="Opacity" value={opacity} min={0.2} max={1} step={0.02} display={`${Math.round(opacity * 100)}%`} onChange={setOpacity} />
          </div>

          <button type="button" onClick={resetView} className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand-border bg-brand-bg px-3 py-2 text-xs font-medium text-brand-text transition-colors hover:bg-brand-card">
            <LocateFixed className="h-3.5 w-3.5" /> Reset Toronto view
          </button>
        </div>
      </section>

      <div className="pointer-events-none absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border border-brand-border bg-brand-panel/90 px-4 py-2 shadow-xl backdrop-blur-md">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-brand-text-muted">Density</span>
        <div className="heatmap-legend h-2 w-36 rounded-full" />
        <div className="flex gap-3 text-[10px] text-brand-text-muted"><span>Low</span><span>High</span></div>
      </div>

      {!dataReady && !error && (
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center bg-brand-bg/45 backdrop-blur-[2px]">
          <div className="rounded-xl border border-brand-border bg-brand-panel px-5 py-3 text-sm text-brand-text shadow-2xl">Loading Toronto analysis layers…</div>
        </div>
      )}

      {error && (
        <div role="alert" className="absolute bottom-16 left-1/2 z-20 -translate-x-1/2 rounded-xl border border-brand-primary/50 bg-brand-panel px-5 py-3 text-sm text-brand-text shadow-2xl">
          <strong className="mr-2 text-brand-primary">Map unavailable.</strong>{error}
        </div>
      )}
    </div>
  );
}

function LayerToggle({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Flame;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-brand-card">
      <span className="flex items-center gap-2 text-xs text-brand-text"><Icon className="h-3.5 w-3.5 text-brand-text-muted" />{label}</span>
      <span className={`relative h-5 w-9 rounded-full transition-colors ${active ? "bg-brand-success" : "bg-brand-border"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${active ? "translate-x-[18px]" : "translate-x-0.5"}`} />
      </span>
    </button>
  );
}

function RangeControl({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-[11px] text-brand-text-muted">
        <span>{label}</span><span className="font-mono text-brand-text">{display}</span>
      </span>
      <input className="map-range h-1.5 w-full cursor-pointer appearance-none rounded-full bg-brand-border" type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}
