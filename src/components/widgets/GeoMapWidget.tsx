import React, { useState } from 'react';
import type { WidgetConfig } from '../../types';
import { useRealtime } from '../../context/RealtimeContext';
import { MapPin, Sliders, Globe, Radio, Server, CheckCircle2 } from 'lucide-react';
import { DeviceStatusDot } from './DeviceStatusDot';

interface GeoMapWidgetProps {
  config: WidgetConfig;
  onEdit?: () => void;
}

export const GeoMapWidget: React.FC<GeoMapWidgetProps> = ({ config, onEdit }) => {
  const { devices } = useRealtime();
  const [selectedCity, setSelectedCity] = useState<string | null>(null);

  // Mock locations mapped to Turkish cities
  const cityLocations = [
    { city: 'İstanbul', lat: '41.0082', lng: '28.9784', x: 28, y: 35, count: devices.filter(d => d.location.includes('İstanbul') || d.location.includes('Maslak') || d.location.includes('Karaköy')).length || 3 },
    { city: 'Ankara', lat: '39.9334', lng: '32.8597', x: 45, y: 48, count: devices.filter(d => d.location.includes('Ankara') || d.location.includes('Odtü')).length || 2 },
    { city: 'İzmir', lat: '38.4237', lng: '27.1428', x: 18, y: 60, count: devices.filter(d => d.location.includes('İzmir') || d.location.includes('Alsancak')).length || 1 },
    { city: 'Bursa', lat: '40.1885', lng: '29.0610', x: 32, y: 42, count: devices.filter(d => d.location.includes('Bursa') || d.location.includes('Nilüfer')).length || 1 },
    { city: 'Antalya', lat: '36.8969', lng: '30.7133', x: 40, y: 78, count: devices.filter(d => d.location.includes('Antalya') || d.location.includes('Kanal')).length || 1 },
  ];

  const totalDevices = devices.length;
  const onlineDevices = devices.filter((d) => d.status === 'online').length;

  return (
    <div className="h-full bg-white dark:bg-[#0f172a] rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col justify-between transition-all">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl text-white font-bold" style={{ backgroundColor: config.colorScheme || '#06b6d4' }}>
            <Globe className="w-4 h-4" />
          </div>
          <DeviceStatusDot deviceId={config.deviceId} />
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {config.title || 'Coğrafi Saha Lokasyon Haritası'}
            </h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              Bölgesel istasyon dağılımı ve GPS sinyal durumları
            </p>
          </div>
        </div>

        {onEdit && (
          <button
            onClick={onEdit}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            title="Widget Özelleştir"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* SVG Map Canvas */}
      <div className="relative w-full h-44 bg-[#020617] rounded-2xl border border-slate-800 overflow-hidden flex items-center justify-center">
        {/* Background Grid Pattern */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `radial-gradient(#06b6d4 1px, transparent 1px)`,
            backgroundSize: '16px 16px',
          }}
        />

        {/* Turkey Map Outline / Grid Points */}
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <svg className="w-full h-full opacity-30 text-cyan-500/20" viewBox="0 0 100 100" fill="none">
            <path
              d="M10,35 Q20,25 35,30 Q50,20 70,25 Q90,30 95,50 Q85,75 60,80 Q40,85 20,70 Z"
              stroke="#06b6d4"
              strokeWidth="0.8"
              fill="#06b6d4"
              fillOpacity="0.05"
            />
          </svg>
        </div>

        {/* City Location Pins */}
        {cityLocations.map((loc) => {
          const isSelected = selectedCity === loc.city;
          return (
            <button
              key={loc.city}
              onClick={() => setSelectedCity(isSelected ? null : loc.city)}
              style={{ top: `${loc.y}%`, left: `${loc.x}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 group transition-all"
            >
              <div className="relative flex items-center justify-center">
                <span className="animate-ping absolute inline-flex h-5 w-5 rounded-full bg-cyan-400 opacity-40" />
                <div
                  className={`relative p-1.5 rounded-full border shadow-lg transition-transform ${
                    isSelected
                      ? 'bg-amber-500 border-white scale-125 z-20'
                      : 'bg-cyan-600 border-cyan-300 hover:scale-110 z-10'
                  }`}
                >
                  <MapPin className="w-3 h-3 text-white" />
                </div>
                <div className="absolute left-full ml-1.5 px-2 py-0.5 bg-slate-900/90 text-white border border-slate-700 rounded-md text-[10px] whitespace-nowrap opacity-90 group-hover:opacity-100 z-20">
                  <strong className="text-cyan-300">{loc.city}</strong> ({loc.count})
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected City Info or General Stats */}
      <div className="pt-2 text-[11px] flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-1.5 text-slate-400">
          <Server className="w-3.5 h-3.5 text-cyan-400" />
          <span>Lokasyon: <strong className="text-slate-900 dark:text-white">{selectedCity || 'Tüm Bölgeler'}</strong></span>
        </div>
        <div className="flex items-center gap-1 text-emerald-400 font-semibold">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>{onlineDevices} / {totalDevices} Aktif</span>
        </div>
      </div>
    </div>
  );
};
