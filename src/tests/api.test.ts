import { describe, it, expect } from 'vitest';
import { isSsrfSafeWebhookUrl } from '../server/routes/alarms.js';

export interface TelemetryPayload {
  deviceId: string;
  temperature?: number;
  humidity?: number;
  pressure?: number;
  voltage?: number;
  timestamp?: string;
  metadata?: Record<string, any>;
}

export function validateTelemetryPayload(body: any): { valid: boolean; error?: string; parsedReadings: { metric: string; value: number }[] } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a valid JSON object', parsedReadings: [] };
  }

  const deviceId = body.deviceId || body.id;
  if (!deviceId || typeof deviceId !== 'string') {
    return { valid: false, error: 'Missing or invalid "deviceId" parameter', parsedReadings: [] };
  }

  const readings: { metric: string; value: number }[] = [];
  const standardMetrics = ['temperature', 'humidity', 'pressure', 'voltage', 'current', 'power', 'vibration'];

  for (const metric of standardMetrics) {
    if (typeof body[metric] === 'number' && !isNaN(body[metric])) {
      readings.push({ metric, value: body[metric] });
    }
  }

  if (body.metrics && typeof body.metrics === 'object') {
    for (const [key, val] of Object.entries(body.metrics)) {
      if (typeof val === 'number' && !isNaN(val)) {
        readings.push({ metric: key, value: val });
      }
    }
  }

  if (readings.length === 0) {
    return { valid: false, error: 'At least one valid numeric metric value is required', parsedReadings: [] };
  }

  return { valid: true, parsedReadings: readings };
}

describe('IoT REST Ingestion API Validation Test Suite', () => {
  it('should accept valid multi-metric payload from ESP32 edge device', () => {
    const validBody = {
      deviceId: 'esp32-sensor-alpha',
      temperature: 24.8,
      humidity: 55.2,
      voltage: 3.3,
    };

    const result = validateTelemetryPayload(validBody);
    expect(result.valid).toBe(true);
    expect(result.parsedReadings).toHaveLength(3);
    expect(result.parsedReadings.find((r) => r.metric === 'temperature')?.value).toBe(24.8);
  });

  it('should reject payload with missing device ID', () => {
    const invalidBody = {
      temperature: 24.8,
    };

    const result = validateTelemetryPayload(invalidBody);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('deviceId');
  });

  it('should reject payload without any numeric sensor values', () => {
    const emptyMetricsBody = {
      deviceId: 'esp32-sensor-alpha',
      status: 'online',
    };

    const result = validateTelemetryPayload(emptyMetricsBody);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('numeric metric value is required');
  });

  it('should handle custom nested metrics dictionary', () => {
    const customMetricsBody = {
      deviceId: 'generator-01',
      metrics: {
        rpm: 3600,
        oil_pressure_bar: 4.2,
        coolant_temp: 78.5,
      },
    };

    const result = validateTelemetryPayload(customMetricsBody);
    expect(result.valid).toBe(true);
    expect(result.parsedReadings).toHaveLength(3);
    expect(result.parsedReadings.find((r) => r.metric === 'rpm')?.value).toBe(3600);
  });
});

describe('SSRF Webhook Validation Test Suite', () => {
  it('should accept valid external HTTPS URLs', () => {
    expect(isSsrfSafeWebhookUrl('https://api.external.com/webhook')).toBe(true);
    expect(isSsrfSafeWebhookUrl('https://google.com')).toBe(true);
    expect(isSsrfSafeWebhookUrl('https://142.250.186.46/hook')).toBe(true);
  });

  it('should reject non-HTTPS URLs', () => {
    expect(isSsrfSafeWebhookUrl('http://api.external.com/webhook')).toBe(false);
    expect(isSsrfSafeWebhookUrl('ftp://external.com')).toBe(false);
    expect(isSsrfSafeWebhookUrl('file:///etc/passwd')).toBe(false);
  });

  it('should reject localhost and loopback addresses', () => {
    expect(isSsrfSafeWebhookUrl('https://localhost/api')).toBe(false);
    expect(isSsrfSafeWebhookUrl('https://127.0.0.1/api')).toBe(false);
    expect(isSsrfSafeWebhookUrl('https://[::1]/api')).toBe(false);
  });

  it('should reject local network IPv4 ranges (10.x, 172.16-31.x, 192.168.x)', () => {
    expect(isSsrfSafeWebhookUrl('https://10.0.0.5/api')).toBe(false);
    expect(isSsrfSafeWebhookUrl('https://10.255.255.255/api')).toBe(false);
    
    expect(isSsrfSafeWebhookUrl('https://172.16.0.5/api')).toBe(false);
    expect(isSsrfSafeWebhookUrl('https://172.31.255.255/api')).toBe(false);
    // 172.32 is public
    expect(isSsrfSafeWebhookUrl('https://172.32.0.1/api')).toBe(true);
    
    expect(isSsrfSafeWebhookUrl('https://192.168.1.1/api')).toBe(false);
    expect(isSsrfSafeWebhookUrl('https://192.168.255.255/api')).toBe(false);
  });
});
