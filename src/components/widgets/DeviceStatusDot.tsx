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

  const isSpecificDeviceConfigured = Boolean(device || (deviceId && deviceId !== 'all'));
  const targetDevice = device || (deviceId && deviceId !== 'all' ? devices.find((d) => d.id === deviceId || d.apiKey === deviceId) : null);
  const isMissing = isSpecificDeviceConfigured && !targetDevice;

  const isOnline = isMissing
    ? false
    : targetDevice
    ? targetDevice.status === 'online' && targetDevice.dataFlowActive !== false
    : devices.some((d) => d.status === 'online' && d.dataFlowActive !== false);

  const deviceName = isMissing
    ? `Kayıp/Silinmiş Cihaz (${deviceId})`
    : targetDevice
    ? targetDevice.name
    : 'Tüm Saha Cihazları';
  const statusLabel = isMissing
    ? 'Cihaz Bulunamadı / Silinmiş'
    : isOnline
    ? 'Çevrimiçi (Online)'
    : 'Çevrimdışı (Offline)';
  const tooltipText = `${deviceName}: ${statusLabel}`;

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
      title={tooltipText}
    >
      {isMissing ? (
        <span className="relative flex h-2.5 w-2.5 items-center justify-center" title={tooltipText}>
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500 shadow-xs shadow-amber-500/50" />
        </span>
      ) : isOnline ? (
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
