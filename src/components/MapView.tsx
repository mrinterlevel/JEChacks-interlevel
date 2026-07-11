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
  pointHalo: "crime-incident-point-halo",
  points: "crime-incident-points",
  riskExtrusion: "high-risk-zones-extrusion",
  riskFill: "high-risk-zones-fill",
  riskGlow: "high-risk-zones-glow",
  riskLabel: "high-risk-zones-label",
  riskOutline: "high-risk-zones-outline",
} as const;

const SOURCES = {
  crime: "crime-incidents",
  predictions: "crime-predictions",
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

type PredictionRecord = {
  name: string;
  predicted: number;
  risk: number;
};

type PredictionPointProperties = PredictionRecord;

type NeighbourhoodProperties = {
  AREA_DESC: string;
};

type NeighbourhoodCollection = FeatureCollection<
  MultiPolygon,
  NeighbourhoodProperties
>;

type RiskZoneProperties = {
  name: string;
  risk: number;
  riskLabel?: string;
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

function getRingCentroid(ring: number[][]) {
  let signedArea = 0;
  let centroidX = 0;
  let centroidY = 0;

  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    const crossProduct = x1 * y2 - x2 * y1;
    signedArea += crossProduct;
    centroidX += (x1 + x2) * crossProduct;
    centroidY += (y1 + y2) * crossProduct;
  }

  signedArea *= 0.5;
  if (Math.abs(signedArea) < Number.EPSILON) return null;

  return {
    area: Math.abs(signedArea),
    coordinates: [
      centroidX / (6 * signedArea),
      centroidY / (6 * signedArea),
    ] as [number, number],
  };
}

function getMultiPolygonCentroid(coordinates: number[][][][]) {
  const polygonCentroids = coordinates
    .map((polygon) => getRingCentroid(polygon[0]))
    .filter((centroid): centroid is NonNullable<typeof centroid> => Boolean(centroid));

  const totalArea = polygonCentroids.reduce(
    (sum, centroid) => sum + centroid.area,
    0,
  );
  if (totalArea === 0) return null;

  return polygonCentroids.reduce<[number, number]>(
    (weightedCenter, centroid) => [
      weightedCenter[0] + centroid.coordinates[0] * (centroid.area / totalArea),
      weightedCenter[1] + centroid.coordinates[1] * (centroid.area / totalArea),
    ],
    [0, 0],
  );
}

function toPredictionGeoJSON(
  predictions: PredictionRecord[],
  neighbourhoods: NeighbourhoodCollection,
): FeatureCollection<Point, PredictionPointProperties> {
  const neighbourhoodByName = new Map(
    neighbourhoods.features.map((feature) => [
      feature.properties.AREA_DESC,
      feature,
    ]),
  );

  return {
    type: "FeatureCollection",
    features: predictions.flatMap((prediction, index) => {
      const neighbourhood = neighbourhoodByName.get(prediction.name);
      if (!neighbourhood) return [];

      const coordinates = getMultiPolygonCentroid(
        neighbourhood.geometry.coordinates,
      );
      if (!coordinates) return [];

      return [
        {
          type: "Feature" as const,
          id: index,
          geometry: { type: "Point" as const, coordinates },
          properties: prediction,
        },
      ];
    }),
  };
}

function prepareRiskZones(data: RiskZoneCollection): RiskZoneCollection {
  return {
    ...data,
    features: data.features.map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        riskLabel: `${Math.round(feature.properties.risk * 100)}% RISK`,
      },
    })),
  };
}

function createFallbackCircleIcon() {
  const width = 22;
  const height = 22;
  const data = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const distance = Math.hypot(x - width / 2, y - height / 2);
      if (distance > 9.5) continue;

      const offset = (y * width + x) * 4;
      const isBorder = distance > 7.2;
      data[offset] = isBorder ? 218 : 71;
      data[offset + 1] = isBorder ? 239 : 117;
      data[offset + 2] = isBorder ? 255 : 143;
      data[offset + 3] = 235;
    }
  }

  return { width, height, data };
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
      minzoom: 12.5,
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
          "#29495f",
          60,
          "#47758f",
          180,
          "#6b9bb4",
        ],
        "fill-extrusion-height": [
          "interpolate",
          ["linear"],
          ["zoom"],
          12.5,
          0,
          14.2,
          ["coalesce", ["get", "render_height"], 8],
        ],
        "fill-extrusion-opacity": 0.88,
        "fill-extrusion-vertical-gradient": true,
      },
    },
    findFirstLabelLayer(map),
  );

  return true;
}

function configureSceneLighting(map: MapLibreMap) {
  map.setLight({
    anchor: "map",
    color: "#d8efff",
    intensity: 0.68,
    position: [1.65, 218, 42],
  });

  map.setSky({
    "sky-color": "#07131d",
    "horizon-color": "#183242",
    "fog-color": "#102532",
    "fog-ground-blend": 0.22,
    "horizon-fog-blend": 0.38,
    "sky-horizon-blend": 0.72,
    "atmosphere-blend": [
      "interpolate",
      ["linear"],
      ["zoom"],
      8,
      0.82,
      14,
      0.18,
    ],
  });
}

