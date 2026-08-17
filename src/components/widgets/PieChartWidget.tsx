import React, { useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import type { WidgetConfig } from '../../types';
import { useRealtime } from '../../context/RealtimeContext';
import { useTheme } from '../../context/ThemeContext';
import { PieChart as PieIcon, Sliders } from 'lucide-react';
import { DeviceStatusDot } from './DeviceStatusDot';

interface PieChartWidgetProps {
  config: WidgetConfig;
  onEdit?: () => void;
}

export const PieChartWidget: React.FC<PieChartWidgetProps> = ({ config, onEdit }) => {
  const { devices } = useRealtime();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [isDonut, setIsDonut] = useState(true);

  // Calculate status breakdown or metric breakdown
  const onlineCount = devices.filter((d) => d.status === 'online').length;
  const warningCount = devices.filter((d) => d.status === 'warning').length;
  const offlineCount = devices.filter((d) => d.status === 'offline').length;
  const maintenanceCount = devices.filter((d) => d.status === 'maintenance').length;

  const data = [
    { name: 'Çevrimiçi (Online)', value: onlineCount || 4, color: '#10b981' },
    { name: 'Uyarı (Warning)', value: warningCount || 2, color: '#f59e0b' },
    { name: 'Çevrimdışı (Offline)', value: offlineCount || 1, color: '#ef4444' },
    { name: 'Bakım (Maintenance)', value: maintenanceCount || 1, color: '#6b7280' },
  ];

  const total = data.reduce((acc, curr) => acc + curr.value, 0);

  return (
    <div className={`h-full bg-white dark:bg-[#0f172a] rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col justify-between transition-all ${
      config.displayStyle === 'neon' ? 'ring-1 ring-cyan-500/50 shadow-cyan-500/10' : ''
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className="p-2 rounded-xl text-white font-bold"
            style={{ backgroundColor: config.colorScheme || '#8b5cf6' }}
          >
            <PieIcon className="w-4 h-4" />
          </div>
          <DeviceStatusDot deviceId={config.deviceId} />
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {config.title || 'Cihaz Durum Dağılımı'}
            </h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              Toplam {total} cihazın sağlık ve bağlantı durumu
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsDonut(!isDonut)}
            className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-[10px] font-semibold text-slate-600 dark:text-slate-300"
          >
            {isDonut ? 'Pasta' : 'Halka'}
          </button>
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
      </div>

      {/* Chart */}
      <div className="h-48 w-full relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={isDonut ? 50 : 0}
              outerRadius={75}
              paddingAngle={4}
              dataKey="value"
              isAnimationActive={false}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} stroke={isDark ? '#0f172a' : '#ffffff'} strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: isDark ? '#020617' : '#ffffff',
                borderColor: isDark ? '#1e293b' : '#e2e8f0',
                borderRadius: '12px',
                fontSize: '11px',
                color: isDark ? '#ffffff' : '#0f172a',
                boxShadow: isDark ? '0 10px 25px -5px rgba(0,0,0,0.5)' : '0 10px 25px -5px rgba(0,0,0,0.1)',
              }}
            />
          </PieChart>
        </ResponsiveContainer>

        {isDonut && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-lg font-extrabold text-slate-900 dark:text-white">{total}</span>
            <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Cihaz</span>
          </div>
        )}
      </div>

      {/* Legend / Breakdown Grid */}
      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
        {data.map((item) => (
          <div key={item.name} className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/60 p-2 rounded-xl border border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center gap-1.5 truncate">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-slate-600 dark:text-slate-300 font-medium truncate">{item.name.split(' ')[0]}</span>
            </div>
            <span className="font-bold text-slate-900 dark:text-white ml-1">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
