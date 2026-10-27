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
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Sparkles className="w-3 h-3" /> Keşfedildi
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <Clock className="w-3 h-3 animate-pulse" /> Eşleşme Bekliyor
          </span>
        );
      case 'assigned':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
            <Layers className="w-3 h-3" /> Atandı
          </span>
        );
      case 'active':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" /> Canlı & Aktif
          </span>
        );
    }
  };

  const isRssiGood = device.rssi ? device.rssi > -65 : true;

  return (
    <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 hover:border-cyan-500/50 dark:hover:border-cyan-500/50 rounded-2xl p-5 transition-all duration-200 hover:shadow-lg hover:shadow-cyan-950/10 flex flex-col justify-between group">
      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-cyan-500/10 dark:bg-cyan-500/15 border border-cyan-500/20 flex items-center justify-center text-cyan-600 dark:text-cyan-400 group-hover:scale-105 transition-transform shrink-0">
              <Cpu className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm leading-tight truncate flex items-center gap-1.5">
                <span>{device.hostname || 'İsimsiz IoT Düğümü'}</span>
                {device.hasAuthToken && (
                  <span title="Yetkilendirilmiş API Anahtarı Mevcut">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 inline shrink-0" />
                  </span>
                )}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5 truncate">
                {device.ip || '—'} <span className="text-slate-400 dark:text-slate-600">•</span> {device.mac || '—'}
              </p>
            </div>
          </div>
          <div className="shrink-0">{getLifecycleBadge()}</div>
        </div>

        {/* Specs & Indicators */}
        <div className="grid grid-cols-2 gap-2 text-xs mb-3.5 bg-slate-50 dark:bg-slate-950/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800/80 font-mono">
          <div>
            <span className="text-slate-400 dark:text-slate-500 block text-[10px] font-sans font-semibold uppercase tracking-wider">DONANIM MODELİ</span>
            <span className="text-slate-700 dark:text-slate-300 font-medium truncate block mt-0.5">
              {device.hardwareModel || device.vendor || 'Standart ESP32'}
            </span>
          </div>
          <div>
            <span className="text-slate-400 dark:text-slate-500 block text-[10px] font-sans font-semibold uppercase tracking-wider">YAZILIM / SÜRÜM</span>
            <span className="text-slate-700 dark:text-slate-300 font-medium truncate block mt-0.5">
              {device.firmwareVersion || 'v1.0.0-PROD'}
            </span>
          </div>
          {device.pairingCode && (
            <div className="col-span-2 pt-2 mt-1 border-t border-slate-200 dark:border-slate-800/60 flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400 text-[10px] font-sans font-semibold uppercase">GEÇİCİ EŞLEŞME KODU:</span>
              <span className="text-cyan-600 dark:text-cyan-400 font-bold tracking-widest bg-cyan-50 dark:bg-cyan-950/50 px-2.5 py-0.5 rounded-lg border border-cyan-200 dark:border-cyan-800/50 text-xs">
                {device.pairingCode}
              </span>
            </div>
          )}
        </div>

        {/* Metrics Row */}
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1 mb-3.5">
          <div className="flex items-center gap-1.5" title={`RSSI Sinyal: ${device.rssi || -60} dBm`}>
            {isRssiGood ? (
              <Wifi className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-amber-500" />
            )}
            <span className="text-[11px] font-mono">{device.rssi ? `${device.rssi} dBm` : '-55 dBm (İyi)'}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-cyan-500" />
            <span className="text-[11px] font-mono">
              {device.pingMs !== undefined ? `${device.pingMs} ms` : '< 5 ms'}
            </span>
          </div>

          {device.lastSeen && (
            <div className="text-[10px] text-slate-400 dark:text-slate-500">
              {new Date(device.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800/80">
        <button
          type="button"
          onClick={() => onPingTest(device.ip)}
          disabled={isPinging}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700/50 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {isPinging ? 'Ping...' : 'Ping Test'}
        </button>

        <button
          type="button"
          onClick={() => onSelectForPairing(device)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-md shadow-cyan-600/20 hover:shadow-cyan-500/30 transition-all cursor-pointer active:scale-95"
        >
          <span>Sihirbazda Eşleştir</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>

        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(device)}
            title="Havuzdan Kaldır / Sil"
            className="p-1.5 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 border border-transparent hover:border-rose-200 dark:hover:border-rose-500/20 transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
