import type { WidgetConfig, WidgetSpan, WidgetType, WidgetHeight } from '../types';

export interface WidgetSizeRule {
  defaultSpan: WidgetSpan;
  allowedSpans: WidgetSpan[];
  minSpan?: WidgetSpan;
  maxSpan?: WidgetSpan;
  defaultHeight: WidgetHeight;
  allowedHeights?: WidgetHeight[];
  description?: string;
}

/**
 * Standard Sizing Rules for IoT Dashboard Widgets
 * Heights:
 * H1 = 64px  (1 grid row)
 * H2 = 152px (2 grid rows: 64*2 + 24 gap)
 * H3 = 232px (3 grid rows: 64*3 + 24*2 gap)
 */
export const WIDGET_SIZE_RULES: Record<WidgetType, WidgetSizeRule> = {
  // H1 Standard Widgets (Single-row compact cards)
  metric: {
    defaultSpan: 1,
    allowedSpans: [1, 2, 3, 4],
    defaultHeight: 'H1',
    allowedHeights: ['H1', 'H2'],
    description: 'Tekli Büyük Metrik Göstergesi (H1 = 64px)',
  },
  switch_control: {
    defaultSpan: 1,
    allowedSpans: [1, 2, 3, 4],
    defaultHeight: 'H1',
    allowedHeights: ['H1', 'H2', 'H3'],
    description: 'Röle & Switch Aç/Kapat Paneli (H1 = 64px)',
  },
  button_control: {
    defaultSpan: 1,
    allowedSpans: [1, 2, 3, 4],
    defaultHeight: 'H1',
    allowedHeights: ['H1', 'H2', 'H3'],
    description: 'Dijital Buton Kontrol Paneli (H1 = 64px)',
  },
  progress_bar: {
    defaultSpan: 1,
    allowedSpans: [1, 2, 3, 4],
    defaultHeight: 'H1',
    allowedHeights: ['H1', 'H2'],
    description: 'Eşik Tolerans İlerleme Çubuğu (H1 = 64px)',
  },
  quick_access: {
    defaultSpan: 1,
    allowedSpans: [1, 2, 3, 4],
    defaultHeight: 'H1',
    allowedHeights: ['H1', 'H2', 'H3'],
    description: 'Hızlı Erişim & Sağlık Durumu (H1 = 64px)',
  },
  multi_metric: {
    defaultSpan: 2,
    allowedSpans: [1, 2, 3, 4],
    defaultHeight: 'H1',
    allowedHeights: ['H1', 'H2'],
    description: 'Çoklu Metrik Izgarası (H1 = 64px / H2 = 152px)',
  },

  // H2 Standard Widgets (Medium charts, gauges, controllers)
  gauge: {
    defaultSpan: 1,
    allowedSpans: [1, 2, 3, 4],
    defaultHeight: 'H2',
    allowedHeights: ['H2', 'H3'],
    description: 'Dairesel Gösterge / Gauge (H2 = 152px)',
  },
  slider_control: {
    defaultSpan: 1,
    allowedSpans: [1, 2, 3, 4],
    defaultHeight: 'H2',
    allowedHeights: ['H2', 'H3'],
    description: 'Analog Slider / PWM Çıkış Sürgüsü (H2 = 152px)',
  },
  power_analyzer: {
    defaultSpan: 2,
    allowedSpans: [2, 3, 4],
    defaultHeight: 'H2',
    allowedHeights: ['H2', 'H3'],
    description: 'Elektrik Sayacı & Reaktif Analizör (H2 = 152px)',
  },
  device_control: {
    defaultSpan: 2,
    allowedSpans: [2, 3, 4],
    defaultHeight: 'H2',
    allowedHeights: ['H2', 'H3'],
    description: 'Genel Cihaz Kontrol Masası (Span 2 x H2)',
  },
  line_chart: {
    defaultSpan: 2,
    allowedSpans: [1, 2, 3, 4],
    defaultHeight: 'H2',
    allowedHeights: ['H2', 'H3'],
    description: 'Çizgi Zaman Serisi Grafiği (H2 = 152px)',
  },
  area_chart: {
    defaultSpan: 2,
    allowedSpans: [1, 2, 3, 4],
    defaultHeight: 'H2',
    allowedHeights: ['H2', 'H3'],
    description: 'Alan Trend Grafiği (H2 = 152px)',
  },
  bar_chart: {
    defaultSpan: 2,
    allowedSpans: [1, 2, 3, 4],
    defaultHeight: 'H2',
    allowedHeights: ['H2', 'H3'],
    description: 'Sütun Dağılım Grafiği (H2 = 152px)',
  },
  pie_chart: {
    defaultSpan: 2,
    allowedSpans: [1, 2, 3, 4],
    defaultHeight: 'H2',
    allowedHeights: ['H2', 'H3'],
    description: 'Pasta / Donut Dağılım Grafiği (H2 = 152px)',
  },
  radar_chart: {
    defaultSpan: 2,
    allowedSpans: [1, 2, 3, 4],
    defaultHeight: 'H2',
    allowedHeights: ['H2', 'H3'],
    description: 'Çok Boyutlu Radar Grafiği (H2 = 152px)',
  },
  devices_status: {
    defaultSpan: 2,
    allowedSpans: [1, 2, 3, 4],
    defaultHeight: 'H2',
    allowedHeights: ['H2', 'H3'],
    description: 'Cihaz Durum Dağılım Izgarası (H2 = 152px)',
  },
  notifications: {
    defaultSpan: 2,
    allowedSpans: [1, 2, 3, 4],
    defaultHeight: 'H2',
    allowedHeights: ['H2', 'H3'],
    description: 'Sistem Alarmları & Bildirim Akışı (H2 = 152px)',
  },
  log_stream: {
    defaultSpan: 4,
    allowedSpans: [2, 3, 4],
    defaultHeight: 'H2',
    allowedHeights: ['H2', 'H3'],
    description: 'Canlı Ingestion Konsolu / Terminal (H2 = 152px)',
  },
  custom_panel: {
    defaultSpan: 2,
    allowedSpans: [1, 2, 3, 4],
    defaultHeight: 'H2',
    allowedHeights: ['H1', 'H2', 'H3'],
    description: 'Özel Mini-Widget Kontrol Paneli (H2 = 152px)',
  },

  // H3 Standard Widgets (Large data tables, maps, matrices)
  data_table: {
    defaultSpan: 4,
    allowedSpans: [2, 3, 4],
    defaultHeight: 'H3',
    allowedHeights: ['H2', 'H3'],
    description: 'Canlı Telemetri Tablosu (H3 = 232px)',
  },
  geo_map: {
    defaultSpan: 2,
    allowedSpans: [2, 3, 4],
    defaultHeight: 'H3',
    allowedHeights: ['H2', 'H3'],
    description: 'Coğrafi Saha Haritası (H3 = 232px)',
  },
  metric_matrix: {
    defaultSpan: 4,
    allowedSpans: [2, 3, 4],
    defaultHeight: 'H3',
    allowedHeights: ['H2', 'H3'],
    description: 'Çoklu Cihaz & Metrik Matrisi (Span 4 x H3 = 232px)',
  },
};

