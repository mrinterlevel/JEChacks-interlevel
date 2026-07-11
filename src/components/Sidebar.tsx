import React from 'react';
import { AlertCircle, Clock, MapPin } from 'lucide-react';

export type DistressSignal = {
  id: string;
  location_name: string;
  timestamp: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
};

const dummySignals: DistressSignal[] = [
  {
    id: '358474',
    location_name: 'Fadeeva St, 22',
    timestamp: '2023-10-26 14:30',
    severity: 'high',
    description: 'Report of armed robbery in progress at local store.',
  },
  {
    id: '352481',
    location_name: 'Chayanova St, 13/2',
    timestamp: '2023-10-26 13:15',
    severity: 'low',
    description: 'Vandalism, graffiti on public property.',
  },
  {
    id: '358475',
    location_name: 'Tverskaya St, 5',
    timestamp: '2023-10-26 12:00',
    severity: 'medium',
    description: 'Traffic accident, two vehicles involved, no injuries reported.',
  }
];

export default function Sidebar() {
  return (
    <div className="absolute right-4 top-20 bottom-4 w-96 flex flex-col gap-4 z-10 overflow-y-auto no-scrollbar pointer-events-none">
      {dummySignals.map((signal) => (
        <div 
          key={signal.id} 
          className="bg-brand-panel border border-brand-border rounded-xl p-5 shadow-2xl pointer-events-auto cursor-pointer hover:bg-brand-card transition-colors group"
        >
          <div className="flex justify-between items-start mb-3">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${
                signal.severity === 'high' ? 'bg-brand-primary' : 
                signal.severity === 'medium' ? 'bg-brand-warning' : 'bg-brand-success'
              }`} />
              <span className="text-brand-text font-bold text-lg">{signal.id}</span>
            </div>
            <div className={`px-2 py-1 rounded-full text-xs font-semibold ${
              signal.severity === 'high' ? 'bg-brand-primary/20 text-brand-primary' : 
              signal.severity === 'medium' ? 'bg-brand-warning/20 text-brand-warning' : 'bg-brand-success/20 text-brand-success'
            }`}>
              {signal.severity === 'high' ? 'Action required' : 
               signal.severity === 'medium' ? 'Monitoring' : 'Resolved'}
            </div>
          </div>
          
          <h3 className="text-brand-text text-md font-medium mb-4">{signal.location_name}</h3>
          
          <div className="flex gap-4 text-sm text-brand-text-muted mb-4">
            <div className="flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              <span>Location</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>{signal.timestamp}</span>
            </div>
          </div>

          <div className="text-sm text-brand-text-muted bg-brand-bg rounded-lg p-3 group-hover:bg-brand-border/50 transition-colors">
            {signal.description}
          </div>
          
          <div className="mt-4 flex gap-2">
            <button className="flex-1 bg-transparent border border-brand-border rounded-full py-2 text-xs font-medium text-brand-text hover:bg-brand-border transition-colors">
              View Report
            </button>
            <button className="flex-1 bg-transparent border border-brand-border rounded-full py-2 text-xs font-medium text-brand-text hover:bg-brand-border transition-colors">
              History
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
