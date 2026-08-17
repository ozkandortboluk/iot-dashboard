import React, { useState } from 'react';
import type { WidgetConfig } from '../../types';
import { useRealtime } from '../../context/RealtimeContext';
import { formatShortTime } from '../../lib/utils';
import { Terminal, Pause, Play, Trash2 } from 'lucide-react';
import { DeviceStatusDot } from './DeviceStatusDot';

interface LogStreamWidgetProps {
  config: WidgetConfig;
}

export const LogStreamWidget: React.FC<LogStreamWidgetProps> = ({ config }) => {
  const { latestTelemetry } = useRealtime();
  const [isPaused, setIsPaused] = useState(false);
  const [logs, setLogs] = useState(latestTelemetry.slice(0, 30));

  React.useEffect(() => {
    if (!isPaused) {
      setLogs(latestTelemetry.slice(0, 30));
    }
  }, [latestTelemetry, isPaused]);

  return (
    <div className="h-full bg-[#020617] text-slate-200 rounded-3xl p-6 border border-slate-800 shadow-xl flex flex-col justify-between font-mono text-xs">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <DeviceStatusDot deviceId={config.deviceId} />
          <span className="font-semibold text-slate-100 text-xs">{config.title}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`p-1 rounded text-[10px] font-sans flex items-center gap-1 px-2 ${
              isPaused ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            <span>{isPaused ? 'Devam Et' : 'Duraklat'}</span>
          </button>
          <button
            onClick={() => setLogs([])}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200"
            title="Konsolu Temizle"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Log Console Body */}
      <div className="my-2 h-44 overflow-y-auto space-y-1.5 text-[11px] font-mono pr-1">
        {logs.length === 0 ? (
          <div className="text-slate-600 text-center pt-8">Henüz paket verisi alınmadı...</div>
        ) : (
          logs.map((log, idx) => (
            <div key={`${log.id}_${idx}`} className="flex flex-col gap-0.5 hover:bg-slate-900/80 p-1.5 rounded border border-slate-800/40">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 text-[10px] shrink-0">[{formatShortTime(log.timestamp)}]</span>
                <span className="text-emerald-400 font-bold text-[10px] shrink-0">POST /api/v1/telemetry</span>
                <span className="text-cyan-300 font-semibold truncate">{log.deviceName}</span>
                <span className="ml-auto text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20 shrink-0">
                  201 OK
                </span>
              </div>
              <div className="text-[10px] text-amber-300/90 font-mono truncate pl-1 border-l-2 border-cyan-500/50">
                {log.rawPayload || `${log.deviceName}, ${log.metric}:${log.value}`}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" /> WebSocket Broadcast Active
        </span>
        <span>SSL/TLS Encryption Enabled</span>
      </div>
    </div>
  );
};
