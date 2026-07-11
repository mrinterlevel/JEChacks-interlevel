"use client";

import React, { useState } from 'react';
import { AlertCircle, Clock, MapPin, ChevronDown, ChevronUp } from 'lucide-react';

export type DistressSignal = {
  id: string;
  location_name: string;
  timestamp: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  
  // Extended fields based on Police Data Portal
  event_unique_id: string;
  report_date: string;
  occ_date: string;
  report_year: string;
  report_month: string;
  report_day: string;
  report_doy: string;
  report_dow: string;
  report_hour: string;
  occ_year: string;
  occ_month: string;
  occ_day: string;
  occ_doy: string;
  occ_dow: string;
  occ_hour: string;
  division: string;
  ucr_code: string;
  ucr_ext: string;
  offence: string;
  neighbourhood_158: string;
  hood_140: string;
  neighbourhood_140: string;
  long_wgs84: string;
  lat_wgs84: string;
};

const dummySignals: DistressSignal[] = [
  {
    id: '471792',
    location_name: 'Annex (95)',
    timestamp: '2026-03-06 12:00 AM',
    severity: 'high',
    description: 'Report of armed robbery in progress at local store.',
    event_unique_id: 'GO-2026463122',
    report_date: '3/6/26, 12:00 AM',
    occ_date: '2/19/26, 12:00 AM',
    report_year: '2026',
    report_month: 'March',
    report_day: '6',
    report_doy: '65',
    report_dow: 'Friday',
    report_hour: '13',
    occ_year: '2026',
    occ_month: 'February',
    occ_day: '19',
    occ_doy: '50',
    occ_dow: 'Thursday',
    occ_hour: '19',
    division: 'D53',
    ucr_code: '2120',
    ucr_ext: '200',
    offence: 'B&E',
    neighbourhood_158: 'Annex (95)',
    hood_140: '095',
    neighbourhood_140: 'Annex (95)',
    long_wgs84: '-79.396019',
    lat_wgs84: '43.673347',
  },
  {
    id: '471793',
    location_name: 'Church-Yonge Corridor',
    timestamp: '2026-03-05 14:30',
    severity: 'low',
    description: 'Vandalism, graffiti on public property.',
    event_unique_id: 'GO-2026463123',
    report_date: '3/5/26, 2:30 PM',
    occ_date: '3/5/26, 2:00 PM',
    report_year: '2026',
    report_month: 'March',
    report_day: '5',
    report_doy: '64',
    report_dow: 'Thursday',
    report_hour: '14',
    occ_year: '2026',
    occ_month: 'March',
    occ_day: '5',
    occ_doy: '64',
    occ_dow: 'Thursday',
    occ_hour: '14',
    division: 'D51',
    ucr_code: '1430',
    ucr_ext: '100',
    offence: 'Mischief',
    neighbourhood_158: 'Church-Yonge Corridor (75)',
    hood_140: '075',
    neighbourhood_140: 'Church-Yonge Corridor (75)',
    long_wgs84: '-79.381012',
    lat_wgs84: '43.655211',
  }
];

export default function Sidebar() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  return (
    <div className="absolute right-4 top-20 bottom-4 w-96 flex flex-col gap-4 z-10 overflow-y-auto no-scrollbar pointer-events-none">
      {dummySignals.map((signal) => {
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
