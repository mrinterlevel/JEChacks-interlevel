"use client";

import { useEffect, useRef, useState } from "react";
import {
  Building2,
  Flame,
  Info,
  Layers3,
  LocateFixed,
  MapPin,
  Radio,
  ShieldAlert,
  SlidersHorizontal,
} from "lucide-react";
import maplibregl, {
  GeoJSONSource,
  Map as MapLibreMap,
  MapLayerMouseEvent,
} from "maplibre-gl";
import type { LngLatLike } from "maplibre-gl";
import type { ExpressionSpecification } from "@maplibre/maplibre-gl-style-spec";
import type {
  FeatureCollection,
  MultiPolygon,
  Point,
} from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";

import {
  formatRelativeTime,
  formatTimestamp,
  SQUARE_ONE_CENTER,
  type DistressSignal,
  type MapMode,
} from "@/lib/distress";

const TORONTO_CENTER: [number, number] = [-79.3832, 43.6532];
const MAP_STYLE = "https://tiles.openfreemap.org/styles/fiord";

const LAYERS = {
  buildings: "toronto-3d-buildings",
  heatmap: "crime-density-heatmap",
  historicalHeatmap: "historical-incident-density-heatmap",
  pointHalo: "crime-incident-point-halo",
  points: "crime-incident-points",
  riskExtrusion: "high-risk-zones-extrusion",
  riskFill: "high-risk-zones-fill",
  riskGlow: "high-risk-zones-glow",
  riskLabel: "high-risk-zones-label",
  riskOutline: "high-risk-zones-outline",
  distressPast: "distress-past-points",
  distressActiveHalo: "distress-active-halo",
  distressActiveCore: "distress-active-core",
} as const;

const SOURCES = {
  crime: "crime-incidents",
  predictions: "crime-predictions",
  risk: "high-risk-zones",
  distress: "distress-signals",
} as const;

const DISTRESS_LAYER_IDS = [
  LAYERS.distressPast,
  LAYERS.distressActiveHalo,
  LAYERS.distressActiveCore,
];

type DistressPointProperties = {
  reporter: string;
  locationName: string;
  category: string;
  createdAt: string;
  status: DistressSignal["status"];
};

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
  historicalHeatmap: boolean;
  points: boolean;
  riskZones: boolean;
};

