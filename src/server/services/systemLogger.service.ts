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

  // Toggle & Config state
  private enabled: boolean = true;
  private logToFile: boolean = true;
  private minLevel: SystemEventLevel = 'info';
  private maxFileSizeBytes: number = 20 * 1024 * 1024; // 20 MB

  constructor() {
    this.ensureDirectories();
    this.loadConfiguration();
    this.loadPersistedEvents();
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

    const event: SystemEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      level,
      category,
      message: cleanMessage,
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

    // Notify live log listeners (e.g. WebSocket broadcast)
    for (const listener of this.logListeners) {
      try {
        listener(event);
      } catch {}
    }

    return event;
  }

  private logListeners: Array<(event: SystemEvent) => void> = [];

  public onLog(listener: (event: SystemEvent) => void): () => void {
    this.logListeners.push(listener);
    return () => {
      this.logListeners = this.logListeners.filter((l) => l !== listener);
    };
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
