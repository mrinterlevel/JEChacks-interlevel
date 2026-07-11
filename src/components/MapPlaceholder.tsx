import React from 'react';

export default function MapPlaceholder() {
  return (
    <div className="absolute inset-0 bg-brand-bg flex items-center justify-center">
      <div className="text-brand-text-muted text-xl font-medium tracking-wide">
        MapBox 3D Map Area Placeholder
      </div>
      
      {/* Decorative grid pattern to simulate map texture for now */}
      <div 
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(var(--color-brand-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-brand-border) 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }}
      />
    </div>
  );
}
