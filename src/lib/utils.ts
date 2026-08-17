// Utility functions for dashboard formatting, exports, and hashing representation

export function isInternalOrControlMetric(metricKey: string): boolean {
  if (!metricKey) return true;
  const k = metricKey.toLowerCase();
  return (
    k.includes('relay') ||
    k.includes('pwm') ||
    k.includes('out_') ||
    k.includes('output') ||
    k.includes('pin') ||
    k.includes('rssi') ||
    k.includes('ping') ||
    k.includes('ip_') ||
    k === 'ip' ||
    k === 'mac' ||
    k === 'command' ||
    k === 'token'
  );
}

export function formatDateTime(isoString: string): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

export function formatShortTime(isoString: string): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

export function formatMetricValue(value: number, unit?: string): string {
  if (value === undefined || value === null) return 'N/A';
  const formatted = typeof value === 'number' ? value.toFixed(1) : value;
  return unit ? `${formatted} ${unit}` : `${formatted}`;
}

export const COMMON_UNITS = [
  '°C', '%', 'kW', 'kWh', 'V', 'A', 'hPa', 'bar', 'psi',
  'Hz', 'mm/s', 'L/min', 'm³/h', 'ppm', 'pH', 'RPM',
  'Mbps', 'Lux', 'dB', 'kg', 'm', 'km/h', 'Nm'
];

export function getMetricUnit(metricKey: string): string {
  if (!metricKey) return 'birim';
  const k = metricKey.toLowerCase();

  if (k.includes('temp') || k.includes('sicaklik') || k.includes('heat') || k.includes('celsius')) return '°C';
  if (k.includes('hum') || k.includes('nem') || k.includes('moist') || k.includes('rutubet')) return '%';
  if (k.includes('cpu') || k.includes('ram') || k.includes('mem') || k.includes('disk') || k.includes('battery') || k.includes('pil') || k.includes('pct') || k.includes('percent') || k.includes('yuzde') || k.includes('soc') || k.includes('load') || k.includes('yuk')) return '%';
  if (k.includes('kwh') || k.includes('enerji') || k.includes('energy') || k.includes('tuketim')) return 'kWh';
  if (k.includes('power') || k.includes('guc') || k.includes('watt') || k.includes('kw')) return 'kW';
  if (k.includes('bar')) return 'bar';
  if (k.includes('psi')) return 'psi';
  if (k.includes('press') || k.includes('basinc') || k.includes('hpa')) return 'hPa';
  if (k.includes('volt') || k.includes('gerilim')) return 'V';
  if (k.includes('amp') || k.includes('akim') || k.includes('curr')) return 'A';
  if (k.includes('freq') || k.includes('frekans') || k.includes('hz')) return 'Hz';
  if (k.includes('vibrat') || k.includes('titresim') || k.includes('vibr')) return 'mm/s';
  if (k.includes('debi') || k.includes('m3/h') || k.includes('m3h')) return 'm³/h';
  if (k.includes('flow') || k.includes('akis')) return 'L/min';
  if (k.includes('co2') || k.includes('ppm') || k.includes('gas') || k.includes('gaz')) return 'ppm';
  if (k.includes('ph')) return 'pH';
  if (k.includes('rpm') || k.includes('devir') || k.includes('rotat')) return 'RPM';
  if (k.includes('noise') || k.includes('sound') || k.includes('db') || k.includes('ses')) return 'dB';
  if (k.includes('bandwidth') || k.includes('mbps') || k.includes('ag')) return 'Mbps';
  if (k.includes('lux') || k.includes('isik') || k.includes('light')) return 'Lux';
  if (k.includes('torque') || k.includes('tork') || k.includes('nm')) return 'Nm';
  if (k.includes('speed') || k.includes('hiz') || k.includes('kmh')) return 'km/h';
  if (k.includes('weight') || k.includes('agirlik') || k.includes('kg')) return 'kg';
  if (k.includes('level') || k.includes('seviye') || k.includes('mesafe')) return 'm';

  return 'birim';
}

export function exportToCSV(filename: string, rows: object[]) {
  if (!rows || !rows.length) return;
  const separator = ',';
  const keys = Object.keys(rows[0]);
  const csvContent =
    keys.join(separator) +
    '\n' +
    rows
      .map((row) => {
        return keys
          .map((k) => {
            let cell = (row as Record<string, unknown>)[k];
            if (cell === null || cell === undefined) cell = '';
            cell = String(cell).replace(/"/g, '""');
            if (String(cell).search(/("|,|\n)/g) >= 0) {
              cell = `"${cell}"`;
            }
            return cell;
          })
          .join(separator);
      })
      .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportToJSON(filename: string, data: object) {
  const jsonContent = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function generateMaskedKey(key: string): string {
  if (!key || key.length < 8) return '********';
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

export function formatRelativeTime(isoString?: string): string {
  if (!isoString) return 'Bilinmiyor';
  const time = new Date(isoString).getTime();
  if (isNaN(time)) return 'Geçersiz Tarih';
  const diffSec = Math.floor((Date.now() - time) / 1000);

  if (diffSec < 0) return 'Az önce';
  if (diffSec < 5) return 'Henüz (Canlı)';
  if (diffSec < 60) return `${diffSec} saniye önce`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} dk önce`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} saat önce`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay} gün önce`;
}

export function getStatusLabel(status: string): string {
  switch (status?.toLowerCase()) {
    case 'online':
    case 'normal':
      return 'ÇEVRİMİÇİ';
    case 'offline':
      return 'ÇEVRİMDİŞİ';
    case 'warning':
    case 'medium':
      return 'GECİKME / UYARI';
    case 'critical':
    case 'high':
      return 'KRİTİK UYARI';
    case 'maintenance':
      return 'BAKIMDA';
    default:
      return status ? status.toUpperCase() : 'BİLİNMİYOR';
  }
}

export function getStatusColor(status: string): {
  bg: string;
  text: string;
  border: string;
  dot: string;
  pulseDot: string;
} {
  switch (status?.toLowerCase()) {
    case 'online':
    case 'normal':
    case 'low':
      return {
        bg: 'bg-emerald-500/10 dark:bg-emerald-500/20',
        text: 'text-emerald-600 dark:text-emerald-400',
        border: 'border-emerald-500/30',
        dot: 'bg-emerald-500',
        pulseDot: 'bg-emerald-500 animate-ping',
      };
    case 'warning':
    case 'medium':
      return {
        bg: 'bg-amber-500/10 dark:bg-amber-500/20',
        text: 'text-amber-600 dark:text-amber-400',
        border: 'border-amber-500/30',
        dot: 'bg-amber-500',
        pulseDot: 'bg-amber-500 animate-ping',
      };
    case 'offline':
    case 'critical':
    case 'high':
      return {
        bg: 'bg-rose-500/10 dark:bg-rose-500/20',
        text: 'text-rose-600 dark:text-rose-400',
        border: 'border-rose-500/30',
        dot: 'bg-rose-500',
        pulseDot: 'bg-rose-500 opacity-30',
      };
    case 'maintenance':
    default:
      return {
        bg: 'bg-slate-500/10 dark:bg-slate-500/20',
        text: 'text-slate-600 dark:text-slate-400',
        border: 'border-slate-500/30',
        dot: 'bg-slate-400 dark:bg-slate-500',
        pulseDot: 'bg-slate-400 opacity-20',
      };
  }
}
