"use client";

import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";

/** The two views available in the top bar. Crime map is the default. */
export type MapMode = "crime" | "distress";

export type DistressStatus = "active" | "past";

export type DistressSignal = {
  id: string; // stable unique key (Supabase UUID for live signals)
  ref: string; // human-facing reference, e.g. "SW-2026-483920"
  reporter: string;
  locationName: string;
  category: string;
  lat: number;
  lng: number;
  createdAt: string; // ISO timestamp
  status: DistressStatus;
};

/**
 * Square One Shopping Centre, Mississauga. Every distress signal that arrives
 * from Supabase is pinned here per product spec — the mobile app's raw
 * coordinates are ignored so the live demo always lights up one known place.
 */
export const SQUARE_ONE = {
  lat: 43.5931,
  lng: -79.6425,
  name: "Square One Shopping Centre",
} as const;

export const SQUARE_ONE_CENTER: [number, number] = [SQUARE_ONE.lng, SQUARE_ONE.lat];

type DistressRow = {
  id: string | number;
  created_at: string;
  lat: number | null;
  lng: number | null;
  name: string | null;
};

// Deterministic hash so a given signal id always jitters to the same spot.
function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Nudge a coordinate a few metres from an anchor so multiple signals pinned to
 * the same place (Square One) stay individually visible and clickable instead
 * of stacking on one pixel. Deterministic per seed to avoid pins jumping.
 */
function jitterAround(lat: number, lng: number, seed: string) {
  const hash = hashString(seed);
  const angle = (hash % 360) * (Math.PI / 180);
  const distance = (((hash >>> 9) % 1000) / 1000) * 0.0012; // up to ~130m
  return {
    lat: lat + Math.sin(angle) * distance,
    lng: lng + Math.cos(angle) * distance,
  };
}

function mapRowToSignal(row: DistressRow): DistressSignal {
  const id = String(row.id);
  const jittered = jitterAround(SQUARE_ONE.lat, SQUARE_ONE.lng, id);
  // Derive a clean, branded reference from the UUID so live signals read the
  // same way as historical ones instead of exposing a raw UUID.
  const ref = `SW-2026-${(hashString(id) % 900_000) + 100_000}`;
  return {
    id,
    ref,
    reporter: row.name?.trim() || "Anonymous",
    locationName: SQUARE_ONE.name,
    category: "Live distress signal",
    lat: jittered.lat,
    lng: jittered.lng,
    createdAt: row.created_at,
    status: "active",
  };
}

type Area = { name: string; lat: number; lng: number };

// Real neighbourhoods/landmarks with accurate coordinates. Fake historical
// signals anchor to one of these and jitter only ~120m, so a pin labelled
// (say) "Kensington Market" actually sits at Kensington Market.
const TORONTO_AREAS: Area[] = [
  { name: "Yonge-Dundas Square", lat: 43.6561, lng: -79.3802 },
  { name: "Kensington Market", lat: 43.6547, lng: -79.4005 },
  { name: "Distillery District", lat: 43.6503, lng: -79.3599 },
  { name: "Union Station", lat: 43.6453, lng: -79.3806 },
  { name: "St. Lawrence Market", lat: 43.6489, lng: -79.3715 },
  { name: "Nathan Phillips Square", lat: 43.6525, lng: -79.3839 },
  { name: "Entertainment District", lat: 43.6446, lng: -79.39 },
  { name: "Financial District", lat: 43.6484, lng: -79.38 },
  { name: "Chinatown", lat: 43.6529, lng: -79.3975 },
  { name: "The Annex", lat: 43.666, lng: -79.4085 },
  { name: "Yorkville", lat: 43.6708, lng: -79.39 },
  { name: "Liberty Village", lat: 43.6389, lng: -79.42 },
  { name: "Trinity Bellwoods", lat: 43.647, lng: -79.419 },
  { name: "Little Italy", lat: 43.6545, lng: -79.418 },
  { name: "Church-Wellesley Village", lat: 43.665, lng: -79.381 },
  { name: "Cabbagetown", lat: 43.6667, lng: -79.3665 },
  { name: "Regent Park", lat: 43.66, lng: -79.362 },
  { name: "Leslieville", lat: 43.663, lng: -79.33 },
  { name: "Riverdale", lat: 43.669, lng: -79.354 },
  { name: "Greektown on the Danforth", lat: 43.678, lng: -79.35 },
  { name: "The Beaches", lat: 43.6689, lng: -79.298 },
  { name: "High Park", lat: 43.6465, lng: -79.4637 },
  { name: "Roncesvalles Village", lat: 43.647, lng: -79.449 },
  { name: "Yonge & Eglinton", lat: 43.7065, lng: -79.3986 },
  { name: "North York Centre", lat: 43.7615, lng: -79.411 },
  { name: "Shops at Don Mills", lat: 43.733, lng: -79.346 },
  { name: "Scarborough Town Centre", lat: 43.7764, lng: -79.2578 },
  { name: "Islington-City Centre", lat: 43.644, lng: -79.534 },
];