const INITIAL_VISIBILITY: LayerVisibility = {
  buildings: true,
  heatmap: true,
  historicalHeatmap: true,
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

function toDistressGeoJSON(
  signals: DistressSignal[],
): FeatureCollection<Point, DistressPointProperties> {
  return {
    type: "FeatureCollection",
    features: signals.map((signal) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [signal.lng, signal.lat],
      },
      properties: {
        reporter: signal.reporter,
        locationName: signal.locationName,
        category: signal.category,
        createdAt: signal.createdAt,
        status: signal.status,
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

function predictionRadiusExpression(
  baseRadius: number,
): ExpressionSpecification {
  const riskMultiplier: ExpressionSpecification = [
    "interpolate",
    ["linear"],
    ["get", "risk"],
    0,
    0.6,
    0.5,
    0.95,
    0.75,
    1.3,
    1,
    1.75,
  ];

  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    8,
    ["*", baseRadius * 0.55, riskMultiplier],
    12,
    ["*", baseRadius, riskMultiplier],
    15,
    ["*", baseRadius * 1.4, riskMultiplier],
  ] as ExpressionSpecification;
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

function showStyledPopup({
  map,
  lngLat,
  offset,
  eyebrow,
  title,
  detail,
  eyebrowColor = "#fb7185",
}: {
  map: MapLibreMap;
  lngLat: LngLatLike;
  offset: number;
  eyebrow: string;
  title: string;
  detail: string;
  eyebrowColor?: string;
}) {
  const content = document.createElement("div");
  Object.assign(content.style, {
    display: "flex",
    flexDirection: "column",
    gap: "5px",
    paddingRight: "10px",
  });

  const eyebrowElement = document.createElement("span");
  eyebrowElement.textContent = eyebrow;
  Object.assign(eyebrowElement.style, {
    color: eyebrowColor,
    fontSize: "9px",
    fontWeight: "700",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  });

  const titleElement = document.createElement("strong");
  titleElement.textContent = title;
  Object.assign(titleElement.style, {
    color: "#f3f4f6",
    fontSize: "13px",
    lineHeight: "1.35",
  });

  const detailElement = document.createElement("span");
  detailElement.textContent = detail;
  Object.assign(detailElement.style, {
    color: "#9ca3af",
    fontSize: "11px",
  });

  content.append(eyebrowElement, titleElement, detailElement);

  const popup = new maplibregl.Popup({
    className: "crime-map-popup",
    closeButton: true,
    offset,
  })
    .setLngLat(lngLat)
    .setDOMContent(content)
    .addTo(map);

  const popupElement = popup.getElement();
  const popupBody = popupElement.querySelector<HTMLElement>(
    ".maplibregl-popup-content",
  );
  if (popupBody) {
    Object.assign(popupBody.style, {
      minWidth: "220px",
      border: "1px solid #2c394a",
      borderRadius: "12px",
      background: "#1a232e",
      color: "#f3f4f6",
      boxShadow: "0 20px 45px rgb(0 0 0 / 45%)",
      padding: "14px 16px",
    });
  }

  const closeButton = popupElement.querySelector<HTMLElement>(
    ".maplibregl-popup-close-button",
  );
  if (closeButton) {
    Object.assign(closeButton.style, {
      color: "#9ca3af",
      fontSize: "18px",
      padding: "4px 8px",
    });
  }
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
      id: LAYERS.historicalHeatmap,
      type: "heatmap",
      source: SOURCES.crime,
      maxzoom: 15.5,
      paint: {
        "heatmap-weight": 1,
        "heatmap-intensity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          8,
          0.55,
          12,
          0.9,
          15,
          1.2,
        ],
        "heatmap-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          8,
          12,
          12,
          24,
          15,
          34,
        ],
        "heatmap-color": [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          0,
          "rgba(14, 165, 233, 0)",
          0.2,
          "rgba(34, 211, 238, 0.48)",
          0.45,
          "rgba(14, 165, 233, 0.68)",
          0.7,
          "rgba(79, 70, 229, 0.8)",
          1,
          "rgba(126, 34, 206, 0.9)",
        ],
        "heatmap-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          8,
          0.3,
          13,
          0.22,
          15.5,
          0,
        ],
      },
    },
    firstLabelLayer,
  );

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
          0.05,
          0.5,
          0.6,
          0.75,
          1.25,
          1,
          2.1,
        ],
        "heatmap-intensity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          8,
          1,
          12,
          2,
          15,
          3.25,
        ],
        "heatmap-radius": predictionRadiusExpression(65),
        "heatmap-color": [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          0,
          "rgba(250, 204, 21, 0)",
          0.12,
          "rgba(250, 204, 21, 0.5)",
          0.3,
          "rgba(251, 146, 60, 0.72)",
          0.5,
          "rgba(244, 63, 94, 0.86)",
          0.75,
          "rgba(225, 29, 72, 0.95)",
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
      minzoom: 11.25,
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
          11.25,
          0.26,
          13,
          0.38,
          17,
          0.28,
        ],
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          11.25,
          5,
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
      minzoom: 11.25,
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
          11.25,
          0.56,
          12.5,
          0.72,
          17,
          0.96,
        ],
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          11.25,
          2.2,
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
          11.25,
          0.7,
          17,
          1.8,
        ],
      },
    },
    firstLabelLayer,
  );
}

function addDistressLayers(
  map: MapLibreMap,
  data: FeatureCollection<Point, DistressPointProperties>,
) {
  map.addSource(SOURCES.distress, { type: "geojson", data });

  // Past (resolved) signals — calmer than the live pins, but still clearly
  // legible so historical interactions read around the live signal.
  map.addLayer({
    id: LAYERS.distressPast,
    type: "circle",
    source: SOURCES.distress,
    filter: ["==", ["get", "status"], "past"],
    layout: { visibility: "none" },
    paint: {
      "circle-color": "#38bdf8",
      "circle-opacity": 0.9,
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 5, 15, 8, 17, 11],
      "circle-stroke-color": "#e0f2fe",
      "circle-stroke-opacity": 0.9,
      "circle-stroke-width": 1.4,
    },
  });

  // Active signals — an animated halo (pulsed from the component) plus a bright
  // solid core so live emergencies read with urgency.
  map.addLayer({
    id: LAYERS.distressActiveHalo,
    type: "circle",
    source: SOURCES.distress,
    filter: ["==", ["get", "status"], "active"],
    layout: { visibility: "none" },
    paint: {
      "circle-color": "#f43f5e",
      "circle-opacity": 0.28,
      "circle-radius": 18,
      "circle-blur": 0.35,
    },
  });

  map.addLayer({
    id: LAYERS.distressActiveCore,
    type: "circle",
    source: SOURCES.distress,
    filter: ["==", ["get", "status"], "active"],
    layout: { visibility: "none" },
    paint: {
      "circle-color": "#f43f5e",
      "circle-opacity": 0.95,
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 6, 15, 10],
      "circle-stroke-color": "#fff1f2",
      "circle-stroke-opacity": 0.95,
      "circle-stroke-width": 2,
    },
  });
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

