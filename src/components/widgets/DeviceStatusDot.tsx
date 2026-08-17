import React from 'react';
import { useRealtime } from '../../context/RealtimeContext';
import type { Device } from '../../types';

interface DeviceStatusDotProps {
  deviceId?: string;
  device?: Device | null;
  className?: string;
}

export const DeviceStatusDot: React.FC<DeviceStatusDotProps> = ({ deviceId, device, className = '' }) => {
  const { devices } = useRealtime();

  const targetDevice = device || (deviceId ? devices.find((d) => d.id === deviceId) : null);

  const isOnline = targetDevice
    ? targetDevice.status === 'online' && targetDevice.dataFlowActive !== false
    : devices.some((d) => d.status === 'online' && d.dataFlowActive !== false);

  const deviceName = targetDevice ? targetDevice.name : 'Saha Cihazı';
  const statusLabel = isOnline ? 'Çevrimiçi (Online)' : 'Çevrimdışı (Offline)';
  const tooltipText = `${deviceName}: ${statusLabel}`;

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
      title={tooltipText}
    >
      {isOnline ? (
        <span className="relative flex h-2.5 w-2.5 items-center justify-center">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-xs shadow-emerald-500/50" />
        </span>
      ) : (
        <span className="relative flex h-2.5 w-2.5 items-center justify-center">
          <span className="relative inline-flex h-2 w-2 rounded-full bg-slate-400 dark:bg-slate-500 shadow-xs" />
        </span>
      )}
    </div>
  );
};