// Just a few resolved signals right around the mall — enough to show a little
// past context next to the live signal, not a swarm. These are placed as a
// fixed handful (see SQUARE_ONE_CORE_COUNT), not part of the weighted pool.
const SQUARE_ONE_CORE: Area[] = [
  { name: "Square One – North Entrance", lat: 43.5943, lng: -79.6428 },
  { name: "Square One – South Entrance", lat: 43.5921, lng: -79.6423 },
  { name: "City Centre Transit Terminal", lat: 43.5921, lng: -79.6405 },
  { name: "Celebration Square", lat: 43.589, lng: -79.6441 },
];
const SQUARE_ONE_CORE_COUNT = SQUARE_ONE_CORE.length;

const MISSISSAUGA_AREAS: Area[] = [
  { name: "Port Credit", lat: 43.5556, lng: -79.5867 },
  { name: "Streetsville", lat: 43.5807, lng: -79.708 },
  { name: "Erin Mills Town Centre", lat: 43.549, lng: -79.713 },
  { name: "Meadowvale Town Centre", lat: 43.596, lng: -79.746 },
  { name: "Cooksville", lat: 43.585, lng: -79.623 },
  { name: "UTM Campus", lat: 43.549, lng: -79.662 },
  { name: "Dixie Outlet Mall", lat: 43.582, lng: -79.562 },
  { name: "Malton", lat: 43.708, lng: -79.639 },
];

// Rest of Peel Region — Brampton and Caledon.
const PEEL_AREAS: Area[] = [
  { name: "Bramalea City Centre", lat: 43.7156, lng: -79.6979 },
  { name: "Downtown Brampton", lat: 43.6853, lng: -79.7597 },
  { name: "Trinity Common", lat: 43.7486, lng: -79.7773 },
  { name: "Chinguacousy Park", lat: 43.7183, lng: -79.7486 },
  { name: "Mount Pleasant Village", lat: 43.7005, lng: -79.8218 },
  { name: "Bolton", lat: 43.876, lng: -79.737 },
  { name: "Caledon East", lat: 43.8657, lng: -79.869 },
  { name: "Southfields Village", lat: 43.753, lng: -79.772 },
];

// Weighted so incidents stay Toronto-heavy, with some elsewhere in Mississauga
// and a bit across the rest of Peel. (Square One gets only a fixed handful,
// handled separately.)
const AREA_GROUPS: Array<{ weight: number; areas: Area[] }> = [
  { weight: 76, areas: TORONTO_AREAS },
  { weight: 16, areas: MISSISSAUGA_AREAS },
  { weight: 8, areas: PEEL_AREAS },
];
const AREA_WEIGHT_TOTAL = AREA_GROUPS.reduce((sum, group) => sum + group.weight, 0);

function pickArea(rand: () => number): Area {
  let roll = rand() * AREA_WEIGHT_TOTAL;
  for (const group of AREA_GROUPS) {
    roll -= group.weight;
    if (roll < 0) return group.areas[Math.floor(rand() * group.areas.length)];
  }
  const last = AREA_GROUPS[AREA_GROUPS.length - 1];
  return last.areas[Math.floor(rand() * last.areas.length)];
}

// Crime-report categories only — no medical or "detection"-style signals.
// SafeWatch signals are user-triggered reports of criminal activity.
const PAST_CATEGORIES = [
  "Panic button pressed",
  "Harassment reported",
  "Suspicious activity",
  "Robbery alert",
  "Assault reported",
  "Missing person",
  "Break-in reported",
  "Theft reported",
  "Vandalism reported",
  "Domestic dispute",
  "Public disturbance",
  "Weapon reported",
  "Stalking reported",
  "Mugging reported",
];

