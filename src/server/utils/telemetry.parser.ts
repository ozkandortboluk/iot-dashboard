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
  sequence?: number;
  rawBodyText: string;
  metricsToProcess: ParsedMetric[];
  clientIp: string;
  mac: string;
  finalFormattedPacket: string;
}

export interface PacketAck {
  status: 'accepted' | 'duplicate_skipped' | 'queued' | 'failed';
  packetId: string;
  received: number;
  persisted: number;
  queued: number;
  engine?: string;
  deviceId?: string;
  error?: string;
}

export function buildPacketAck(params: {
  sequence?: number;
  receivedCount: number;
  addedReadingsCount: number;
  writeAck: {
    persisted: boolean;
    engine: string;
    persistedCount: number;
    queuedForRetryCount: number;
    status: string;
  };
  deviceId?: string;
  error?: string;
}): PacketAck {
  const { sequence, receivedCount, addedReadingsCount, writeAck, deviceId, error } = params;

  const packetId =
    sequence !== undefined && sequence !== null
      ? String(sequence)
      : `pkt_${Date.now()}`;

  let status: 'accepted' | 'duplicate_skipped' | 'queued' | 'failed' = 'accepted';

  if (error) {
    status = 'failed';
  } else if (!writeAck.persisted && writeAck.queuedForRetryCount > 0) {
    status = 'queued';
  } else if (writeAck.persisted && receivedCount > 0 && addedReadingsCount === 0) {
    status = 'duplicate_skipped';
  } else if (writeAck.persisted) {
    status = 'accepted';
  }

  return {
    status,
    packetId,
    received: receivedCount,
    persisted: writeAck.persisted ? writeAck.persistedCount : 0,
    queued: writeAck.queuedForRetryCount || 0,
    engine: writeAck.engine,
    deviceId,
    ...(error ? { error } : {}),
  };
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

export function parseProductionTelemetryPayload(req: any): ParsedTelemetryPayload {
  const isExpressReq = req && req.headers;
  const reqHeaders = isExpressReq ? req.headers : {};
  const reqBody = isExpressReq ? req.body : req;

  const headerKey = (reqHeaders['x-api-key'] ||
    reqHeaders['authorization']?.replace('Bearer ', '') ||
    reqHeaders['x-device-token'] ||
    reqHeaders['x-device-key'] ||
    reqHeaders['x-device-id']) as string;

  const bodyObj = reqBody && typeof reqBody === 'object' && !Array.isArray(reqBody) ? reqBody : {};

  // Extract Device Identifier (Header X-API-Key or deviceId in JSON body)
  const token =
    (headerKey ? headerKey.trim() : '') ||
    bodyObj.deviceId ||
    bodyObj.device_id ||
    bodyObj.apiKey ||
    bodyObj.api_key ||
    '';

  const deviceNameFromPayload = bodyObj.deviceName || bodyObj.device_name || '';

  // Extract Sequence Number
  let sequence: number | undefined = undefined;
  const rawSeq = bodyObj.sequence ?? bodyObj.seq ?? bodyObj.packetId;
  if (rawSeq !== undefined && rawSeq !== null) {
    const parsedSeq = typeof rawSeq === 'number' ? rawSeq : parseInt(String(rawSeq), 10);
    if (!isNaN(parsedSeq)) {
      sequence = parsedSeq;
    }
  }

  const metricsToProcess: ParsedMetric[] = [];

  // Production Standard Format 1: "metrics" object
  // {
  //   "deviceId": "NEXUS_DEV_982341",
  //   "sequence": 10021,
  //   "metrics": {
  //     "temperature": { "value": 23.4, "unit": "C" },
  //     "humidity": 55.2
  //   }
  // }
  if (bodyObj.metrics && typeof bodyObj.metrics === 'object' && !Array.isArray(bodyObj.metrics)) {
    for (const [mKey, mVal] of Object.entries(bodyObj.metrics)) {
      if (mVal !== null && typeof mVal === 'object') {
        const nestedVal = (mVal as any).value ?? (mVal as any).val;
        const num = typeof nestedVal === 'number' ? nestedVal : parseFloat(String(nestedVal));
        if (!isNaN(num)) {
          metricsToProcess.push({
            metric: mKey,
            value: num,
            unit: (mVal as any).unit || getUnitForMetric(mKey),
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

  // Production Standard Format 2: "readings" structured array
  // {
  //   "deviceId": "NEXUS_DEV_982341",
  //   "sequence": 10021,
  //   "readings": [ { "metric": "temperature", "value": 23.4, "unit": "C" } ]
  // }
  if (metricsToProcess.length === 0 && Array.isArray(bodyObj.readings)) {
    for (const item of bodyObj.readings) {
      if (item && typeof item === 'object') {
        const mKey = item.metric || item.name;
        const mVal = item.value;
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

  // Extract Client IP (Strict Proxy / Nginx Trust: Only use Express req.ip, X-Forwarded-For set by proxy, or socket address)
  // NEVER trust spoofed x-device-ip, reqBody.ip, or req.query.ip from client!
  const clientIp = isExpressReq
    ? (
        req.ip ||
        (reqHeaders['x-forwarded-for'] ? String(reqHeaders['x-forwarded-for']).split(',')[0].trim() : '') ||
        req.socket?.remoteAddress ||
        ''
      )
        .toString()
        .replace('::ffff:', '')
        .trim()
    : '';

  const mac = isExpressReq
    ? (
        (reqHeaders['x-mac-address'] as string) ||
        (reqHeaders['x-mac'] as string) ||
        (reqBody && (reqBody.mac || reqBody.macAddress)) ||
        ''
      ).toString().trim()
    : '';

  const rawBodyText = typeof reqBody === 'string' ? reqBody : JSON.stringify(bodyObj);
  const finalFormattedPacket = `${token}, ${deviceNameFromPayload || token}, ${metricsToProcess
    .map((m) => `${m.metric}:${m.value}`)
    .join(', ')}`;

  return {
    token,
    deviceNameFromPayload,
    sequence,
    rawBodyText,
    metricsToProcess,
    clientIp,
    mac,
    finalFormattedPacket,
  };
}

export function parseLegacyTelemetryPayload(req: any): ParsedTelemetryPayload {
  const isExpressReq = req && req.headers;
  const reqHeaders = isExpressReq ? req.headers : {};
  const reqBody = isExpressReq ? req.body : req;

  const headerKey = (reqHeaders['x-api-key'] ||
    reqHeaders['authorization']?.replace('Bearer ', '') ||
    reqHeaders['x-token'] ||
    reqHeaders['x-device-token'] ||
    reqHeaders['x-device-key'] ||
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

  const bodyObj = reqBody && typeof reqBody === 'object' && !Array.isArray(reqBody) ? reqBody : {};
  const firstArrayItem = Array.isArray(reqBody) && reqBody[0] && typeof reqBody[0] === 'object' ? reqBody[0] : {};

  let token =
    (headerKey ? headerKey.trim() : '') ||
    bodyObj.apiKey ||
    bodyObj.api_key ||
    bodyObj.deviceId ||
    bodyObj.device_id ||
    bodyObj.token ||
    bodyObj.id ||
    firstArrayItem.apiKey ||
    firstArrayItem.deviceId ||
    firstArrayItem.token ||
    '';

  let deviceNameFromPayload =
    bodyObj.deviceName ||
    bodyObj.name ||
    bodyObj.device_name ||
    firstArrayItem.deviceName ||
    firstArrayItem.name ||
    '';

  let sequence: number | undefined = undefined;
  const rawSeq =
    bodyObj.sequence ??
    bodyObj.seq ??
    bodyObj.packetId ??
    bodyObj.packet_id ??
    firstArrayItem.sequence ??
    firstArrayItem.seq;

  if (rawSeq !== undefined && rawSeq !== null) {
    const parsedSeq = typeof rawSeq === 'number' ? rawSeq : parseInt(String(rawSeq), 10);
    if (!isNaN(parsedSeq)) {
      sequence = parsedSeq;
    }
  }

  const metricsToProcess: ParsedMetric[] = [];

  // CSV format
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

  // Key:Value format
  if (metricsToProcess.length === 0 && rawBodyText && rawBodyText.includes(':') && !rawBodyText.startsWith('{')) {
    const [mKey, mValStr] = rawBodyText.split(':').map((s) => s.trim());
    const numVal = parseFloat(mValStr);
    if (!isNaN(numVal)) {
      metricsToProcess.push({ metric: mKey, value: numVal, unit: getUnitForMetric(mKey) });
    }
  }

  // Flat properties or nested objects fallback
  const srcObj = (reqBody && typeof reqBody === 'object' ? reqBody : {}) as Record<string, any>;
  if (metricsToProcess.length === 0 && srcObj && typeof srcObj === 'object') {
    for (const [k, v] of Object.entries(srcObj)) {
      if (
        [
          'token', 'apiKey', 'api_key', 'deviceId', 'device_id', 'id',
          'deviceName', 'name', 'device_name', 'mac', 'ip', 'payload',
          'data', 'raw', 'text', 'metrics', 'readings', 'status',
          'timestamp', 'sequence', 'seq'
        ].includes(k)
      ) continue;

      if (typeof v === 'object' && v !== null) {
        const nestedVal = (v as any).value ?? (v as any).val;
        const num = typeof nestedVal === 'number' ? nestedVal : parseFloat(String(nestedVal));
        if (!isNaN(num)) {
          metricsToProcess.push({ metric: k, value: num, unit: (v as any).unit || getUnitForMetric(k) });
        }
      } else {
        const num = typeof v === 'number' ? v : parseFloat(String(v));
        if (!isNaN(num)) {
          metricsToProcess.push({ metric: k, value: num, unit: getUnitForMetric(k) });
        }
      }
    }
  }

  // Extract Client IP (Strict Proxy / Nginx Trust: Only use Express req.ip, X-Forwarded-For set by proxy, or socket address)
  const clientIp = isExpressReq
    ? (
        req.ip ||
        (reqHeaders['x-forwarded-for'] ? String(reqHeaders['x-forwarded-for']).split(',')[0].trim() : '') ||
        req.socket?.remoteAddress ||
        ''
      )
        .toString()
        .replace('::ffff:', '')
        .trim()
    : '';

  const mac = isExpressReq
    ? ((reqHeaders['x-mac-address'] as string) || (reqHeaders['x-mac'] as string) || (reqBody && (reqBody.mac || reqBody.macAddress)) || '').toString().trim()
    : '';

  const finalFormattedPacket = `${token}, ${deviceNameFromPayload || token}, ${metricsToProcess.map((m) => `${m.metric}:${m.value}`).join(', ')}`;

  return {
    token,
    deviceNameFromPayload,
    sequence,
    rawBodyText,
    metricsToProcess,
    clientIp,
    mac,
    finalFormattedPacket,
  };
}

// Default export uses production parser
export function parseTelemetryPayload(req: any): ParsedTelemetryPayload {
  return parseProductionTelemetryPayload(req);
}
