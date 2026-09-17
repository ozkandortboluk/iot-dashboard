import React from 'react';
import type { WidgetConfig } from '../../types';
import { useRealtime } from '../../context/RealtimeContext';
import { getStatusColor, generateMaskedKey, getStatusLabel, formatRelativeTime } from '../../lib/utils';
import { Cpu, Server, Radio, Shield, Copy, Check } from 'lucide-react';
import { DeviceStatusDot } from './DeviceStatusDot';
import { DevicePowerIcon } from '../devices/DevicePowerIcon';

interface DevicesWidgetProps {
  config: WidgetConfig;
}

export const DevicesWidget: React.FC<DevicesWidgetProps> = ({ config }) => {
  const { devices } = useRealtime();
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  const handleCopy = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const onlineCount = devices.filter((d) => d.status === 'online').length;

  return (
    <div className="h-full bg-white dark:bg-[#0f172a] rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xl hover:shadow-2xl transition-all flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Cpu className="w-4 h-4 text-purple-400" />
          </div>
          <DeviceStatusDot deviceId={config.deviceId} />
          <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            {config.title}
          </h3>
        </div>
        <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          {onlineCount}/{devices.length} Çevrimiçi
        </span>
      </div>

      {/* Device List */}
      <div className="space-y-2.5 overflow-y-auto max-h-60 pr-1">
        {devices.map((dev, idx) => {
          const colors = getStatusColor(dev.status);
          return (
            <div
              key={`${dev.id}_${idx}`}
              className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  {dev.status === 'online' && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  )}
                  <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${colors.dot}`}></span>
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-white truncate">{dev.name}</p>
                    <DevicePowerIcon device={dev} />
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    <span>{dev.location}</span>
                    <span>•</span>
                    <span className="font-mono">{dev.ipAddress}</span>
                    <span>•</span>
                    <span className={dev.status === 'online' ? 'text-emerald-500 font-medium' : 'text-rose-400'}>
                      {formatRelativeTime(dev.lastSeen)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${colors.bg} ${colors.text} ${colors.border}`}>
                  {getStatusLabel(dev.status)}
                </span>

                {/* API Key Copy */}
                <button
                  onClick={() => handleCopy(dev.apiKey)}
                  className="flex items-center gap-1 px-2 py-1 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-[10px] font-mono text-slate-600 dark:text-slate-300 rounded border border-slate-200 dark:border-slate-600 shrink-0 transition-colors"
                  title="API Key Kopyala"
                >
                  <Shield className="w-3 h-3 text-blue-500" />
                  <span>{generateMaskedKey(dev.apiKey)}</span>
                  {copiedKey === dev.apiKey ? (
                    <Check className="w-3 h-3 text-emerald-500" />
                  ) : (
                    <Copy className="w-3 h-3 text-slate-400" />
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