const PAST_REPORTERS = [
  "M. Okafor", "S. Patel", "J. Nguyen", "R. Silva", "A. Haddad",
  "L. Thompson", "D. Correia", "Anonymous", "K. Brown", "T. Rossi",
  "P. Singh", "E. Martins", "C. Almeida", "N. Kaur", "O. Adeyemi",
  "F. Zhang", "G. Costa", "H. Ali", "I. Petrov", "B. Nakamura",
];

const PAST_COUNT = 812;

// Deterministic PRNG (mulberry32) so the generated fake data is identical on
// every render and across server/client — no duplicate keys, no jumping pins.
function mulberry32(seed: number) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildPastSignals(): DistressSignal[] {
  const rand = mulberry32(0x5afe0001);
  const now = Date.now();
  const usedRefs = new Set<number>();
  const signals: DistressSignal[] = [];

  for (let index = 0; index < PAST_COUNT; index += 1) {
    // The first few land right around Square One (a little past context beside
    // the live signal); everything else is spread across the region.
    const area =
      index < SQUARE_ONE_CORE_COUNT
        ? SQUARE_ONE_CORE[index]
        : pickArea(rand);
    const category = PAST_CATEGORIES[Math.floor(rand() * PAST_CATEGORIES.length)];
    const reporter = PAST_REPORTERS[Math.floor(rand() * PAST_REPORTERS.length)];
    const minutesAgo = 30 + Math.floor(rand() * 43_200); // up to ~30 days ago

    // Unique, proper-looking reference id, e.g. "SW-2026-483920".
    let ref = 100000 + Math.floor(rand() * 899_999);
    while (usedRefs.has(ref)) ref = 100000 + Math.floor(rand() * 899_999);
    usedRefs.add(ref);

    const signalRef = `SW-2026-${ref}`;
    signals.push({
      id: signalRef,
      ref: signalRef,
      reporter,
      locationName: area.name,
      category,
      lat: area.lat + (rand() - 0.5) * 0.0022, // ~±120m jitter — stays on-location
      lng: area.lng + (rand() - 0.5) * 0.003,
      createdAt: new Date(now - minutesAgo * 60_000).toISOString(),
      status: "past",
    });
  }

  return signals;
}

// Active first, then newest first within each group.
function sortSignals(signals: DistressSignal[]): DistressSignal[] {
  return [...signals].sort((a, b) => {
    if (a.status !== b.status) return a.status === "active" ? -1 : 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function mergeById(existing: DistressSignal[], incoming: DistressSignal[]): DistressSignal[] {
  const byId = new Map(existing.map((signal) => [signal.id, signal]));
  incoming.forEach((signal) => byId.set(signal.id, signal));
  return sortSignals([...byId.values()]);
}

/**
 * Shared source of truth for distress signals. Seeds fake historical signals,
 * loads the current ones from Supabase, and keeps a single realtime
 * subscription open so both the map and the sidebar update together on INSERT.
 */
export type DistressStore = {
  signals: DistressSignal[];
  resolveSignal: (id: string) => void;
};

export function useDistressSignals(): DistressStore {
  // Lazily seed the fake historical signals so they're present on first paint.
  // The default crime view never renders signal content, so the client-computed
  // timestamps can't cause a hydration mismatch.
  const [signals, setSignals] = useState<DistressSignal[]>(buildPastSignals);

  // Mark an active signal as resolved. Kept in local state (the Supabase table
  // has no status column) — this flips the map marker to its muted "past" style
  // and moves the card into the resolved group.
  const resolveSignal = useCallback((id: string) => {
    setSignals((prev) =>
      sortSignals(
        prev.map((signal) =>
          signal.id === id ? { ...signal, status: "past" as const } : signal,
        ),
      ),
    );
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase
      .from("distress_signals")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!mounted || !data) return;
        const live = (data as DistressRow[]).map(mapRowToSignal);
        setSignals((prev) => mergeById(prev, live));
      });

    const channel = supabase
      .channel("public:distress_signals")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "distress_signals" },
        (payload) => {
          const signal = mapRowToSignal(payload.new as DistressRow);
          setSignals((prev) => mergeById(prev, [signal]));
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return { signals, resolveSignal };
}

/** Human-friendly "3m ago" style relative time. */
export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/** Absolute clock time, e.g. "Jul 11, 2:04 PM". */
export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