function addAnalysisLayers(
  map: MapLibreMap,
  crimeData: FeatureCollection<Point, CrimePointProperties>,
  predictionData: FeatureCollection<Point, PredictionPointProperties>,
  riskData: RiskZoneCollection,
) {
  const firstLabelLayer = findFirstLabelLayer(map);

  map.addSource(SOURCES.risk, {
    type: "geojson",
    data: prepareRiskZones(riskData),
    generateId: true,
  });

  map.addSource(SOURCES.crime, {
    type: "geojson",
    data: crimeData,
    tolerance: 0.35,
  });

  map.addSource(SOURCES.predictions, {
    type: "geojson",
    data: predictionData,
  });

  map.addLayer(
    {
      id: LAYERS.heatmap,
      type: "heatmap",
      source: SOURCES.predictions,
      maxzoom: 16,
      paint: {
        "heatmap-weight": [
          "interpolate",
          ["linear"],
          ["get", "risk"],
          0,
          0,
          1,
          1,
        ],
        "heatmap-intensity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          8,
          0.65,
          12,
          1.25,
          15,
          2.06,
        ],
        "heatmap-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          8,
          22,
          12,
          40,
          15,
          56,
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
          0.9,
          13,
          0.81,
          16,
          0,
        ],
      },
    },
    firstLabelLayer,
  );

  // Risk zones intentionally render after the heatmap. The raised translucent
  // surface and two border passes keep prediction areas legible without hiding
  // the observed density underneath.
  map.addLayer(
    {
      id: LAYERS.riskExtrusion,
      type: "fill-extrusion",
      source: SOURCES.risk,
      minzoom: 9,
      paint: {
        "fill-extrusion-base": 3,
        "fill-extrusion-color": [
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
        "fill-extrusion-height": [
          "interpolate",
          ["linear"],
          ["get", "risk"],
          0.45,
          24,
          0.65,
          38,
          0.8,
          56,
          1,
          78,
        ],
        "fill-extrusion-opacity": 0.27,
        "fill-extrusion-vertical-gradient": true,
      },
    },
    firstLabelLayer,
  );

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
          "#fde68a",
          0.7,
          "#fb7185",
          1,
          "#e11d48",
        ],
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9,
          0.2,
          14,
          0.11,
          17,
          0.06,
        ],
      },
    },
    firstLabelLayer,
  );

  map.addLayer(
    {
      id: LAYERS.riskGlow,
      type: "line",
      source: SOURCES.risk,
      paint: {
        "line-blur": 6,
        "line-color": [
          "interpolate",
          ["linear"],
          ["get", "risk"],
          0.45,
          "#fcd34d",
          0.75,
          "#fb7185",
          1,
          "#f43f5e",
        ],
        "line-opacity": 0.72,
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 10, 15, 16],
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
          "#fef3c7",
          0.75,
          "#fecdd3",
          1,
          "#ffffff",
        ],
        "line-opacity": 0.98,
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 1.8, 15, 4],
      },
    },
    firstLabelLayer,
  );

  map.addLayer(
    {
      id: LAYERS.riskLabel,
      type: "symbol",
      source: SOURCES.risk,
      minzoom: 10,
      layout: {
        "text-field": ["concat", ["get", "name"], "\n", ["get", "riskLabel"]],
        "text-size": ["interpolate", ["linear"], ["zoom"], 10, 10, 14, 13],
        "text-anchor": "center",
        "text-letter-spacing": 0.08,
        "text-max-width": 12,
        "text-optional": true,
      },
      paint: {
        "text-color": "#fff7ed",
        "text-halo-blur": 0.8,
        "text-halo-color": "#4c0519",
        "text-halo-width": 2.2,
      },
    },
    firstLabelLayer,
  );

  map.addLayer(
    {
      id: LAYERS.pointHalo,
      type: "circle",
      source: SOURCES.crime,
      minzoom: 10,
      paint: {
        "circle-blur": 0.8,
        "circle-color": [
          "case",
          [">=", ["index-of", "Firearm", ["get", "offence"]], 0],
          "#c084fc",
          [">=", ["index-of", "Robbery", ["get", "offence"]], 0],
          "#fb7185",
          [">=", ["index-of", "Assault", ["get", "offence"]], 0],
          "#fb923c",
          [">=", ["index-of", "Theft", ["get", "offence"]], 0],
          "#38bdf8",
          [">=", ["index-of", "B&E", ["get", "offence"]], 0],
          "#facc15",
          "#f472b6",
        ],
        "circle-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10,
          0.22,
          13,
          0.38,
          17,
          0.28,
        ],
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10,
          4,
          14,
          10,
          18,
          17,
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
      minzoom: 10,
      paint: {
        "circle-color": [
          "case",
          [">=", ["index-of", "Firearm", ["get", "offence"]], 0],
          "#c084fc",
          [">=", ["index-of", "Robbery", ["get", "offence"]], 0],
          "#fb7185",
          [">=", ["index-of", "Assault", ["get", "offence"]], 0],
          "#fb923c",
          [">=", ["index-of", "Theft", ["get", "offence"]], 0],
          "#38bdf8",
          [">=", ["index-of", "B&E", ["get", "offence"]], 0],
          "#facc15",
          "#f472b6",
        ],
        "circle-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10,
          0.48,
          12.5,
          0.72,
          17,
          0.96,
        ],
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10,
          1.8,
          13,
          3.2,
          16,
          5.5,
          18,
          8,
        ],
        "circle-stroke-color": "#fff1f2",
        "circle-stroke-opacity": 0.85,
        "circle-stroke-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10,
          0.6,
          17,
          1.8,
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
  const [radius, setRadius] = useState(40);
  const [intensity, setIntensity] = useState(1.25);
  const [opacity, setOpacity] = useState(0.9);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const abortController = new AbortController();
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: TORONTO_CENTER,
      zoom: 11.15,
      pitch: 58,
      bearing: -22,
      minZoom: 8,
      maxZoom: 20,
      maxPitch: 75,
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

    map.on("styleimagemissing", (event) => {
      if (event.id === "circle-11" && !map.hasImage(event.id)) {
        map.addImage(event.id, createFallbackCircleIcon(), { pixelRatio: 2 });
      }
    });

    map.on("load", async () => {
      try {
        const [
          crimeResponse,
          predictionResponse,
          neighbourhoodResponse,
          riskResponse,
        ] = await Promise.all([
          fetch("/crime_points.json", { signal: abortController.signal }),
          fetch("/predictions.json", { signal: abortController.signal }),
          fetch("/neighbourhoods.geojson", { signal: abortController.signal }),
          fetch("/high_risk_zones.json", { signal: abortController.signal }),
        ]);

        if (
          !crimeResponse.ok ||
          !predictionResponse.ok ||
          !neighbourhoodResponse.ok ||
          !riskResponse.ok
        ) {
          throw new Error("One or more map datasets could not be loaded.");
        }

        const crimeRecords = (await crimeResponse.json()) as CrimePointRecord[];
        const predictions =
          (await predictionResponse.json()) as PredictionRecord[];
        const neighbourhoods =
          (await neighbourhoodResponse.json()) as NeighbourhoodCollection;
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

        configureSceneLighting(map);
        addBuildingLayer(map);
        addAnalysisLayers(
          map,
          toCrimeGeoJSON(validCrimeRecords),
          toPredictionGeoJSON(predictions, neighbourhoods),
          riskZones,
        );

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

          new maplibregl.Popup({
            className: "crime-map-popup",
            closeButton: true,
            offset: 12,
          })
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

          new maplibregl.Popup({
            className: "crime-map-popup",
            closeButton: true,
            offset: 8,
          })
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
    setLayerVisibility(
      mapRef.current,
      [LAYERS.pointHalo, LAYERS.points],
      visibility.points,
    );
    setLayerVisibility(
      mapRef.current,
      [
        LAYERS.riskExtrusion,
        LAYERS.riskFill,
        LAYERS.riskGlow,
        LAYERS.riskOutline,
        LAYERS.riskLabel,
      ],
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
      zoom: 11.15,
      pitch: 58,
      bearing: -22,
      duration: 900,
    });
  };

  return (
    <div className="absolute inset-0 overflow-hidden bg-brand-bg">
      <div ref={containerRef} className="h-full w-full" aria-label="Toronto crime density map" />

      <section className="map-analysis-panel no-scrollbar absolute left-4 top-20 z-10 max-h-[calc(100vh-12rem)] w-72 overflow-y-auto rounded-2xl border border-brand-border bg-brand-panel/95 shadow-2xl backdrop-blur-md">
        <div className="border-b border-brand-border px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-brand-primary/15 p-2 text-brand-primary">
                <Flame className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-brand-text">Predictive analysis</h2>
                <p className="text-[11px] text-brand-text-muted">Model forecast + reported incidents</p>
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
            <LayerToggle icon={Flame} label="Predicted risk heatmap" active={visibility.heatmap} onClick={() => toggleLayer("heatmap")} />
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
        <span className="text-[10px] font-semibold uppercase tracking-widest text-brand-text-muted">Forecast</span>
        <div className="heatmap-legend h-2 w-32 rounded-full" />
        <div className="flex gap-3 text-[10px] text-brand-text-muted"><span>Low</span><span>High</span></div>
        <span className="h-5 w-px bg-brand-border" />
        <span className="risk-zone-legend h-4 w-8" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-brand-text-muted">Raised risk zone</span>
        <span className="h-5 w-px bg-brand-border" />
        <span className="incident-point-legend h-3 w-3 rounded-full" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-brand-text-muted">Reported incident</span>
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
