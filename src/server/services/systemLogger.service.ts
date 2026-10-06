import fs from 'fs';
import path from 'path';
import type { SystemEvent, SystemEventLevel, SystemEventCategory, SystemLoggerConfig } from '../../types.js';
import { sanitizeLogString } from '../utils/crypto.js';

const LEVEL_WEIGHTS: Record<SystemEventLevel, number> = {
  info: 1,
  warn: 2,
  error: 3,
  critical: 4,
};

class SystemLoggerService {
  private inMemoryEvents: SystemEvent[] = [];
  private maxInMemoryEvents = 1000;
  private logDir = path.join(process.cwd(), 'logs');
  private logFilePath = path.join(this.logDir, 'system_events.log');
  private jsonBackupPath = path.join(process.cwd(), 'data', 'system_events.json');
  private configFilePath = path.join(process.cwd(), 'data', 'system_logger_config.json');
  private flushTimeout: NodeJS.Timeout | null = null;
  private pendingFileWrites: string[] = [];
  private logListeners: Set<(event: SystemEvent) => void> = new Set();

  // Toggle & Config state
  private enabled: boolean = true;
  private logToFile: boolean = true;
  private minLevel: SystemEventLevel = 'info';
  private maxFileSizeBytes: number = 20 * 1024 * 1024; // 20 MB
  private deduplication: boolean = true;
  private deduplicateWindowMs: number = 60000;
  private recentMessageSignatures: Map<string, { lastLoggedAt: number; count: number }> = new Map();

  constructor() {
    this.ensureDirectories();
    this.loadConfiguration();
    this.loadPersistedEvents();
    this.simplifyExistingLogs();
  }

  private ensureDirectories(): void {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
      const dataDir = path.join(process.cwd(), 'data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
    } catch (err) {
      console.warn('[SystemLogger] Dizin oluşturulamadı:', err);
    }
  }

