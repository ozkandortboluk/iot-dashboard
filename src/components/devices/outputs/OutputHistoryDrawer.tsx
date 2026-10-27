import React from 'react';
import { Clock, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { DeviceCommand } from '../../../types';

interface OutputHistoryDrawerProps {
  recentCommands: DeviceCommand[];
  loadingHistory: boolean;
  onRefresh: () => void;
}

export const OutputHistoryDrawer: React.FC<OutputHistoryDrawerProps> = ({
  recentCommands,
  loadingHistory,
  onRefresh,
}) => {
  return (
    <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3 animate-fade-in">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
          <Clock className="w-4 h-4 text-cyan-500" />
          <span>Gerçek Zamanlı Çıkış Komut & ACK Geçmişi ({recentCommands.length})</span>
        </h4>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loadingHistory}
          className="p-1 text-slate-400 hover:text-indigo-500 transition cursor-pointer"
          title="Geçmişi Yenile"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {recentCommands.length === 0 ? (
        <p className="text-xs text-slate-400 italic py-2">
          Henüz bu cihaz için kayıtlı bir komut geçmişi bulunmuyor.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-100 dark:bg-slate-900/80 text-slate-500 dark:text-slate-400 text-[11px] border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="p-2.5 font-bold">Komut ID</th>
                <th className="p-2.5 font-bold">Çıkış / Tür</th>
                <th className="p-2.5 font-bold">Değer</th>
                <th className="p-2.5 font-bold">Durum (ACK)</th>
                <th className="p-2.5 font-bold">Gecikme</th>
                <th className="p-2.5 font-bold">Zaman</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-slate-950">
              {recentCommands.map((cmd) => {
                const status = cmd.status;
                const isExec = status === 'executed' || status === 'acknowledged';
                const isFail = status === 'failed' || status === 'expired' || status === 'cancelled';

                return (
                  <tr key={cmd.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                    <td className="p-2.5 font-bold text-indigo-600 dark:text-indigo-400">
                      {cmd.id.substring(0, 12)}...
                    </td>
                    <td className="p-2.5 text-slate-800 dark:text-slate-200">
                      {cmd.outputId || cmd.commandType || cmd.command}
                    </td>
                    <td className="p-2.5 font-bold text-slate-900 dark:text-white">
                      {String(cmd.value !== undefined ? cmd.value : cmd.payload || '')}
                    </td>
                    <td className="p-2.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${
                          isExec
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                            : isFail
                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                            : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 animate-pulse'
                        }`}
                      >
                        {isExec ? (
                          <CheckCircle2 className="w-2.5 h-2.5" />
                        ) : isFail ? (
                          <AlertTriangle className="w-2.5 h-2.5" />
                        ) : (
                          <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                        )}
                        <span>
                          {status === 'executed'
                            ? 'YÜRÜTÜLDÜ (ACK)'
                            : status === 'acknowledged'
                            ? 'ALINDI'
                            : status === 'pending'
                            ? 'KUYRUKTA'
                            : status === 'sent' || status === 'delivered'
                            ? 'İLETİLDİ'
                            : status === 'failed'
                            ? 'BAŞARISIZ'
                            : status.toUpperCase()}
                        </span>
                      </span>
                    </td>
                    <td className="p-2.5 text-slate-400 text-[11px]">
                      {cmd.executionLatencyMs ? `${cmd.executionLatencyMs}ms` : '—'}
                    </td>
                    <td className="p-2.5 text-slate-400 text-[10px]">
                      {new Date(cmd.created_at || (cmd as any).createdAt || Date.now()).toLocaleTimeString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
