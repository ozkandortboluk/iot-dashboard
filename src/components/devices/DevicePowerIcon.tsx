import React from 'react';
import { Battery, BatteryFull, BatteryMedium, BatteryLow, BatteryWarning, Plug } from 'lucide-react';
import { Device } from '../../types';

interface Props {
  device: Device;
}

export const DevicePowerIcon: React.FC<Props> = ({ device }) => {
  if (device.powerSource === 'battery' || device.batteryLevel !== undefined) {
    const level = device.batteryLevel ?? 100;
    let Icon = Battery;
    let colorClass = 'text-emerald-500';
    let bgClass = 'bg-emerald-500/10 border-emerald-500/20';

    if (level > 80) {
      Icon = BatteryFull;
    } else if (level > 40) {
      Icon = BatteryMedium;
      colorClass = 'text-amber-500';
      bgClass = 'bg-amber-500/10 border-amber-500/20';
    } else if (level > 15) {
      Icon = BatteryLow;
      colorClass = 'text-orange-500';
      bgClass = 'bg-orange-500/10 border-orange-500/20';
    } else {
      Icon = BatteryWarning;
      colorClass = 'text-rose-500';
      bgClass = 'bg-rose-500/10 border-rose-500/20';
    }

    return (
      <span className={`px-1.5 py-0.5 border text-[9px] font-bold rounded shrink-0 flex items-center gap-1 ${bgClass} ${colorClass}`} title={`Pil Seviyesi: %${level}`}>
        <Icon className="w-3 h-3" />
        <span>%{level}</span>
      </span>
    );
  }

  // Mains powered
  return (
    <span className="px-1.5 py-0.5 bg-slate-500/10 text-slate-400 border border-slate-500/20 text-[9px] font-bold rounded shrink-0 flex items-center gap-1" title="Sürekli Güç (Fişe Takılı)">
      <Plug className="w-3 h-3" />
    </span>
  );
};
