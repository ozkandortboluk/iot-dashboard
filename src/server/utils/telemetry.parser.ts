import type express from 'express';
import crypto from 'node:crypto';

export interface ParsedMetric {
  metric: string;
  value: number;
  unit: string;
}

export interface ParsedTelemetryPayload {
  token: string;
  deviceNameFromPayload: string;
  rawBodyText: string;
  metricsToProcess: ParsedMetric[];
  clientIp: string;
  mac: string;
  finalFormattedPacket: string;
}

export function getUnitForMetric(mKey: string): string {
  const lk = mKey.toLowerCase();
  if (lk.includes('sıcaklık') || lk.includes('temp')) return '°C';
  if (lk.includes('nem') || lk.includes('hum') || lk.includes('cpu') || lk.includes('memory')) return '%';
  if (lk.includes('güç') || lk.includes('power')) return 'kW';
  if (lk.includes('volt')) return 'V';
  if (lk.includes('akım') || lk.includes('amp')) return 'A';
  if (lk.includes('basınç') || lk.includes('bar')) return 'hPa';
  return 'birim';
}

export function parseTelemetryPayload(req: any): ParsedTelemetryPayload {
  const isExpressReq = req && req.headers && req.query;
  const reqHeaders = isExpressReq ? req.headers : {};
  const reqQuery = isExpressReq ? req.query : {};
  const reqBody = isExpressReq ? req.body : req; // If not Express, assume req IS the payload object

  const headerKey = (reqHeaders['x-api-key'] ||
    reqHeaders['authorization']?.replace('Bearer ', '') ||
    reqHeaders['x-token'] ||
    reqHeaders['x-device-id']) as string;

  let rawBodyText = '';
  if (typeof reqBody === 'string') {
    rawBodyText = reqBody.trim();
  } else if (Buffer.isBuffer(reqBody)) {
    rawBodyText = (reqBody as Buffer).toString('utf-8').trim();
  } else if (reqBody && typeof reqBody === 'object') {
    if (typeof reqBody.payload === 'string') rawBodyText = reqBody.payload.trim();
    else if (typeof reqBody.raw === 'string') rawBodyText = reqBody.raw.trim();
    else if (typeof reqBody.data === 'string') rawBodyText = reqBody.data.trim();
    else if (typeof reqBody.text === 'string') rawBodyText = reqBody.text.trim();
  }

  if (!rawBodyText && typeof reqQuery.data === 'string') rawBodyText = reqQuery.data.trim();
  if (!rawBodyText && typeof reqQuery.payload === 'string') rawBodyText = reqQuery.payload.trim();
  if (!rawBodyText && typeof reqQuery.raw === 'string') rawBodyText = reqQuery.raw.trim();

  // Extract Device Identifier
  const bodyObj = reqBody && typeof reqBody === 'object' && !Array.isArray(reqBody) ? reqBody : {};
  const firstArrayItem = Array.isArray(reqBody) && reqBody[0] && typeof reqBody[0] === 'object' ? reqBody[0] : {};

  let token =
    headerKey ||
    (req.query.token as string) ||
    (req.query.apiKey as string) ||
    (req.query.api_key as string) ||
    (req.query.deviceId as string) ||
    (req.query.device_id as string) ||
    bodyObj.token ||
    bodyObj.apiKey ||
    bodyObj.api_key ||
    bodyObj.deviceId ||
    bodyObj.device_id ||
    bodyObj.id ||
    firstArrayItem.token ||
    firstArrayItem.apiKey ||
    firstArrayItem.deviceId ||
    '';

  let deviceNameFromPayload =
    (req.query.deviceName as string) ||
    (req.query.name as string) ||
    (req.query.device_name as string) ||
    bodyObj.deviceName ||
    bodyObj.name ||
    bodyObj.device_name ||
    firstArrayItem.deviceName ||
    firstArrayItem.name ||
    '';

  const metricsToProcess: ParsedMetric[] = [];

  // Format 1: CSV format: "TOKEN, CİHAZ_ADI, sıcaklık:37.5, nem:85" or "CİHAZ_ADI, sıcaklık:37.5"
  if (rawBodyText && rawBodyText.includes(',')) {
    const parts = rawBodyText.split(',').map((p) => p.trim()).filter(Boolean);

    let idx = 0;
    if (parts[0] && !parts[0].includes(':')) {
      if (!token) token = parts[0];
      idx = 1;
      if (parts[1] && !parts[1].includes(':')) {
        if (!deviceNameFromPayload) deviceNameFromPayload = parts[1];
        idx = 2;
      }
    }

    for (let i = idx; i < parts.length; i++) {
      const p = parts[i];
      if (p.includes(':')) {
        const [mKey, mValStr] = p.split(':').map((s) => s.trim());
        const numVal = parseFloat(mValStr);
        if (!isNaN(numVal)) {
          metricsToProcess.push({ metric: mKey, value: numVal, unit: getUnitForMetric(mKey) });
        }
      }
    }
  }

  // Format 2: Key:Value format if single string without comma
  if (metricsToProcess.length === 0 && rawBodyText && rawBodyText.includes(':') && !rawBodyText.startsWith('{')) {
    const [mKey, mValStr] = rawBodyText.split(':').map((s) => s.trim());
    const numVal = parseFloat(mValStr);
    if (!isNaN(numVal)) {
      metricsToProcess.push({ metric: mKey, value: numVal, unit: getUnitForMetric(mKey) });
    }
  }

  // Format 3: Batch metrics dictionary
  if (bodyObj.metrics && typeof bodyObj.metrics === 'object' && !Array.isArray(bodyObj.metrics)) {
    for (const [mKey, mVal] of Object.entries(bodyObj.metrics)) {
      if (mVal !== null && typeof mVal === 'object') {
        const nestedVal = (mVal as any).value ?? (mVal as any).val ?? (mVal as any).v;
        const num = typeof nestedVal === 'number' ? nestedVal : parseFloat(String(nestedVal));
        if (!isNaN(num)) {
          metricsToProcess.push({
            metric: mKey,
            value: num,
            unit: (mVal as any).unit || (mVal as any).u || getUnitForMetric(mKey),
          });
        }
      } else if (mVal !== null && mVal !== undefined) {
        const num = typeof mVal === 'number' ? mVal : parseFloat(String(mVal));
        if (!isNaN(num)) {
          metricsToProcess.push({
            metric: mKey,
            value: num,
            unit: getUnitForMetric(mKey),
          });
        }
      }
    }
  }

  // Format 4: Batch readings array
  if (metricsToProcess.length === 0 && Array.isArray(bodyObj.readings)) {
    for (const item of bodyObj.readings) {
      if (item && typeof item === 'object') {
        const mKey = item.metric || item.name || item.key;
        const mVal = item.value ?? item.val ?? item.v;
        if (mKey && mVal !== undefined) {
          const num = typeof mVal === 'number' ? mVal : parseFloat(String(mVal));
          if (!isNaN(num)) {
            metricsToProcess.push({
              metric: String(mKey),
              value: num,
              unit: item.unit || getUnitForMetric(String(mKey)),
            });
          }
        }
      }
    }
  }

  // Format 5: Root Array of metrics
  if (metricsToProcess.length === 0 && Array.isArray(reqBody)) {
    for (const item of reqBody) {
      if (item && typeof item === 'object') {
        const mKey = item.metric || item.name || item.key;
        const mVal = item.value ?? item.val ?? item.v;
        if (mKey && mVal !== undefined) {
          const num = typeof mVal === 'number' ? mVal : parseFloat(String(mVal));
          if (!isNaN(num)) {
            metricsToProcess.push({
              metric: String(mKey),
              value: num,
              unit: item.unit || getUnitForMetric(String(mKey)),
            });
          }
        }
      }
    }
  }

  // Format 6: Standard single metric object or flat properties
  const srcObj = (reqBody && typeof reqBody === 'object' ? reqBody : reqQuery) as Record<string, any>;
  if (metricsToProcess.length === 0 && srcObj && typeof srcObj === 'object') {
    if (srcObj.metric && srcObj.value !== undefined) {
      const num = typeof srcObj.value === 'number' ? srcObj.value : parseFloat(String(srcObj.value));
      if (!isNaN(num)) {
        metricsToProcess.push({
          metric: String(srcObj.metric),
          value: num,
          unit: srcObj.unit || getUnitForMetric(String(srcObj.metric)),
        });
      }
    } else {
      for (const [k, v] of Object.entries(srcObj)) {
        if (
          [
            'token',
            'apiKey',
            'api_key',
            'deviceId',
            'device_id',
            'id',
            'deviceName',
            'name',
            'device_name',
            'mac',
            'ip',
            'payload',
            'data',
            'raw',
            'text',
            'metrics',
            'readings',
            'status',
            'timestamp',
          ].includes(k)
        )
          continue;

        if (typeof v === 'object' && v !== null) {
          const nestedVal = (v as any).value ?? (v as any).val;
          const num = typeof nestedVal === 'number' ? nestedVal : parseFloat(String(nestedVal));
          if (!isNaN(num)) {
            metricsToProcess.push({
              metric: k,
              value: num,
              unit: (v as any).unit || getUnitForMetric(k),
            });
          }
        } else {
          const num = typeof v === 'number' ? v : parseFloat(String(v));
          if (!isNaN(num)) {
            metricsToProcess.push({ metric: k, value: num, unit: getUnitForMetric(k) });
          }
        }
      }
    }
  }

  // Real Client IP & MAC Extraction (No spoofed IPs/MACs)
  const rawIpHeader = isExpressReq ? String(
    reqHeaders['x-device-ip'] || reqHeaders['x-forwarded-for'] || req.socket?.remoteAddress || ''
  ).split(',')[0].trim() : '';

  const clientIp = isExpressReq ? (reqQuery.ip || (reqBody && reqBody.ip) || rawIpHeader || req.socket?.remoteAddress || '').toString().replace('::ffff:', '').trim() : '';

  const mac = isExpressReq ? (
    (reqHeaders['x-mac-address'] as string) ||
    (reqHeaders['x-mac'] as string) ||
    (reqQuery.mac as string) ||
    (reqBody && (reqBody.mac || reqBody.macAddress)) ||
    ''
  ).toString().trim() : '';

  const finalFormattedPacket = `${token}, ${deviceNameFromPayload || token}, ${metricsToProcess.map((m) => `${m.metric}:${m.value}`).join(', ')}`;

  return {
    token,
    deviceNameFromPayload,
    rawBodyText,
    metricsToProcess,
    clientIp,
    mac,
    finalFormattedPacket,
  };
}
