import type { WidgetConfig, WidgetSpan, WidgetType, WidgetHeight } from '../types';

export const VALID_WIDGET_TYPES: readonly WidgetType[] = [
  'line_chart',
  'area_chart',
  'bar_chart',
  'pie_chart',
  'radar_chart',
  'gauge',
  'metric',
  'multi_metric',
  'metric_matrix',
  'devices_status',
  'data_table',
  'log_stream',
  'notifications',
  'geo_map',
  'device_control',
  'button_control',
  'slider_control',
  'switch_control',
  'progress_bar',
  'custom_panel',
  'power_analyzer',
  'quick_access',
] as const;

export const DEFAULT_WIDGET_CONFIG: Partial<WidgetConfig> = {
  span: 2,
  height: 'H2',
  colorScheme: '#3b82f6',
  refreshIntervalSeconds: 5,
  timeRange: 'live',
  showGrid: true,
  showLegend: true,
  displayStyle: 'card',
};

/**
 * Validates a single widget configuration and sanitizes invalid fields.
 * Returns null if the widget is irreparably corrupted.
 */
export function validateAndSanitizeWidget(raw: any, index = 0): WidgetConfig | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `w_${Date.now()}_${index}`;
  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : `Widget ${index + 1}`;
  
  let type: WidgetType = raw.type;
  if (!type || !VALID_WIDGET_TYPES.includes(type)) {
    type = 'metric';
  }

  let span: WidgetSpan = 2;
  if (typeof raw.span === 'number' && [1, 2, 3, 4].includes(raw.span)) {
    span = raw.span as WidgetSpan;
  }

  let height: WidgetHeight | undefined = undefined;
  if (raw.height && ['H1', 'H2', 'H3'].includes(raw.height)) {
    height = raw.height as WidgetHeight;
  }

  const colorScheme = typeof raw.colorScheme === 'string' && raw.colorScheme.trim()
    ? raw.colorScheme.trim()
    : '#3b82f6';

  const sanitized: WidgetConfig = {
    ...DEFAULT_WIDGET_CONFIG,
    ...raw,
    id,
    title,
    type,
    span,
    height: height || (raw.height ? height : 'H2'),
    colorScheme,
    deviceId: typeof raw.deviceId === 'string' ? raw.deviceId : 'all',
    metricKey: typeof raw.metricKey === 'string' ? raw.metricKey : undefined,
    unit: typeof raw.unit === 'string' ? raw.unit : undefined,
    thresholdWarning: typeof raw.thresholdWarning === 'number' && !isNaN(raw.thresholdWarning) ? raw.thresholdWarning : undefined,
    thresholdCritical: typeof raw.thresholdCritical === 'number' && !isNaN(raw.thresholdCritical) ? raw.thresholdCritical : undefined,
    refreshIntervalSeconds: typeof raw.refreshIntervalSeconds === 'number' && raw.refreshIntervalSeconds > 0 ? raw.refreshIntervalSeconds : 5,
    timeRange: ['live', '1h', '24h', '7d'].includes(raw.timeRange) ? raw.timeRange : 'live',
  };

  return sanitized;
}

/**
 * Validates and sanitizes a complete layout widget array.
 */
export function validateAndSanitizeWidgets(rawWidgets: any[]): WidgetConfig[] {
  if (!Array.isArray(rawWidgets) || rawWidgets.length === 0) {
    return [];
  }

  const validWidgets: WidgetConfig[] = [];
  const seenIds = new Set<string>();

  rawWidgets.forEach((raw, idx) => {
    const validated = validateAndSanitizeWidget(raw, idx);
    if (validated) {
      // Ensure unique IDs
      if (seenIds.has(validated.id)) {
        validated.id = `${validated.id}_${idx}`;
      }
      seenIds.add(validated.id);
      validWidgets.push(validated);
    }
  });

  return validWidgets;
}
