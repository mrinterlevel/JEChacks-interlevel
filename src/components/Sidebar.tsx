"use client";

import React, { useState } from 'react';
import { Clock, MapPin, ChevronDown, ChevronUp } from 'lucide-react';

import { supabase } from '@/lib/supabase';

export type DistressSignal = {
  id: string;
  location_name: string;
  timestamp: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  
  // Extended fields based on Police Data Portal (optional for live signals)
  event_unique_id?: string;
  report_date?: string;
  occ_date?: string;
  report_year?: string;
  report_month?: string;
  report_day?: string;
  report_doy?: string;
  report_dow?: string;
  report_hour?: string;
  occ_year?: string;
  occ_month?: string;
  occ_day?: string;
  occ_doy?: string;
  occ_dow?: string;
  occ_hour?: string;
  division?: string;
  ucr_code?: string;
  ucr_ext?: string;
  offence?: string;
  neighbourhood_158?: string;
  hood_140?: string;
  neighbourhood_140?: string;
  long_wgs84?: string;
  lat_wgs84?: string;
};

// ... keep dummySignals here if we still want fallback data, but let's just use state ...

export default function Sidebar({ searchQuery, mapMode }: { searchQuery: string; mapMode: 'live' | 'heatmap' }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [liveSignals, setLiveSignals] = useState<DistressSignal[]>([]);

  useEffect(() => {
    // Initial fetch
    const fetchSignals = async () => {
      const { data, error } = await supabase
        .from('distress_signals')
        .select('*')
        .order('created_at', { ascending: false });

      if (data) {
        const mapped = data.map(row => ({
          id: row.id,
          location_name: 'Live Mobile Signal',
          timestamp: new Date(row.created_at).toLocaleString(),
          severity: 'high' as const,
          description: `Emergency triggered by ${row.name || 'Anonymous'}. Coordinates: ${row.lat}, ${row.lng}`,
          event_unique_id: `LIVE-${row.id.substring(0, 8)}`,
          offence: 'Active Distress Signal',
          lat_wgs84: String(row.lat),
          long_wgs84: String(row.lng),
          report_date: new Date(row.created_at).toLocaleString()
        }));
        setLiveSignals(mapped);
      }
    };

    fetchSignals();

    // Subscribe to realtime changes
    const channel = supabase.channel('public:distress_signals')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'distress_signals' }, payload => {
        const row = payload.new;
        const newSignal: DistressSignal = {
          id: row.id,
          location_name: 'Live Mobile Signal',
          timestamp: new Date(row.created_at).toLocaleString(),
          severity: 'high',
          description: `Emergency triggered by ${row.name || 'Anonymous'}. Coordinates: ${row.lat}, ${row.lng}`,
          event_unique_id: `LIVE-${row.id.substring(0, 8)}`,
          offence: 'Active Distress Signal',
          lat_wgs84: String(row.lat),
          long_wgs84: String(row.lng),
          report_date: new Date(row.created_at).toLocaleString()
        };
        setLiveSignals(prev => [newSignal, ...prev]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (mapMode === 'heatmap') return null;

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  const filteredSignals = liveSignals.filter(signal => {
    if (!searchQuery) return true;
    const lowerQuery = searchQuery.toLowerCase();
    return (
      signal.offence.toLowerCase().includes(lowerQuery) ||
      signal.location_name.toLowerCase().includes(lowerQuery) ||
      signal.event_unique_id.toLowerCase().includes(lowerQuery) ||
      signal.description.toLowerCase().includes(lowerQuery)
    );
  });

  return (
    <div className="absolute right-4 top-20 bottom-4 w-96 flex flex-col gap-4 z-10 overflow-y-auto no-scrollbar pointer-events-none">
      {filteredSignals.map((signal) => {
        const isExpanded = expandedId === signal.id;

        return (
          <div 
            key={signal.id} 
            className="bg-brand-panel border border-brand-border rounded-xl shadow-2xl pointer-events-auto transition-colors group flex flex-col overflow-hidden"
          >
            <div className="p-5 hover:bg-brand-card cursor-pointer" onClick={() => toggleExpand(signal.id)}>
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${
                    signal.severity === 'high' ? 'bg-brand-primary' : 
                    signal.severity === 'medium' ? 'bg-brand-warning' : 'bg-brand-success'
                  }`} />
                  <span className="text-brand-text font-bold text-lg">{signal.event_unique_id}</span>
                </div>
                <div className={`px-2 py-1 rounded-full text-xs font-semibold ${
                  signal.severity === 'high' ? 'bg-brand-primary/20 text-brand-primary' : 
                  signal.severity === 'medium' ? 'bg-brand-warning/20 text-brand-warning' : 'bg-brand-success/20 text-brand-success'
                }`}>
                  {signal.severity === 'high' ? 'Action required' : 
                  signal.severity === 'medium' ? 'Monitoring' : 'Resolved'}
                </div>
              </div>
              
              <h3 className="text-brand-text text-md font-medium mb-4">{signal.offence} - {signal.location_name}</h3>
              
              <div className="flex gap-4 text-sm text-brand-text-muted mb-4">
                <div className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  <span>{signal.division}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  <span>{signal.report_date}</span>
                </div>
              </div>

              <div className="text-sm text-brand-text-muted bg-brand-bg rounded-lg p-3 group-hover:bg-brand-border/50 transition-colors">
                {signal.description}
              </div>
              
              <div className="mt-4 flex gap-2">
                <button 
                  onClick={(e) => { e.stopPropagation(); toggleExpand(signal.id); }}
                  className="flex-1 flex items-center justify-center gap-2 bg-brand-bg border border-brand-border rounded-full py-2 text-xs font-medium text-brand-text hover:bg-brand-border transition-colors"
                >
                  {isExpanded ? (
                    <>Hide Details <ChevronUp className="w-3 h-3" /></>
                  ) : (
                    <>View Full Details <ChevronDown className="w-3 h-3" /></>
                  )}
                </button>
              </div>
            </div>

            {/* Expanded Content Area */}
            {isExpanded && (
              <div className="bg-brand-bg p-5 border-t border-brand-border overflow-y-auto max-h-64 text-sm">
                <table className="w-full text-left border-collapse">
                  <tbody>
                    <tr className="border-b border-brand-border/50">
                      <td className="py-2 text-brand-text-muted">OBJECTID</td>
                      <td className="py-2 text-brand-text">{signal.id}</td>
                    </tr>
                    <tr className="border-b border-brand-border/50">
                      <td className="py-2 text-brand-text-muted">EVENT_UNIQUE_ID</td>
                      <td className="py-2 text-brand-text font-medium">{signal.event_unique_id}</td>
                    </tr>
                    <tr className="border-b border-brand-border/50">
                      <td className="py-2 text-brand-text-muted">REPORT_DATE</td>
                      <td className="py-2 text-brand-text">{signal.report_date}</td>
                    </tr>
                    <tr className="border-b border-brand-border/50">
                      <td className="py-2 text-brand-text-muted">OCC_DATE</td>
                      <td className="py-2 text-brand-text">{signal.occ_date}</td>
                    </tr>
                    <tr className="border-b border-brand-border/50">
                      <td className="py-2 text-brand-text-muted">REPORT_YEAR</td>
                      <td className="py-2 text-brand-text">{signal.report_year}</td>
                    </tr>
                    <tr className="border-b border-brand-border/50">
                      <td className="py-2 text-brand-text-muted">REPORT_MONTH</td>
                      <td className="py-2 text-brand-text">{signal.report_month}</td>
                    </tr>
                    <tr className="border-b border-brand-border/50">
                      <td className="py-2 text-brand-text-muted">REPORT_DAY</td>
                      <td className="py-2 text-brand-text">{signal.report_day}</td>
                    </tr>
                    <tr className="border-b border-brand-border/50">
                      <td className="py-2 text-brand-text-muted">REPORT_DOW</td>
                      <td className="py-2 text-brand-text">{signal.report_dow}</td>
                    </tr>
                    <tr className="border-b border-brand-border/50">
                      <td className="py-2 text-brand-text-muted">OCC_YEAR</td>
                      <td className="py-2 text-brand-text">{signal.occ_year}</td>
                    </tr>
                    <tr className="border-b border-brand-border/50">
                      <td className="py-2 text-brand-text-muted">OCC_MONTH</td>
                      <td className="py-2 text-brand-text">{signal.occ_month}</td>
                    </tr>
                    <tr className="border-b border-brand-border/50">
                      <td className="py-2 text-brand-text-muted">DIVISION</td>
                      <td className="py-2 text-brand-text">{signal.division}</td>
                    </tr>
                    <tr className="border-b border-brand-border/50">
                      <td className="py-2 text-brand-text-muted">UCR_CODE</td>
                      <td className="py-2 text-brand-text">{signal.ucr_code}</td>
                    </tr>
                    <tr className="border-b border-brand-border/50">
                      <td className="py-2 text-brand-text-muted">OFFENCE</td>
                      <td className="py-2 text-brand-text">{signal.offence}</td>
                    </tr>
                    <tr className="border-b border-brand-border/50">
                      <td className="py-2 text-brand-text-muted">NEIGHBOURHOOD_158</td>
                      <td className="py-2 text-brand-text">{signal.neighbourhood_158}</td>
                    </tr>
                    <tr className="border-b border-brand-border/50">
                      <td className="py-2 text-brand-text-muted">LONG_WGS84</td>
                      <td className="py-2 text-brand-text">{signal.long_wgs84}</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-brand-text-muted">LAT_WGS84</td>
                      <td className="py-2 text-brand-text">{signal.lat_wgs84}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
