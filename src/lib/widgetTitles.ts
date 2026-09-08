import type { WidgetType } from '../types';

/**
 * Maps widget type and optional metric key to a human-readable, professional Turkish title.
 */
export function getWidgetTypeName(type: WidgetType): string {
  switch (type) {
    case 'area_chart':
      return 'Alan Grafiği';
    case 'line_chart':
      return 'Çizgi Grafiği';
    case 'bar_chart':
      return 'Sütun Grafiği';
    case 'pie_chart':
      return 'Pasta / Donut Dağılım';
    case 'radar_chart':
      return 'Çoklu Metrik Radar';
    case 'metric':
      return 'Tekli Metrik Göstergesi';
    case 'multi_metric':
      return 'Çoklu Metrik Kartı';
    case 'metric_matrix':
      return 'Çoklu Cihaz & Metrik Matrisi (4x8)';
    case 'gauge':
      return 'Dairesel Gösterge (Gauge)';
    case 'power_analyzer':
      return 'Elektrik Sayacı & Reaktif Analizör';
    case 'progress_bar':
      return 'Eşik Progress Çubuğu';
    case 'devices_status':
      return 'Cihaz Durum Izgarası';
    case 'geo_map':
      return 'Coğrafi Saha Haritası';
    case 'button_control':
      return 'Buton Kontrol Paneli';
    case 'slider_control':
      return 'Analog Sürgü / PWM Kontrolü';
    case 'switch_control':
      return 'Röle & Anahtar Paneli';
    case 'device_control':
      return 'Cihaz Kontrol Masası';
    case 'custom_panel':
      return 'Özel Kontrol Paneli';
    case 'data_table':
      return 'Canlı Telemetri Tablosu';
    case 'log_stream':
      return 'Ingestion Terminal Konsolu';
    case 'notifications':
      return 'Sistem Bildirim Akışı';
    case 'quick_access':
      return 'Hızlı Erişim & Alarm Merkezi';
    default:
      return 'Telemetri Widget';
  }
}

/**
 * Returns clean metric display names in Turkish
 */
export function getMetricDisplayName(metricKey: string): string {
  if (!metricKey) return '';
  const lower = metricKey.toLowerCase().trim();
  switch (lower) {
    case 'temperature':
      return 'Sıcaklık';
    case 'humidity':
      return 'Nem Oranı';
    case 'cpu':
      return 'İşlemci (CPU) Yükü';
    case 'memory':
      return 'Bellek (RAM) Kullanımı';
    case 'power':
      return 'Aktif Güç';
    case 'voltage':
      return 'Şebeke Gerilimi (Voltaj)';
    case 'pressure':
      return 'Basınç';
    case 'bandwidth':
      return 'Ağ Bant Genişliği';
    case 'flow_rate':
      return 'Akış Debisi';
    case 'rssi':
      return 'Sinyal Gücü (RSSI)';
    case 'battery':
      return 'Batarya Seviyesi';
    default:
      // Capitalize first letter
      return metricKey.charAt(0).toUpperCase() + metricKey.slice(1);
  }
}

/**
 * Computes default widget title based on type, metric, and optional counts
 */
export function getDefaultWidgetTitle(
  type: WidgetType,
  metricKey?: string,
  buttonCount?: number,
  multiMetricCount?: number
): string {
  const typeName = getWidgetTypeName(type);

  if (type === 'button_control') {
    return `${buttonCount || 1}'li Buton Kontrol Paneli`;
  }

  if (type === 'multi_metric') {
    return `${multiMetricCount || 2}'li Çoklu Metrik Kartı`;
  }

  if (type === 'slider_control') {
    return 'Analog Çıkış Sürgüsü';
  }

  if (type === 'metric_matrix') {
    return 'Çoklu Cihaz & Metrik Matrisi (4x8)';
  }

  if (type === 'custom_panel') {
    return 'Özel Kontrol Paneli';
  }

  if (type === 'power_analyzer') {
    return 'Elektrik Sayacı & Reaktif Analizör';
  }

  if (type === 'quick_access') {
    return 'Hızlı Erişim & Alarm Merkezi';
  }

  if (type === 'devices_status') {
    return 'Cihaz Durum Dağılımı';
  }

  if (type === 'geo_map') {
    return 'Coğrafi Saha Haritası';
  }

  if (type === 'data_table') {
    return 'Canlı Telemetri Tablosu';
  }

  if (type === 'log_stream') {
    return 'Ingestion Terminal Konsolu';
  }

  if (type === 'notifications') {
    return 'Sistem Bildirim Akışı';
  }

  if (type === 'device_control') {
    return 'Cihaz Kontrol Masası';
  }

  if (type === 'switch_control') {
    return 'Röle & Anahtar Paneli';
  }

  if (type === 'pie_chart' || type === 'radar_chart') {
    return typeName;
  }

  // If metricKey is present and meaningful, combine metric name with widget type
  if (metricKey) {
    const metricName = getMetricDisplayName(metricKey);
    if (type === 'metric') {
      return `${metricName} Göstergesi`;
    }
    if (type === 'gauge') {
      return `${metricName} (Gauge)`;
    }
    if (type === 'progress_bar') {
      return `${metricName} Eşik Takibi`;
    }
    return `${metricName} ${typeName}`;
  }

  return typeName;
}
