import React from 'react';
import {
  Cpu,
  Wifi,
  WifiOff,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Layers,
  Activity,
  Trash2,
} from 'lucide-react';
import type { DiscoveredNetworkDevice } from '../../types';

interface DiscoveredDeviceCardProps {
  device: DiscoveredNetworkDevice;
  onSelectForPairing: (device: DiscoveredNetworkDevice) => void;
  onPingTest: (ip: string) => void;
  onDelete?: (device: DiscoveredNetworkDevice) => void;
  isPinging?: boolean;
}

export const DiscoveredDeviceCard: React.FC<DiscoveredDeviceCardProps> = ({
  device,
  onSelectForPairing,
  onPingTest,
  onDelete,
  isPinging = false,
}) => {
  const lifecycle = device.lifecycleState || (device.status === 'unregistered' ? 'discovered' : 'active');

  const getLifecycleBadge = () => {
    switch (lifecycle) {
      case 'discovered':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <Sparkles className="w-3 h-3" /> Keşfedildi
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-500 border border-blue-500/20">
            <Clock className="w-3 h-3 animate-pulse" /> Eşleşme Bekliyor
          </span>
        );
      case 'assigned':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-500 border border-purple-500/20">
            <Layers className="w-3 h-3" /> Atandı
          </span>
        );
      case 'active':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" /> Canlı & Aktif
          </span>
        );
    }
  };

  const isRssiGood = device.rssi ? device.rssi > -65 : true;

  return (
    <div className="bg-slate-900/70 border border-slate-800 hover:border-slate-700/80 rounded-xl p-4.5 transition-all duration-200 hover:shadow-lg hover:shadow-cyan-950/20 flex flex-col justify-between group">
      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-semibold text-slate-100 text-sm leading-tight flex items-center gap-1.5">
                {device.hostname || 'İsimsiz IoT Düğümü'}
                {device.hasAuthToken && (
                  <span title="Yetkilendirilmiş API Anahtarı Mevcut">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 inline" />
                  </span>
                )}
              </h4>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                {device.ip} <span className="text-slate-600">•</span> {device.mac}
              </p>
            </div>
          </div>
          {getLifecycleBadge()}
        </div>

        {/* Specs & Indicators */}
        <div className="grid grid-cols-2 gap-2 text-xs mb-3 bg-slate-950/50 p-2.5 rounded-lg border border-slate-800/80 font-mono">
          <div>
            <span className="text-slate-500 block text-[10px]">DONANIM MODELİ</span>
            <span className="text-slate-300 font-medium truncate block">
              {device.hardwareModel || device.vendor || 'Standart ESP32'}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">YAZILIM / SÜRÜM</span>
            <span className="text-slate-300 font-medium truncate block">
              {device.firmwareVersion || 'v1.0.0-PROD'}
            </span>
          </div>
          {device.pairingCode && (
            <div className="col-span-2 pt-1 border-t border-slate-800/60 flex items-center justify-between">
              <span className="text-slate-400 text-[10px]">GEÇİCİ EŞLEŞME KODU:</span>
              <span className="text-cyan-400 font-bold tracking-widest bg-cyan-950/50 px-2 py-0.5 rounded border border-cyan-800/50">
                {device.pairingCode}
              </span>
            </div>
          )}
        </div>

        {/* Metrics Row */}
        <div className="flex items-center justify-between text-xs text-slate-400 px-1 mb-3">
          <div className="flex items-center gap-1.5" title={`RSSI Sinyal: ${device.rssi || -60} dBm`}>
            {isRssiGood ? (
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span className="text-[11px] font-mono">{device.rssi ? `${device.rssi} dBm` : '-55 dBm (İyi)'}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[11px] font-mono">
              {device.pingMs !== undefined ? `${device.pingMs} ms` : '< 5 ms'}
            </span>
          </div>

          {device.lastSeen && (
            <div className="text-[10px] text-slate-500">
              {new Date(device.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
        <button
          type="button"
          onClick={() => onPingTest(device.ip)}
          disabled={isPinging}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 transition-colors disabled:opacity-50"
        >
          {isPinging ? 'Ping...' : 'Ping Test'}
        </button>

        <button
          type="button"
          onClick={() => onSelectForPairing(device)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-sm transition-all"
        >
          <span>Sihirbazda Eşleştir</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>

        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(device)}
            title="Havuzdan Kaldır / Sil"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
