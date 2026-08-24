import type express from 'express';
import crypto from 'node:crypto';

export interface ParsedMetric {
  metric: string;
  value: number;
  unit: string;
}

export interface ParsedTelemetryPayload {
  token: string;
  deviceIdFromPayload?: string;
  deviceNameFromPayload: string;
  sequence?: number;
  bootId?: string;
  idempotencyKey?: string;
  rawBodyText: string;
  metricsToProcess: ParsedMetric[];
  clientIp: string;
  mac: string;
  finalFormattedPacket: string;
}

export interface PacketAck {
  status: 'accepted' | 'duplicate_skipped' | 'queued' | 'failed';
  packetId: string;
  idempotencyKey?: string;
  sequence?: number;
  bootId?: string;
  received: number;
  persisted: number;
  queued: number;
  engine?: string;
  deviceId?: string;
  error?: string;
}

export function buildPacketAck(params: {
  sequence?: number;
  bootId?: string;
  idempotencyKey?: string;
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
  const { sequence, bootId, idempotencyKey, receivedCount, addedReadingsCount, writeAck, deviceId, error } = params;

  const effectiveBootId = bootId || 'default';
  const computedIdempotencyKey = idempotencyKey || (
    sequence !== undefined && sequence !== null && deviceId
      ? `${deviceId}:${effectiveBootId}:${sequence}`
      : undefined
  );

  const devPrefix = deviceId ? `${deviceId}:` : '';
  const packetId =
    sequence !== undefined && sequence !== null
      ? `${devPrefix}${effectiveBootId}:${sequence}`
      : `${devPrefix}pkt_${Date.now()}`;

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
    idempotencyKey: computedIdempotencyKey,
    sequence,
    bootId: effectiveBootId,
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
  if (lk.includes('sıcaklık') || lk.includes('temp') || lk.includes('sicaklik') || lk.includes('temperature') || lk.includes('isi')) return '°C';
  if (lk.includes('nem') || lk.includes('hum') || lk.includes('humidity') || lk.includes('cpu') || lk.includes('memory') || lk.includes('ram') || lk.includes('disk') || lk.startsWith('pct_') || lk.endsWith('_percent')) return '%';
  if (lk === 'p' || lk.includes('güç') || lk.includes('power') || lk.includes('guc') || lk.includes('active_power') || lk.includes('kw')) return 'kW';
  if (['l1', 'l2', 'l3', 'v1', 'v2', 'v3', 'volt', 'voltage', 'gerilim'].includes(lk) || lk.includes('volt')) return 'V';
  if (['i', 'i1', 'i2', 'i3', 'current', 'akım', 'akim', 'amp'].includes(lk) || lk.includes('akım') || lk.includes('akim')) return 'A';
  if (['ri', 'rc', 'q', 'kvar', 'var', 'reaktif', 'reactive'].includes(lk)) return 'kVAr';
  if (['f', 'f1', 'f2', 'freq', 'frekans', 'frequency', 'hz'].includes(lk)) return 'Hz';
  if (lk.includes('basınç') || lk.includes('basinc') || lk.includes('pressure') || lk.includes('bar') || lk.includes('hpa')) return 'hPa';
  if (lk.includes('ping')) return 'ms';
  if (lk.includes('rssi')) return 'dBm';
  if (lk.includes('heartbeat')) return 'hb';
  if (lk.includes('co2')) return 'ppm';
  if (lk.includes('titresim') || lk.includes('vibration')) return 'mm/s';
  return '';
}

export function parseMetricPair(item: string): ParsedMetric | null {
  const trimmed = item.trim();
  if (!trimmed || !trimmed.includes(':')) return null;

  const parts = trimmed.split(':').map((s) => s.trim());
  if (parts.length < 2) return null;

  const metric = parts[0];
  const valStr = parts[1];
  const unit = parts[2] ? parts[2] : getUnitForMetric(metric);
  const num = parseFloat(valStr);

  if (isNaN(num)) return null;

  return {
    metric,
    value: num,
    unit: unit || getUnitForMetric(metric),
  };
}

export function parseProductionTelemetryPayload(req: any): ParsedTelemetryPayload {
  const isExpressReq = req && req.headers;
  const reqHeaders = isExpressReq ? req.headers : {};
  const reqBody = isExpressReq ? req.body : req;

  // Header token or Bearer
  let token = (
    (reqHeaders['x-api-key'] as string) ||
    reqHeaders['authorization']?.replace(/^Bearer\s+/i, '') ||
    (reqHeaders['x-token'] as string) ||
    ''
  ).trim();

  let rawBodyText = '';
  if (typeof reqBody === 'string') {
    rawBodyText = reqBody.trim();
  } else if (Buffer.isBuffer(reqBody)) {
    rawBodyText = reqBody.toString('utf8').trim();
  } else if (reqBody && typeof reqBody === 'object') {
    if (typeof reqBody.payload === 'string') rawBodyText = reqBody.payload.trim();
    else if (typeof reqBody.raw === 'string') rawBodyText = reqBody.raw.trim();
    else if (typeof reqBody.data === 'string') rawBodyText = reqBody.data.trim();
    else if (typeof reqBody.text === 'string') rawBodyText = reqBody.text.trim();
  }

  let bodyObj: any = {};
  if (reqBody && typeof reqBody === 'object' && !Array.isArray(reqBody)) {
    bodyObj = reqBody;
  } else if (rawBodyText.startsWith('{') || rawBodyText.startsWith('[')) {
    try {
      bodyObj = JSON.parse(rawBodyText);
    } catch {
      bodyObj = {};
    }
  }

  // Device Identity & Name
  let deviceIdFromPayload = (
    bodyObj.deviceId ||
    bodyObj.device_id ||
    bodyObj.id ||
    reqHeaders['x-device-id'] ||
    ''
  ).toString().trim();

  let deviceNameFromPayload = (
    bodyObj.deviceName ||
    bodyObj.device_name ||
    bodyObj.name ||
    ''
  ).toString().trim();

  // Extract Sequence Number & Boot ID
  let sequence: number | undefined = undefined;
  const rawSeq =
    bodyObj.sequence ??
    bodyObj.seq ??
    bodyObj.packetId ??
    bodyObj.packet_id ??
    reqHeaders['x-sequence'] ??
    reqHeaders['x-packet-id'];

  if (rawSeq !== undefined && rawSeq !== null && rawSeq !== '') {
    const parsedSeq = typeof rawSeq === 'number' ? rawSeq : parseInt(String(rawSeq), 10);
    if (!isNaN(parsedSeq)) {
      sequence = parsedSeq;
    }
  }

  // Extract Boot ID / Reset Counter (Default: 'default')
  const rawBootId =
    bodyObj.bootId ??
    bodyObj.boot_id ??
    bodyObj.bootCount ??
    bodyObj.resetCount ??
    bodyObj.boot_count ??
    bodyObj.reset_count ??
    reqHeaders['x-boot-id'] ??
    reqHeaders['x-boot-count'] ??
    reqHeaders['x-reset-count'] ??
    req?.query?.bootId ??
    req?.query?.boot_id;

  const bootId = rawBootId !== undefined && rawBootId !== null && String(rawBootId).trim() !== ''
    ? String(rawBootId).trim()
    : 'default';

  const idempotencyKey =
    sequence !== undefined && sequence !== null
      ? `${deviceIdFromPayload || 'device'}:${bootId}:${sequence}`
      : undefined;

  const metricsToProcess: ParsedMetric[] = [];

  // 1. Direct CSV Format Support:
  // "dev_key_536fd2cc77a2a52c, [Sanal] araç beton, sıcaklık:37.5:C, nem:85:%"
  // or "dev_key_536fd2cc77a2a52c, sıcaklık:37.5:C, nem:85:%"
  if (rawBodyText && rawBodyText.includes(',')) {
    const csvParts = rawBodyText.split(',').map((p) => p.trim()).filter(Boolean);
    let startIndex = 0;

    // Check first element (token / deviceId / name)
    if (csvParts[0] && !csvParts[0].includes(':')) {
      const firstPart = csvParts[0];
      if (!token) token = firstPart;
      
      const looksLikeApiKey = firstPart.startsWith('dev_key_') || firstPart.startsWith('nex_') || firstPart.startsWith('nkn_') || firstPart.length >= 24;
      if (!looksLikeApiKey && !deviceIdFromPayload) {
        deviceIdFromPayload = firstPart;
      }
      startIndex = 1;

      // Check second element (device name / device id alias)
      if (csvParts[1] && !csvParts[1].includes(':')) {
        if (!deviceNameFromPayload) deviceNameFromPayload = csvParts[1];
        startIndex = 2;
      }
    }

    for (let i = startIndex; i < csvParts.length; i++) {
      const metricItem = parseMetricPair(csvParts[i]);
      if (metricItem) {
        metricsToProcess.push(metricItem);
      }
    }
  }

  // 2. Single Key:Value:Unit format (e.g. "sıcaklık:37.5:C")
  if (metricsToProcess.length === 0 && rawBodyText && rawBodyText.includes(':') && !rawBodyText.startsWith('{')) {
    const metricItem = parseMetricPair(rawBodyText);
    if (metricItem) {
      metricsToProcess.push(metricItem);
    }
  }

  // 3. Structured JSON "metrics" object
  if (metricsToProcess.length === 0 && bodyObj.metrics && typeof bodyObj.metrics === 'object' && !Array.isArray(bodyObj.metrics)) {
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

  // 4. Structured JSON "readings" array
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

  // 5. Flat top-level JSON fields
  if (metricsToProcess.length === 0 && typeof bodyObj === 'object' && Object.keys(bodyObj).length > 0) {
    const ignoredKeys = new Set([
      'deviceid', 'device_id', 'devicename', 'device_name', 'id', 'name',
      'sequence', 'seq', 'packetid', 'packet_id', 'bootid', 'boot_id', 'bootcount', 'resetcount', 'boot_count', 'reset_count',
      'idempotencykey', 'idempotency_key',
      'apikey', 'api_key', 'token', 'mac', 'macaddress', 'mac_address',
      'ip', 'ipaddress', 'ip_address', 'timestamp', 'time', 'date'
    ]);

    for (const [k, v] of Object.entries(bodyObj)) {
      if (ignoredKeys.has(k.toLowerCase())) continue;

      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        const nestedVal = (v as any).value ?? (v as any).val;
        const num = typeof nestedVal === 'number' ? nestedVal : parseFloat(String(nestedVal));
        if (!isNaN(num)) {
          metricsToProcess.push({
            metric: k,
            value: num,
            unit: (v as any).unit || getUnitForMetric(k),
          });
        }
      } else if (v !== null && v !== undefined && typeof v !== 'object') {
        const num = typeof v === 'number' ? v : parseFloat(String(v));
        if (!isNaN(num)) {
          metricsToProcess.push({
            metric: k,
            value: num,
            unit: getUnitForMetric(k),
          });
        }
      }
    }
  }

  // Also look for token inside body if not yet found
  if (!token) {
    token = (
      bodyObj.apiKey ||
      bodyObj.api_key ||
      bodyObj.token ||
      bodyObj.deviceId ||
      bodyObj.device_id ||
      bodyObj.id ||
      ''
    ).toString().trim();
  }

  // Extract Client IP
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

  const prefixParts: string[] = [];
  if (token) prefixParts.push(token);
  if (deviceIdFromPayload && deviceIdFromPayload !== token) prefixParts.push(deviceIdFromPayload);
  if (deviceNameFromPayload && deviceNameFromPayload !== token && deviceNameFromPayload !== deviceIdFromPayload) prefixParts.push(deviceNameFromPayload);

  const metricsStr = metricsToProcess
    .map((m) => (m.unit ? `${m.metric}:${m.value}:${m.unit}` : `${m.metric}:${m.value}`))
    .join(', ');

  const finalFormattedPacket = prefixParts.length > 0
    ? `${prefixParts.join(', ')}, ${metricsStr}`
    : (rawBodyText || metricsStr);

  return {
    token,
    deviceIdFromPayload,
    deviceNameFromPayload,
    sequence,
    bootId,
    idempotencyKey,
    rawBodyText: rawBodyText || (typeof reqBody === 'string' ? reqBody : JSON.stringify(bodyObj)),
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

  // Extract Boot ID / Reset Counter (Default: 'default')
  const rawBootId =
    bodyObj.bootId ??
    bodyObj.boot_id ??
    bodyObj.bootCount ??
    bodyObj.resetCount ??
    firstArrayItem.bootId ??
    firstArrayItem.boot_id ??
    reqHeaders['x-boot-id'] ??
    reqHeaders['x-boot-count'] ??
    reqHeaders['x-reset-count'] ??
    req?.query?.bootId ??
    req?.query?.boot_id;

  const bootId = rawBootId !== undefined && rawBootId !== null && String(rawBootId).trim() !== ''
    ? String(rawBootId).trim()
    : 'default';

  const idempotencyKey =
    sequence !== undefined && sequence !== null
      ? `${bodyObj.deviceId || bodyObj.device_id || firstArrayItem.deviceId || firstArrayItem.id || 'device'}:${bootId}:${sequence}`
      : undefined;

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
      const metricItem = parseMetricPair(parts[i]);
      if (metricItem) {
        metricsToProcess.push(metricItem);
      }
    }
  }

  // Key:Value format
  if (metricsToProcess.length === 0 && rawBodyText && rawBodyText.includes(':') && !rawBodyText.startsWith('{')) {
    const metricItem = parseMetricPair(rawBodyText);
    if (metricItem) {
      metricsToProcess.push(metricItem);
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

  const legacyPrefixParts: string[] = [];
  if (token) legacyPrefixParts.push(token);
  if (deviceNameFromPayload && deviceNameFromPayload !== token) legacyPrefixParts.push(deviceNameFromPayload);

  const legacyMetricsStr = metricsToProcess.map((m) => (m.unit ? `${m.metric}:${m.value}:${m.unit}` : `${m.metric}:${m.value}`)).join(', ');
  const finalFormattedPacket = legacyPrefixParts.length > 0
    ? `${legacyPrefixParts.join(', ')}, ${legacyMetricsStr}`
    : (rawBodyText || legacyMetricsStr);

  return {
    token,
    deviceNameFromPayload,
    sequence,
    bootId,
    idempotencyKey,
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