/**
 * Get effective widget height standard ('H1' | 'H2' | 'H3')
 */
export function getWidgetEffectiveHeight(widget: WidgetConfig): WidgetHeight {
  if (widget.height && (widget.height === 'H1' || widget.height === 'H2' || widget.height === 'H3')) {
    return widget.height;
  }
  const rule = WIDGET_SIZE_RULES[widget.type];
  return rule ? rule.defaultHeight : 'H2';
}

/**
 * Get 12-column responsive grid span class
 * Span 1: 3 cols (25%)
 * Span 2: 6 cols (50%)
 * Span 3: 9 cols (75%)
 * Span 4: 12 cols (100%)
 */
export function getWidgetSpanClass(span: WidgetSpan): string {
  switch (span) {
    case 1:
      return 'col-span-12 md:col-span-6 lg:col-span-3';
    case 2:
      return 'col-span-12 md:col-span-6 lg:col-span-6';
    case 3:
      return 'col-span-12 lg:col-span-9';
    case 4:
    default:
      return 'col-span-12';
  }
}

/**
 * Get standardized fixed height classes to prevent grid auto-growth
 * H1 = 64px
 * H2 = 152px
 * H3 = 232px
 */
export function getWidgetHeightClass(height: WidgetHeight): string {
  switch (height) {
    case 'H1':
      return 'row-span-1 h-[64px] min-h-[64px] max-h-[64px]';
    case 'H2':
      return 'row-span-2 h-[152px] min-h-[152px] max-h-[152px]';
    case 'H3':
      return 'row-span-3 h-[232px] min-h-[232px] max-h-[232px]';
    default:
      return 'row-span-2 h-[152px] min-h-[152px] max-h-[152px]';
  }
}
