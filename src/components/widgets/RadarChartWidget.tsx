import React from 'react';
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
} from 'recharts';
import type { WidgetConfig } from '../../types';
import { useRealtime } from '../../context/RealtimeContext';
import { useTheme } from '../../context/ThemeContext';
import { Compass, Sliders } from 'lucide-react';
import { DeviceStatusDot } from './DeviceStatusDot';

interface RadarChartWidgetProps {
  config: WidgetConfig;
  onEdit?: () => void;
}

export const RadarChartWidget: React.FC<RadarChartWidgetProps> = ({ config, onEdit }) => {
  const { devices } = useRealtime();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Aggregate current average metrics across system
  const avgTemp = devices.reduce((acc, d) => acc + (d.metrics.temperature || 30), 0) / (devices.length || 1);
  const avgCpu = devices.reduce((acc, d) => acc + (d.metrics.cpu || 40), 0) / (devices.length || 1);
  const avgRam = devices.reduce((acc, d) => acc + (d.metrics.memory || 50), 0) / (devices.length || 1);
  const avgHumidity = devices.reduce((acc, d) => acc + (d.metrics.humidity || 55), 0) / (devices.length || 1);
  const avgPower = devices.reduce((acc, d) => acc + (d.metrics.power || 3.2) * 10, 0) / (devices.length || 1);
  const avgVoltage = devices.reduce((acc, d) => acc + (d.metrics.voltage || 220) / 2.5, 0) / (devices.length || 1);

  const radarData = [
    { subject: 'Sıcaklık (°C)', value: Math.round(avgTemp), fullMark: 100 },
    { subject: 'CPU Yükü (%)', value: Math.round(avgCpu), fullMark: 100 },
    { subject: 'RAM (MB%)', value: Math.round(avgRam), fullMark: 100 },
    { subject: 'Nem (%)', value: Math.round(avgHumidity), fullMark: 100 },
    { subject: 'Güç Endeksi', value: Math.round(avgPower), fullMark: 100 },
    { subject: 'Voltaj Seviyesi', value: Math.round(avgVoltage), fullMark: 100 },
  ];

  const color = config.colorScheme || '#ec4899';

  return (
    <div className="h-full bg-white dark:bg-[#0f172a] rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col justify-between transition-all">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl text-white font-bold" style={{ backgroundColor: color }}>
            <Compass className="w-4 h-4" />
          </div>
          <DeviceStatusDot deviceId={config.deviceId} />
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {config.title || 'Çoklu Metrik Radar Profili'}
            </h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              Sistem parametrelerinin 360° dengeli dağılım analizi
            </p>
          </div>
        </div>

        {onEdit && (
          <button
            onClick={onEdit}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            title="Widget Özelleştir"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Radar Chart */}
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
            <PolarGrid stroke={isDark ? '#334155' : '#cbd5e1'} strokeDasharray="3 3" />
            <PolarAngleAxis dataKey="subject" tick={{ fill: isDark ? '#94a3b8' : '#475569', fontSize: 10 }} />
            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: isDark ? '#64748b' : '#94a3b8', fontSize: 8 }} />
            <Radar
              name="Metrik Değeri"
              dataKey="value"
              stroke={color}
              fill={color}
              fillOpacity={0.4}
              isAnimationActive={false}
            />
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
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <div className="p-2 bg-slate-50 dark:bg-slate-900/60 rounded-2xl border border-slate-100 dark:border-slate-800/80 text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
        <span>Kritik Eşik Limiti: <strong>80 / 100</strong></span>
        <span className="text-emerald-600 dark:text-emerald-400 font-bold">Dengeli Operasyon</span>
      </div>
    </div>
  );
};
