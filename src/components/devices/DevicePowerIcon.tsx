import React from 'react';
import { Battery, BatteryFull, BatteryMedium, BatteryLow, BatteryWarning, Plug } from 'lucide-react';
import { Device } from '../../types';

interface Props {
  device: Device;
}

export const DevicePowerIcon: React.FC<Props> = ({ device }) => {
  // Check if device is battery powered either by explicit powerSource, batteryLevel,
  // OR if any metric key in device.metrics contains 'battery', 'mybattery', 'pil', 'bat'
  const metricBatteryKey = device.metrics
    ? Object.keys(device.metrics).find((k) => {
        const lk = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        return (
          lk === 'mybattery' ||
          lk.includes('mybattery') ||
          lk.includes('battery') ||
          lk.includes('batterylevel') ||
          lk.includes('pil') ||
          lk === 'bat' ||
          lk === 'vbat'
        );
      })
    : undefined;

  const isBattery =
    device.powerSource === 'battery' ||
    device.batteryLevel !== undefined ||
    Boolean(metricBatteryKey);

  if (isBattery) {
    let level = device.batteryLevel;
    if (level === undefined && metricBatteryKey && device.metrics) {
      const rawVal = Number(device.metrics[metricBatteryKey]);
      if (!isNaN(rawVal)) {
        if (rawVal >= 2.5 && rawVal <= 4.5) {
          level = Math.max(0, Math.min(100, Math.round(((rawVal - 3.0) / 1.2) * 100)));
        } else {
          level = Math.max(0, Math.min(100, Math.round(rawVal)));
        }
      }
    }

    const finalLevel = level !== undefined ? Math.max(0, Math.min(100, Math.round(level))) : 100;
    let Icon = Battery;
    let colorClass = 'text-emerald-500';
    let bgClass = 'bg-emerald-500/10 border-emerald-500/20';

    if (finalLevel > 80) {
      Icon = BatteryFull;
    } else if (finalLevel > 40) {
      Icon = BatteryMedium;
      colorClass = 'text-amber-500';
      bgClass = 'bg-amber-500/10 border-amber-500/20';
    } else if (finalLevel > 15) {
      Icon = BatteryLow;
      colorClass = 'text-orange-500';
      bgClass = 'bg-orange-500/10 border-orange-500/20';
    } else {
      Icon = BatteryWarning;
      colorClass = 'text-rose-500';
      bgClass = 'bg-rose-500/10 border-rose-500/20';
    }

    return (
      <span
        className={`px-1.5 py-0.5 border text-[9px] font-bold rounded shrink-0 flex items-center gap-1 ${bgClass} ${colorClass}`}
        title={`Pilli Cihaz (Pil Seviyesi: %${finalLevel})`}
      >
        <Icon className="w-3 h-3" />
        <span>%{finalLevel}</span>
      </span>
    );
  }

  // Mains powered
  return (
    <span
      className="px-1.5 py-0.5 bg-slate-500/10 text-slate-400 border border-slate-500/20 text-[9px] font-bold rounded shrink-0 flex items-center gap-1"
      title="Sürekli Güç (Fişe Takılı)"
    >
      <Plug className="w-3 h-3" />
    </span>
  );
};