export default function MapView({
  searchQuery,
  mapMode,
  distressSignals,
}: {
  searchQuery: string;
  mapMode: MapMode;
  distressSignals: DistressSignal[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const crimeRecordsRef = useRef<CrimePointRecord[]>([]);
  const distressRef = useRef<DistressSignal[]>(distressSignals);
  const [dataReady, setDataReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [riskZoneCount, setRiskZoneCount] = useState(0);
  const [visibility, setVisibility] =
    useState<LayerVisibility>(INITIAL_VISIBILITY);
  const [radius, setRadius] = useState(65);
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

          showStyledPopup({
            map,
            lngLat: coordinates,
            offset: 12,
            eyebrow: "Reported incident",
            title: offence,
            detail: date,
          });
        });

        map.on("click", LAYERS.riskFill, (event: MapLayerMouseEvent) => {
          const incidentAtPoint = map.queryRenderedFeatures(event.point, {
            layers: [LAYERS.points],
          });
          if (incidentAtPoint.length > 0) return;

          const feature = event.features?.[0];
          const name = String(feature?.properties?.name ?? "High-risk zone");
          const risk = Number(feature?.properties?.risk ?? 0);

          showStyledPopup({
            map,
            lngLat: event.lngLat,
            offset: 8,
            eyebrow: "Predicted risk zone",
            title: name,
            detail: `${Math.round(risk * 100)}% relative risk score`,
          });
        });

        addDistressLayers(map, toDistressGeoJSON(distressRef.current));

        const showDistressPopup = (event: MapLayerMouseEvent) => {
          const feature = event.features?.[0];
          if (!feature) return;
          const coordinates =
            feature.geometry.type === "Point"
              ? (feature.geometry.coordinates as [number, number])
              : event.lngLat.toArray();
          const props = feature.properties ?? {};
          const isActive = props.status === "active";
          const category = String(props.category ?? "Distress signal");
          const locationName = String(props.locationName ?? "Unknown location");
          const reporter = String(props.reporter ?? "Anonymous");
          const when = props.createdAt
            ? `${formatTimestamp(String(props.createdAt))} · ${formatRelativeTime(String(props.createdAt))}`
            : "unknown time";

          showStyledPopup({
            map,
            lngLat: coordinates,
            offset: 14,
            eyebrow: isActive ? "Active distress" : "Resolved signal",
            eyebrowColor: isActive ? "#fb7185" : "#9ca3af",
            title: category,
            detail: `${locationName} · ${reporter} · ${when}`,
          });
        };

        DISTRESS_LAYER_IDS.forEach((layerId) => {
          map.on("mouseenter", layerId, showPointer);
          map.on("mouseleave", layerId, clearPointer);
          map.on("click", layerId, showDistressPopup);
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
  }, [dataReady, searchQuery]);

  useEffect(() => {
    const map = mapRef.current;
    if (!dataReady || !map) return;

    const crimeView = mapMode === "crime";

    // Crime analysis layers are visible only on the crime map, and only when
    // their individual toggle is on. Distress signals never bleed into it.
    setLayerVisibility(map, [LAYERS.heatmap], crimeView && visibility.heatmap);
    setLayerVisibility(
      map,
      [LAYERS.historicalHeatmap],
      crimeView && visibility.historicalHeatmap,
    );
    setLayerVisibility(
      map,
      [LAYERS.pointHalo, LAYERS.points],
      crimeView && visibility.points,
    );
    setLayerVisibility(
      map,
      [
        LAYERS.riskExtrusion,
        LAYERS.riskFill,
        LAYERS.riskGlow,
        LAYERS.riskOutline,
        LAYERS.riskLabel,
      ],
      crimeView && visibility.riskZones,
    );

    // Buildings are neutral basemap context, kept in both views.
    setLayerVisibility(map, [LAYERS.buildings], visibility.buildings);

    // Distress markers live only on the distress view.
    setLayerVisibility(map, DISTRESS_LAYER_IDS, !crimeView);
  }, [dataReady, visibility, mapMode]);

  // Keep the distress source in sync with the shared realtime feed.
  useEffect(() => {
    distressRef.current = distressSignals;
    const map = mapRef.current;
    if (!dataReady || !map) return;
    const source = map.getSource(SOURCES.distress) as GeoJSONSource | undefined;
    source?.setData(toDistressGeoJSON(distressSignals));
  }, [dataReady, distressSignals]);

  // Frame the relevant area when the view switches.
  useEffect(() => {
    const map = mapRef.current;
    if (!dataReady || !map) return;
    if (mapMode === "distress") {
      // Zoom into the live distress signals (Square One) at an angle — close
      // enough that the 3D buildings render, but wide enough that the cluster
      // of past interactions around the mall stays in frame.
      map.easeTo({
        center: SQUARE_ONE_CENTER,
        zoom: 15.1,
        pitch: 55,
        bearing: -20,
        duration: 1400,
      });
    } else {
      map.easeTo({
        center: TORONTO_CENTER,
        zoom: 11.15,
        pitch: 58,
        bearing: -22,
        duration: 1100,
      });
    }
  }, [dataReady, mapMode]);

  // Pulse the active-signal halo so live emergencies visibly throb.
  useEffect(() => {
    const map = mapRef.current;
    if (!dataReady || !map || mapMode !== "distress") return;

    let frame = 0;
    const animate = () => {
      if (map.getLayer(LAYERS.distressActiveHalo)) {
        const t = (Math.sin(performance.now() / 480) + 1) / 2; // 0..1
        map.setPaintProperty(LAYERS.distressActiveHalo, "circle-radius", 16 + t * 26);
        map.setPaintProperty(LAYERS.distressActiveHalo, "circle-opacity", 0.32 - t * 0.26);
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [dataReady, mapMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!dataReady || !map?.getLayer(LAYERS.heatmap)) return;

    map.setPaintProperty(
      LAYERS.heatmap,
      "heatmap-radius",
      predictionRadiusExpression(radius),
    );
  }, [dataReady, radius]);

  useEffect(() => {
    const map = mapRef.current;
    if (!dataReady || !map?.getLayer(LAYERS.heatmap)) return;

    map.setPaintProperty(LAYERS.heatmap, "heatmap-intensity", [
      "interpolate",
      ["linear"],
      ["zoom"],
      8,
      intensity * 0.8,
      12,
      intensity * 1.6,
      15,
      intensity * 2.6,
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

  const activeDistressCount = distressSignals.filter(
    (signal) => signal.status === "active",
  ).length;
  const pastDistressCount = distressSignals.length - activeDistressCount;

  return (
    <div className="absolute inset-0 overflow-hidden bg-brand-bg">
      <div ref={containerRef} className="h-full w-full" aria-label="Toronto crime and distress map" />

      {mapMode === "crime" && (
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
            <div className="group rounded-xl border border-brand-border bg-brand-bg/70 p-3 focus-within:border-brand-primary/60 hover:border-brand-primary/60">
              <div className="flex items-start justify-between gap-2">
                <span className="block text-sm font-semibold leading-tight text-brand-text">Trained off ~475,000 incidents</span>
                <button type="button" aria-label="About the training and displayed incident data" className="shrink-0 rounded-full text-brand-text-muted outline-none transition-colors hover:text-brand-primary focus-visible:text-brand-primary">
                  <Info className="h-4 w-4" />
                </button>
              </div>
              <div role="tooltip" className="grid grid-rows-[0fr] transition-all duration-200 group-hover:mt-2 group-hover:grid-rows-[1fr] group-focus-within:mt-2 group-focus-within:grid-rows-[1fr]">
                <p className="overflow-hidden text-[10px] leading-relaxed text-brand-text-muted">
                  The model was trained on approximately 475,000 historical incidents. The 5,000 reported incidents shown on this map are a representative sample of the full dataset.
                </p>
              </div>
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
            <LayerToggle icon={Layers3} label="Historical incident density" active={visibility.historicalHeatmap} onClick={() => toggleLayer("historicalHeatmap")} />
            <LayerToggle icon={MapPin} label="Incident points" active={visibility.points} onClick={() => toggleLayer("points")} />
            <LayerToggle icon={SlidersHorizontal} label="Predicted risk zones" active={visibility.riskZones} onClick={() => toggleLayer("riskZones")} />
            <LayerToggle icon={Building2} label="3D buildings" active={visibility.buildings} onClick={() => toggleLayer("buildings")} />
          </div>

          <div className="space-y-3 border-t border-brand-border pt-4">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-brand-text-muted">
              <SlidersHorizontal className="h-3.5 w-3.5" /> Heatmap tuning
            </p>
            <RangeControl label="Radius" value={radius} min={12} max={100} step={1} display={`${radius}px`} onChange={setRadius} />
            <RangeControl label="Intensity" value={intensity} min={0.5} max={3} step={0.05} display={`${intensity.toFixed(2)}×`} onChange={setIntensity} />
            <RangeControl label="Opacity" value={opacity} min={0.2} max={1} step={0.02} display={`${Math.round(opacity * 100)}%`} onChange={setOpacity} />
          </div>

          <button type="button" onClick={resetView} className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand-border bg-brand-bg px-3 py-2 text-xs font-medium text-brand-text transition-colors hover:bg-brand-card">
            <LocateFixed className="h-3.5 w-3.5" /> Reset Toronto view
          </button>
        </div>
      </section>
      )}

      {mapMode === "distress" && (
      <section className="map-analysis-panel absolute left-4 top-20 z-10 w-72 overflow-hidden rounded-2xl border border-brand-border bg-brand-panel/95 shadow-2xl backdrop-blur-md">
        <div className="border-b border-brand-border px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-brand-primary/15 p-2 text-brand-primary">
                <ShieldAlert className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-brand-text">Distress signals</h2>
                <p className="text-[11px] text-brand-text-muted">Live emergencies + resolved history</p>
              </div>
            </div>
            <span className="relative flex h-2.5 w-2.5">
              {activeDistressCount > 0 && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-primary opacity-75" />
              )}
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${activeDistressCount > 0 ? "bg-brand-primary" : "bg-brand-success"}`} />
            </span>
          </div>
        </div>

        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-brand-primary/40 bg-brand-primary/10 p-3">
              <span className="block text-lg font-semibold text-brand-primary">{activeDistressCount}</span>
              <span className="text-[10px] uppercase tracking-wider text-brand-text-muted">Active now</span>
            </div>
            <div className="rounded-xl border border-brand-border bg-brand-bg/70 p-3">
              <span className="block text-lg font-semibold text-brand-text">{pastDistressCount}</span>
              <span className="text-[10px] uppercase tracking-wider text-brand-text-muted">Resolved</span>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-brand-border bg-brand-bg/70 p-3 text-[11px] text-brand-text-muted">
            <Radio className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-primary" />
            <span>Live signals stream in from Supabase in realtime and pin to Square One. Predictions and heatmaps stay off this view.</span>
          </div>

          <button type="button" onClick={resetView} className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand-border bg-brand-bg px-3 py-2 text-xs font-medium text-brand-text transition-colors hover:bg-brand-card">
            <LocateFixed className="h-3.5 w-3.5" /> Reset Toronto view
          </button>
        </div>
      </section>
      )}

      {mapMode === "crime" ? (
        <div className="pointer-events-none absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border border-brand-border bg-brand-panel/90 px-4 py-2 shadow-xl backdrop-blur-md">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-brand-text-muted">Prediction</span>
          <div className="prediction-heatmap-legend h-2 w-28 rounded-full" />
          <div className="flex gap-3 text-[10px] text-brand-text-muted"><span>Low</span><span>High</span></div>
          <span className="h-5 w-px bg-brand-border" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-brand-text-muted">History</span>
          <div className="historical-heatmap-legend h-2 w-20 rounded-full" />
          <span className="h-5 w-px bg-brand-border" />
          <span className="risk-zone-legend h-4 w-8" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-brand-text-muted">Raised risk zone</span>
          <span className="h-5 w-px bg-brand-border" />
          <span className="incident-point-legend h-3 w-3 rounded-full" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-brand-text-muted">Reported incident</span>
        </div>
      ) : (
        <div className="pointer-events-none absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border border-brand-border bg-brand-panel/90 px-4 py-2 shadow-xl backdrop-blur-md">
          <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-brand-text-muted">
            <span className="h-2.5 w-2.5 rounded-full bg-brand-primary shadow-[0_0_8px_2px_rgba(244,63,94,0.6)]" /> Active signal
          </span>
          <span className="h-5 w-px bg-brand-border" />
          <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-brand-text-muted">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-400" /> Resolved signal
          </span>
        </div>
      )}

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
