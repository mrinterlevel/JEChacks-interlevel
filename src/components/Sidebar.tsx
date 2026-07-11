"use client";

import React from 'react';
import { Clock, MapPin, User, Hash, AlertTriangle, CheckCircle2 } from 'lucide-react';

import {
  formatRelativeTime,
  formatTimestamp,
  type DistressSignal,
  type MapMode,
} from '@/lib/distress';

export default function Sidebar({
  mapMode,
  distressSignals,
  onResolve,
}: {
  mapMode: MapMode;
  distressSignals: DistressSignal[];
  onResolve: (id: string) => void;
}) {
  // The distress feed only belongs on the distress view.
  if (mapMode !== 'distress') return null;

  const activeCount = distressSignals.filter((signal) => signal.status === 'active').length;

  return (
    <div className="absolute right-4 top-20 bottom-4 w-96 flex flex-col gap-3 z-10 overflow-y-auto no-scrollbar pointer-events-none">
      <div className="shrink-0 pointer-events-auto flex items-center justify-between rounded-xl border border-brand-border bg-brand-panel/95 px-4 py-3 shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            {activeCount > 0 && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-primary opacity-75" />
            )}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${activeCount > 0 ? 'bg-brand-primary' : 'bg-brand-success'}`} />
          </span>
          <span className="text-sm font-semibold text-brand-text">Distress signals</span>
        </div>
        <span className="text-xs text-brand-text-muted">
          <span className="font-semibold text-brand-primary">{activeCount}</span> active · {distressSignals.length} total
        </span>
      </div>

      {distressSignals.length === 0 && (
        <div className="shrink-0 pointer-events-auto rounded-xl border border-brand-border bg-brand-panel/95 px-4 py-6 text-center text-sm text-brand-text-muted shadow-2xl backdrop-blur-md">
          No distress signals to show.
        </div>
      )}

      {distressSignals.map((signal) => (
        <SignalCard key={signal.id} signal={signal} onResolve={onResolve} />
      ))}
    </div>
  );
}

// Memoized so resolving one signal doesn't re-render all ~800 cards — only the
// card whose signal object actually changed re-renders.
const SignalCard = React.memo(function SignalCard({
  signal,
  onResolve,
}: {
  signal: DistressSignal;
  onResolve: (id: string) => void;
}) {
  const isActive = signal.status === 'active';

  return (
    <div
      className={`shrink-0 pointer-events-auto flex flex-col overflow-hidden rounded-xl border shadow-2xl ${
        isActive
          ? 'border-brand-primary/70 bg-brand-panel ring-1 ring-brand-primary/40 animate-distress-enter'
          : 'border-brand-border bg-brand-panel/95'
      }`}
    >
      <div className="p-5">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              {isActive && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-primary opacity-75" />
              )}
              <span className={`relative inline-flex h-3 w-3 rounded-full ${isActive ? 'bg-brand-primary' : 'bg-brand-text-muted'}`} />
            </span>
            <span className="text-lg font-bold text-brand-text">{signal.category}</span>
          </div>
          <div className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
            isActive ? 'bg-brand-primary/20 text-brand-primary' : 'bg-brand-success/20 text-brand-success'
          }`}>
            {isActive ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
            {isActive ? 'Action required' : 'Resolved'}
          </div>
        </div>

        <h3 className="mb-4 text-md font-medium text-brand-text">{signal.locationName}</h3>

        {/* Details are shown open by default — no click required. */}
        <div className="grid grid-cols-1 gap-2 rounded-lg bg-brand-bg p-3 text-sm">
          <DetailRow icon={Clock} label="Reported">
            <span className="text-brand-text">{formatTimestamp(signal.createdAt)}</span>
            <span className="ml-2 text-brand-text-muted">({formatRelativeTime(signal.createdAt)})</span>
          </DetailRow>
          <DetailRow icon={User} label="Reporter">
            <span className="text-brand-text">{signal.reporter}</span>
          </DetailRow>
          <DetailRow icon={MapPin} label="Location">
            <span className="text-brand-text">{signal.lat.toFixed(5)}, {signal.lng.toFixed(5)}</span>
          </DetailRow>
          <DetailRow icon={Hash} label="Signal ID">
            <span className="font-mono text-xs text-brand-text-muted">{signal.ref}</span>
          </DetailRow>
        </div>

        {isActive && (
          <button
            type="button"
            onClick={() => onResolve(signal.id)}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-brand-success py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
          >
            <CheckCircle2 className="h-4 w-4" /> Resolve signal
          </button>
        )}
      </div>
    </div>
  );
});

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Clock;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 shrink-0 text-brand-text-muted" />
      <span className="w-16 shrink-0 text-xs uppercase tracking-wide text-brand-text-muted">{label}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </div>
  );
}