  private loadConfiguration(): void {
    try {
      if (fs.existsSync(this.configFilePath)) {
        const raw = fs.readFileSync(this.configFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (typeof parsed.enabled === 'boolean') {
          this.enabled = parsed.enabled;
        }
        if (typeof parsed.logToFile === 'boolean') {
          this.logToFile = parsed.logToFile;
        }
        if (parsed.minLevel && LEVEL_WEIGHTS[parsed.minLevel as SystemEventLevel]) {
          this.minLevel = parsed.minLevel;
        }
        if (typeof parsed.maxInMemory === 'number' && parsed.maxInMemory > 0) {
          this.maxInMemoryEvents = parsed.maxInMemory;
        }
        if (typeof parsed.deduplication === 'boolean') {
          this.deduplication = parsed.deduplication;
        }
        if (typeof parsed.deduplicateWindowMs === 'number' && parsed.deduplicateWindowMs >= 1000) {
          this.deduplicateWindowMs = parsed.deduplicateWindowMs;
        }
      }
    } catch (err) {
      console.warn('[SystemLogger] Konfigürasyon okunamadı, varsayılanlar aktif:', err);
    }
  }

  private saveConfiguration(): void {
    try {
      const payload = {
        enabled: this.enabled,
        logToFile: this.logToFile,
        minLevel: this.minLevel,
        maxInMemory: this.maxInMemoryEvents,
        deduplication: this.deduplication,
        deduplicateWindowMs: this.deduplicateWindowMs,
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(this.configFilePath, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[SystemLogger] Konfigürasyon dosyasına yazılamadı:', err);
    }
  }

  private loadPersistedEvents(): void {
    try {
      if (fs.existsSync(this.jsonBackupPath)) {
        const raw = fs.readFileSync(this.jsonBackupPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.inMemoryEvents = parsed.slice(-this.maxInMemoryEvents);
        }
      }
      // Fallback: If inMemoryEvents is empty but system_events.log exists, read from log file
      if (this.inMemoryEvents.length === 0 && fs.existsSync(this.logFilePath)) {
        const raw = fs.readFileSync(this.logFilePath, 'utf-8');
        const lines = raw.split('\n').filter(Boolean);
        const parsed: SystemEvent[] = [];
        for (const line of lines) {
          try {
            parsed.push(JSON.parse(line));
          } catch {}
        }
        this.inMemoryEvents = parsed.reverse().slice(0, this.maxInMemoryEvents);
      }
    } catch {
      this.inMemoryEvents = [];
    }
  }

  public isLoggingEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    const prev = this.enabled;
    this.enabled = enabled;
    this.saveConfiguration();
    // Record internal lifecycle change
    if (prev !== enabled) {
      this.logDirect(
        'info',
        'server',
        `Sistem loglama motoru yönetici tarafından ${enabled ? 'AÇILDI (Aktif)' : 'KAPATILDI (Devre Dışı)'}.`,
        undefined,
        'system_config'
      );
    }
  }

  public updateConfig(partial: {
    enabled?: boolean;
    logToFile?: boolean;
    minLevel?: SystemEventLevel;
    maxInMemory?: number;
    deduplication?: boolean;
    deduplicateWindowMs?: number;
  }): SystemLoggerConfig {
    if (typeof partial.enabled === 'boolean') {
      this.enabled = partial.enabled;
    }
    if (typeof partial.logToFile === 'boolean') {
      this.logToFile = partial.logToFile;
    }
    if (partial.minLevel && LEVEL_WEIGHTS[partial.minLevel]) {
      this.minLevel = partial.minLevel;
    }
    if (typeof partial.deduplication === 'boolean') {
      this.deduplication = partial.deduplication;
    }
    if (typeof partial.deduplicateWindowMs === 'number' && partial.deduplicateWindowMs >= 1000) {
      this.deduplicateWindowMs = partial.deduplicateWindowMs;
    }
    if (typeof partial.maxInMemory === 'number' && partial.maxInMemory >= 100) {
      this.maxInMemoryEvents = partial.maxInMemory;
      if (this.inMemoryEvents.length > this.maxInMemoryEvents) {
        this.inMemoryEvents = this.inMemoryEvents.slice(0, this.maxInMemoryEvents);
      }
    }
    this.saveConfiguration();
    return this.getConfig();
  }

  public getConfig(): SystemLoggerConfig {
    let fileSizeBytes = 0;
    try {
      if (fs.existsSync(this.logFilePath)) {
        fileSizeBytes = fs.statSync(this.logFilePath).size;
      }
    } catch {}

    const counts = this.getStats();

    return {
      enabled: this.enabled,
      minLevel: this.minLevel,
      logToFile: this.logToFile,
      maxInMemory: this.maxInMemoryEvents,
      totalEvents: this.inMemoryEvents.length,
      fileSizeBytes,
      filePath: this.logFilePath,
      deduplication: this.deduplication,
      deduplicateWindowMs: this.deduplicateWindowMs,
      counts,
    };
  }

  public getStats(): SystemLoggerConfig['counts'] {
    let critical = 0;
    let error = 0;
    let warn = 0;
    let info = 0;

    for (const e of this.inMemoryEvents) {
      if (e.level === 'critical') critical++;
      else if (e.level === 'error') error++;
      else if (e.level === 'warn') warn++;
      else if (e.level === 'info') info++;
    }

    return {
      critical,
      error,
      warn,
      info,
      total: this.inMemoryEvents.length,
    };
  }

  /**
   * Internal direct logger that bypasses enabled check for critical operations like state changes
   */
  private logDirect(
    level: SystemEventLevel,
    category: SystemEventCategory,
    message: string,
    details?: any,
    source?: string
  ): SystemEvent {
    return this.processEvent(level, category, message, details, source);
  }

  public onLog(listener: (event: SystemEvent) => void): () => void {
    this.logListeners.add(listener);
    return () => {
      this.logListeners.delete(listener);
    };
  }

  public log(
    level: SystemEventLevel,
    category: SystemEventCategory,
    message: string,
    details?: any,
    source?: string
  ): SystemEvent {
    // If logging is disabled, discard non-critical logs
    if (!this.enabled && level !== 'critical') {
      return {
        id: `discarded_${Date.now()}`,
        timestamp: new Date().toISOString(),
        level,
        category,
        message,
        source,
      };
    }

    // Check minimum level threshold
    const levelWeight = LEVEL_WEIGHTS[level] || 1;
    const minWeight = LEVEL_WEIGHTS[this.minLevel] || 1;
    if (levelWeight < minWeight) {
      return {
        id: `suppressed_${Date.now()}`,
        timestamp: new Date().toISOString(),
        level,
        category,
        message,
        source,
      };
    }

    return this.processEvent(level, category, message, details, source);
  }

  private processEvent(
    level: SystemEventLevel,
    category: SystemEventCategory,
    message: string,
    details?: any,
    source?: string
  ): SystemEvent {
    let stack: string | undefined;
    let method: string | undefined;
    let pathStr: string | undefined;
    let ip: string | undefined;
    let userId: string | undefined;
    let statusCode: number | undefined;
    let traceId: string | undefined;
    let tenantId: string | undefined;
    let deviceId: string | undefined;
    let detailsString: string | undefined;

    if (details) {
      if (typeof details === 'object') {
        if (details.stack) stack = String(details.stack);
        if (details.method) method = String(details.method);
        if (details.url || details.path) pathStr = String(details.url || details.path);
        if (details.ip) ip = String(details.ip);
        if (details.userId) userId = String(details.userId);
        if (details.traceId) traceId = String(details.traceId);
        if (details.tenantId) tenantId = String(details.tenantId);
        if (details.deviceId) deviceId = String(details.deviceId);
        if (typeof details.statusCode === 'number') statusCode = details.statusCode;

        try {
          detailsString = JSON.stringify(details, null, 2);
        } catch {
          detailsString = String(details);
        }
      } else {
        detailsString = String(details);
      }
    }

    const cleanMessage = sanitizeLogString(message);
    const cleanDetails = detailsString ? sanitizeLogString(detailsString) : undefined;
    const cleanStack = stack ? sanitizeLogString(stack) : undefined;
    const cleanPath = pathStr ? sanitizeLogString(pathStr) : undefined;

    // Intelligent Deduplication / Rate-Limiting:
    // Suppress consecutive or rapid identical messages within deduplicateWindowMs (default 60s)
    let finalMessage = cleanMessage;
    if (this.deduplication) {
      const now = Date.now();
      const dedupKey = `${level}:${category}:${cleanMessage}`;
      const existing = this.recentMessageSignatures.get(dedupKey);

      if (existing && now - existing.lastLoggedAt < this.deduplicateWindowMs) {
        existing.count++;
        // Suppress writing redundant duplicate to file or in-memory list
        return {
          id: `suppressed_${now}_${Math.random().toString(36).substring(2, 7)}`,
          timestamp: new Date().toISOString(),
          level,
          category,
          message: cleanMessage,
          details: cleanDetails,
          source: source || 'system',
        };
      }

      const prevSuppressed = existing ? existing.count : 0;
      this.recentMessageSignatures.set(dedupKey, { lastLoggedAt: now, count: 0 });

      // Clean stale signatures if cache grows
      if (this.recentMessageSignatures.size > 1000) {
        for (const [key, val] of this.recentMessageSignatures.entries()) {
          if (now - val.lastLoggedAt > this.deduplicateWindowMs * 2) {
            this.recentMessageSignatures.delete(key);
          }
        }
      }

      if (prevSuppressed > 0) {
        finalMessage += ` (Önceki ${prevSuppressed} adet benzer kayıt birleştirildi)`;
      }
    }

    const event: SystemEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      level,
      category,
      message: finalMessage,
      details: cleanDetails,
      source: source || 'system',
      stack: cleanStack,
      method,
      path: cleanPath,
      ip,
      userId,
      statusCode,
      traceId,
      tenantId,
      deviceId,
    };

    // Circular memory buffer
    this.inMemoryEvents.unshift(event);
    if (this.inMemoryEvents.length > this.maxInMemoryEvents) {
      this.inMemoryEvents.length = this.maxInMemoryEvents;
    }

    // Structured console output - Route safely to stdout (console.log) to avoid triggering container supervisor false-positive alerts
    const logPrefix = `[SystemLog][${level.toUpperCase()}][${category.toUpperCase()}]`;
    console.log(`${logPrefix} ${cleanMessage}${source ? ` (${source})` : ''}`);

    // Schedule async file persistence if enabled
    if (this.logToFile) {
      this.queueFilePersistence(event);
    }

    // Notify live event subscribers (e.g. WebSocket broadcast)
    for (const listener of this.logListeners) {
      try {
        listener(event);
      } catch {}
    }

    return event;
  }

  public info(category: SystemEventCategory, message: string, details?: any, source?: string): SystemEvent {
    return this.log('info', category, message, details, source);
  }

  public warn(category: SystemEventCategory, message: string, details?: any, source?: string): SystemEvent {
    return this.log('warn', category, message, details, source);
  }

  public error(category: SystemEventCategory, message: string, details?: any, source?: string): SystemEvent {
    return this.log('error', category, message, details, source);
  }

  public critical(category: SystemEventCategory, message: string, details?: any, source?: string): SystemEvent {
    return this.log('critical', category, message, details, source);
  }

  private queueFilePersistence(event: SystemEvent): void {
    this.pendingFileWrites.push(JSON.stringify(event));

    if (!this.flushTimeout) {
      this.flushTimeout = setTimeout(() => {
        this.flushPendingWrites();
      }, 500);
    }
  }

  private flushPendingWrites(): void {
    this.flushTimeout = null;
    if (this.pendingFileWrites.length === 0) return;

    const linesToWrite = this.pendingFileWrites.join('\n') + '\n';
    this.pendingFileWrites = [];

    try {
      this.rotateLogFileIfNeeded();
      fs.appendFileSync(this.logFilePath, linesToWrite, 'utf-8');
      // Save recent 200 events to data/system_events.json for fast reload
      fs.writeFileSync(this.jsonBackupPath, JSON.stringify(this.inMemoryEvents.slice(0, 200), null, 2), 'utf-8');
    } catch (err) {
      console.warn('[SystemLogger] Dosyaya yazılamadı:', err);
    }
  }

  private rotateLogFileIfNeeded(): void {
    try {
      if (fs.existsSync(this.logFilePath)) {
        const stats = fs.statSync(this.logFilePath);
        if (stats.size > this.maxFileSizeBytes) {
          const backupFile = path.join(this.logDir, `system_events_${Date.now()}.log.bak`);
          fs.renameSync(this.logFilePath, backupFile);

          // Retention policy: Keep max 5 backup files to prevent disk exhaustion
          this.pruneOldLogBackups();
        }
      }
    } catch (err) {
      console.warn('[SystemLogger] Log rotasyon hatası:', err);
    }
  }

  private pruneOldLogBackups(maxBackups = 5): void {
    try {
      if (!fs.existsSync(this.logDir)) return;
      const files = fs.readdirSync(this.logDir);
      const bakFiles = files
        .filter((f) => f.startsWith('system_events_') && f.endsWith('.log.bak'))
        .map((f) => ({
          name: f,
          fullPath: path.join(this.logDir, f),
          time: fs.statSync(path.join(this.logDir, f)).mtimeMs,
        }))
        .sort((a, b) => b.time - a.time);

      if (bakFiles.length > maxBackups) {
        const toDelete = bakFiles.slice(maxBackups);
        for (const file of toDelete) {
          try {
            fs.unlinkSync(file.fullPath);
          } catch {}
        }
      }
    } catch (err) {
      console.warn('[SystemLogger] Eski log yedekleri temizlenirken hata oluştu:', err);
    }
  }

  public getEvents(options: {
    limit?: number;
    offset?: number;
    level?: SystemEventLevel;
    category?: SystemEventCategory;
    search?: string;
    startDate?: string;
    endDate?: string;
  } = {}): { events: SystemEvent[]; total: number; filteredTotal: number; counts: SystemLoggerConfig['counts'] } {
    let filtered = [...this.inMemoryEvents];

    if (options.level) {
      filtered = filtered.filter((e) => e.level === options.level);
    }

    if (options.category) {
      filtered = filtered.filter((e) => e.category === options.category);
    }

    if (options.startDate) {
      const start = new Date(options.startDate).getTime();
      if (!isNaN(start)) {
        filtered = filtered.filter((e) => new Date(e.timestamp).getTime() >= start);
      }
    }

    if (options.endDate) {
      const end = new Date(options.endDate).getTime();
      if (!isNaN(end)) {
        filtered = filtered.filter((e) => new Date(e.timestamp).getTime() <= end);
      }
    }

    if (options.search && options.search.trim()) {
      const q = options.search.toLowerCase().trim();
      filtered = filtered.filter((e) =>
        e.message.toLowerCase().includes(q) ||
        (e.details && e.details.toLowerCase().includes(q)) ||
        (e.stack && e.stack.toLowerCase().includes(q)) ||
        e.category.toLowerCase().includes(q) ||
        (e.path && e.path.toLowerCase().includes(q)) ||
        (e.source && e.source.toLowerCase().includes(q))
      );
    }

    const filteredTotal = filtered.length;
    const offset = Math.max(0, options.offset || 0);
    const limit = Math.min(Math.max(1, options.limit || 100), 1000);
    const paginated = filtered.slice(offset, offset + limit);

    return {
      events: paginated,
      total: this.inMemoryEvents.length,
      filteredTotal,
      counts: this.getStats(),
    };
  }

  public clearEvents(): void {
    this.inMemoryEvents = [];
    this.pendingFileWrites = [];
    try {
      if (fs.existsSync(this.jsonBackupPath)) {
        fs.writeFileSync(this.jsonBackupPath, '[]', 'utf-8');
      }
      if (fs.existsSync(this.logFilePath)) {
        fs.writeFileSync(this.logFilePath, '', 'utf-8');
      }
    } catch (err) {
      console.warn('[SystemLogger] Log temizlenirken hata oluştu:', err);
    }
    this.logDirect('info', 'server', 'Sistem olay günlükleri yönetici tarafından temizlendi.', undefined, 'admin_action');
  }

  /**
   * Cleans up redundant, spammy, and fluttering entries from stored logs.
   * Keeps critical milestones, real error messages, warnings, and unique notifications intact.
   */
  public simplifyExistingLogs(): { removedCount: number; remainingCount: number } {
    const beforeCount = this.inMemoryEvents.length;
    const simplified: SystemEvent[] = [];
    let lastEventKey: string | null = null;
    let lastDbState: string | null = null;

    // Process from oldest to newest to preserve natural chronology during dedup
    const chronological = [...this.inMemoryEvents].reverse();

    for (const evt of chronological) {
      const msg = evt.message || '';

      // 1. Remove flapping database state machine noise (e.g. alternating DB_CONNECTING <-> DB_UNAVAILABLE)
      if (msg.includes('[Database State Machine] Durum değişti:')) {
        const isUnavailableConnectingFlap =
          msg.includes('DB_CONNECTING -> DB_UNAVAILABLE') ||
          msg.includes('DB_UNAVAILABLE -> DB_CONNECTING');

        if (isUnavailableConnectingFlap) {
          if (lastDbState === 'DB_UNAVAILABLE' || lastDbState === 'DB_CONNECTING') {
            // Already logged an initial unavailable state, discard flapping repetition
            continue;
          }
          lastDbState = msg.includes('DB_UNAVAILABLE') ? 'DB_UNAVAILABLE' : 'DB_CONNECTING';
        } else {
          lastDbState = null;
        }
      }

      // 2. Remove routine HTTP 200 GET / or static page pings
      if (
        evt.category === 'http' &&
        evt.level === 'info' &&
        (msg.includes('GET / ') || msg.includes('GET / (') || msg.includes('GET /index.html'))
      ) {
        continue;
      }

      // 3. Deduplicate identical messages in rapid succession
      const baseMsg = msg.split(' (Önceki')[0].trim();
      const eventKey = `${evt.level}:${evt.category}:${baseMsg}`;
      if (eventKey === lastEventKey) {
        continue;
      }
      lastEventKey = eventKey;

      simplified.push(evt);
    }

    // inMemoryEvents stores newest first
    this.inMemoryEvents = [...simplified].reverse();
    const removedCount = beforeCount - this.inMemoryEvents.length;

    // Write back simplified logs to file and json backup
    try {
      if (fs.existsSync(this.logFilePath)) {
        const fileContent = simplified.map((e) => JSON.stringify(e)).join('\n') + (simplified.length > 0 ? '\n' : '');
        fs.writeFileSync(this.logFilePath, fileContent, 'utf-8');
      }
      if (fs.existsSync(this.jsonBackupPath)) {
        fs.writeFileSync(this.jsonBackupPath, JSON.stringify(this.inMemoryEvents.slice(0, 200), null, 2), 'utf-8');
      }
    } catch (err) {
      console.warn('[SystemLogger] Log dosyaları sadeleştirilirken hata oluştu:', err);
    }

    return {
      removedCount,
      remainingCount: this.inMemoryEvents.length,
    };
  }

  public exportLogs(format: 'json' | 'log' = 'json'): { content: string; filename: string; mimeType: string } {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    if (format === 'log') {
      const lines = this.inMemoryEvents.map((e) => {
        const meta = [
          `[${e.timestamp}]`,
          `[${e.level.toUpperCase()}]`,
          `[${e.category.toUpperCase()}]`,
          e.method && e.path ? `[${e.method} ${e.path}]` : '',
          e.message,
        ].filter(Boolean).join(' ');

        const details = e.details ? `\n  Details: ${e.details}` : '';
        const stack = e.stack ? `\n  Stack:\n${e.stack}` : '';
        return meta + details + stack;
      });

      return {
        content: lines.join('\n\n'),
        filename: `nexusnode_system_logs_${timestamp}.log`,
        mimeType: 'text/plain',
      };
    }

    return {
      content: JSON.stringify(this.inMemoryEvents, null, 2),
      filename: `nexusnode_system_logs_${timestamp}.json`,
      mimeType: 'application/json',
    };
  }
}

export const systemLogger = new SystemLoggerService();
