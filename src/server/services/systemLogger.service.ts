import fs from 'fs';
import path from 'path';
import type { SystemEvent, SystemEventLevel, SystemEventCategory, SystemLoggerConfig, LogIncludedFields } from '../../types.js';
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
  private logDir = this.getResolvedLogDir();
  private logFilePath = path.join(this.logDir, 'system_events.log');
  private jsonBackupPath = path.join(process.cwd(), 'data', 'system_events.json');
  private configFilePath = path.join(process.cwd(), 'data', 'system_logger_config.json');
  private flushTimeout: NodeJS.Timeout | null = null;
  private pendingFileWrites: string[] = [];
  private logListeners: Set<(event: SystemEvent) => void> = new Set();

  private getResolvedLogDir(): string {
    if (process.env.LOGS_DIR) {
      return path.resolve(process.env.LOGS_DIR);
    }
    // In production, data/ is the persistent volume mounted in Docker (app_data:/app/data).
    // Storing logs under data/logs ensures log files are NOT wiped on container rebuild/recreation.
    if (process.env.NODE_ENV === 'production') {
      return path.join(process.cwd(), 'data', 'logs');
    }
    return path.join(process.cwd(), 'logs');
  }

  // Toggle & Config state
  private enabled: boolean = true;
  private logToFile: boolean = true;
  private minLevel: SystemEventLevel = 'info';
  private maxFileSizeBytes: number = 20 * 1024 * 1024; // 20 MB
  private deduplication: boolean = true;
  private deduplicateWindowMs: number = 60000;
  private includedFields: LogIncludedFields = {
    stack: true,
    ip: true,
    user: true,
    http: true,
    device: true,
    details: true,
    source: true,
    traceId: true,
  };
  private autoSanitizeSecrets: boolean = true;
  private recentMessageSignatures: Map<string, { lastLoggedAt: number; count: number }> = new Map();

  constructor() {
    this.ensureDirectories();
    this.loadConfiguration();
    this.loadPersistedEvents();
    // Do not simplify/rewrite persisted logs during startup. Startup must be read-only
    // with respect to log history so rebuilds/restarts cannot erase historical events.
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
      this.migrateLegacyLogsIfNeeded();
    } catch (err) {
      console.warn('[SystemLogger] Dizin oluşturulamadı:', err);
    }
  }

  private migrateLegacyLogsIfNeeded(): void {
    try {
      const legacyLogDir = path.join(process.cwd(), 'logs');
      // If our target logDir is not root logs/ and legacy logs/ directory exists
      if (path.resolve(this.logDir) !== path.resolve(legacyLogDir) && fs.existsSync(legacyLogDir)) {
        const legacyLogFile = path.join(legacyLogDir, 'system_events.log');
        if (fs.existsSync(legacyLogFile) && !fs.existsSync(this.logFilePath)) {
          fs.copyFileSync(legacyLogFile, this.logFilePath);
          console.log('[SystemLogger] Eski logs/system_events.log kalıcı dizine aktarıldı:', this.logFilePath);
        }
        // Also copy any rotation backups
        const legacyFiles = fs.readdirSync(legacyLogDir);
        for (const f of legacyFiles) {
          if (f.startsWith('system_events_') && f.endsWith('.log.bak')) {
            const dest = path.join(this.logDir, f);
            if (!fs.existsSync(dest)) {
              fs.copyFileSync(path.join(legacyLogDir, f), dest);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[SystemLogger] Legacy log taşıma uyarısı:', err);
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
        if (parsed.includedFields && typeof parsed.includedFields === 'object') {
          this.includedFields = {
            ...this.includedFields,
            ...parsed.includedFields,
          };
        }
        if (typeof parsed.autoSanitizeSecrets === 'boolean') {
          this.autoSanitizeSecrets = parsed.autoSanitizeSecrets;
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
        includedFields: this.includedFields,
        autoSanitizeSecrets: this.autoSanitizeSecrets,
        updatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(this.configFilePath, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[SystemLogger] Konfigürasyon dosyasına yazılamadı:', err);
    }
  }

  private loadPersistedEvents(): void {
    const eventsById = new Map<string, SystemEvent>();

    const isPersistableEvent = (value: unknown): value is SystemEvent => {
      if (!value || typeof value !== 'object') return false;
      const event = value as Partial<SystemEvent>;
      return typeof event.id === 'string'
        && event.id.length > 0
        && typeof event.timestamp === 'string'
        && Number.isFinite(Date.parse(event.timestamp))
        && typeof event.message === 'string';
    };

    // The JSON snapshot is a cache, not the source of truth. A malformed snapshot
    // must never prevent recovery from the append-only log and rotation backups.
    try {
      if (fs.existsSync(this.jsonBackupPath)) {
        const raw = fs.readFileSync(this.jsonBackupPath, 'utf-8');
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          for (const candidate of parsed.slice(0, this.maxInMemoryEvents)) {
            if (isPersistableEvent(candidate) && !eventsById.has(candidate.id)) {
              eventsById.set(candidate.id, candidate);
            }
          }
        } else {
          console.warn('[SystemLogger] JSON log snapshot is not an array; recovering from persisted log files.');
        }
      }
    } catch (err) {
      console.warn('[SystemLogger] JSON log snapshot could not be loaded; recovering from persisted log files:', err);
    }

    // The active log is newest. Rotated files are scanned newest-first as a
    // fallback so the memory cache can be rebuilt even when the active file is
    // missing, truncated, or contains fewer than maxInMemoryEvents records.
    const logFiles: string[] = [];
    try {
      if (fs.existsSync(this.logFilePath)) {
        logFiles.push(this.logFilePath);
      }
      if (fs.existsSync(this.logDir)) {
        const backups = fs.readdirSync(this.logDir)
          .filter((name) => name.startsWith('system_events_') && name.endsWith('.log.bak'))
          .map((name) => {
            const fullPath = path.join(this.logDir, name);
            let mtimeMs = 0;
            try { mtimeMs = fs.statSync(fullPath).mtimeMs; } catch {}
            return { fullPath, mtimeMs };
          })
          .sort((a, b) => b.mtimeMs - a.mtimeMs);
        logFiles.push(...backups.map((backup) => backup.fullPath));
      }
    } catch (err) {
      console.warn('[SystemLogger] Persisted log files could not be listed:', err);
    }

    for (const filePath of logFiles) {
      // Keep up to max entries from each source, then sort globally. Counting
      // snapshot entries against this cap would let a stale snapshot crowd out
      // newer records that are still present in the append-only files.
      let recoveredFromFile = 0;
      try {
        const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
        for (let i = lines.length - 1; i >= 0; i--) {
          if (recoveredFromFile >= this.maxInMemoryEvents) break;
          if (!lines[i].trim()) continue;
          try {
            const candidate: unknown = JSON.parse(lines[i]);
            if (isPersistableEvent(candidate) && !eventsById.has(candidate.id)) {
              eventsById.set(candidate.id, candidate);
              recoveredFromFile++;
            }
          } catch {
            // A partial/corrupt line must not discard otherwise valid history.
          }
        }
      } catch (err) {
        // Keep valid snapshot/file entries and continue with other recovery sources.
        console.warn('[SystemLogger] Persisted log file could not be loaded:', filePath, err);
      }
    }

    // Snapshot and file entries can overlap or arrive from different recovery
    // sources; normalize to newest-first ordering before serving pagination.
    this.inMemoryEvents = [...eventsById.values()]
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
      .slice(0, this.maxInMemoryEvents);
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
    includedFields?: Partial<LogIncludedFields>;
    autoSanitizeSecrets?: boolean;
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
    if (partial.includedFields && typeof partial.includedFields === 'object') {
      this.includedFields = {
        ...this.includedFields,
        ...partial.includedFields,
      };
    }
    if (typeof partial.autoSanitizeSecrets === 'boolean') {
      this.autoSanitizeSecrets = partial.autoSanitizeSecrets;
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
      includedFields: { ...this.includedFields },
      autoSanitizeSecrets: this.autoSanitizeSecrets,
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

    let cleanMessage = message;
    let cleanDetails = detailsString;
    let cleanStack = stack;
    let cleanPath = pathStr;

    if (this.autoSanitizeSecrets) {
      cleanMessage = sanitizeLogString(message);
      cleanDetails = detailsString ? sanitizeLogString(detailsString) : undefined;
      cleanStack = stack ? sanitizeLogString(stack) : undefined;
      cleanPath = pathStr ? sanitizeLogString(pathStr) : undefined;
    }

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

    // Do not clear the queue before append succeeds: an I/O/permission/volume
    // error must leave the batch available for a later retry or graceful flush.
    const queuedBatch = [...this.pendingFileWrites];
    const linesToWrite = queuedBatch.join('\n') + '\n';

    try {
      this.rotateLogFileIfNeeded();
      fs.appendFileSync(this.logFilePath, linesToWrite, 'utf-8');
      this.pendingFileWrites.splice(0, queuedBatch.length);
    } catch (err) {
      console.warn('[SystemLogger] Dosyaya yazılamadı; kuyruk yeniden denemek üzere korundu:', err);
      this.flushTimeout = setTimeout(() => this.flushPendingWrites(), 1000);
      this.flushTimeout.unref?.();
      return;
    }

    // The append-only log is authoritative. A snapshot write failure must not
    // re-queue already-appended lines (which would create duplicate records).
    try {
      fs.writeFileSync(this.jsonBackupPath, JSON.stringify(this.inMemoryEvents.slice(0, 200), null, 2), 'utf-8');
    } catch (err) {
      console.warn('[SystemLogger] JSON log snapshot yazılamadı; ana log dosyası korundu:', err);
    }
  }

  /**
   * Immediately flushes any queued log writes to disk (used during graceful shutdown)
   */
  public flush(): void {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }
    this.flushPendingWrites();
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
   * Simplifies the bounded in-memory event list for the current runtime only.
   * The append-only log and rotation backups are historical records and must never
   * be rewritten from this bounded cache, otherwise older events would be lost.
   */
  public simplifyExistingLogs(): { removedCount: number; remainingCount: number } {
    const beforeCount = this.inMemoryEvents.length;
    const simplified: SystemEvent[] = [];
    let lastEventKey: string | null = null;
    let lastDbState: string | null = null;
    const seenMessageTimes = new Map<string, number>();

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

      // 2. Remove routine HTTP 200 / 304 GET static assets, vite dev scripts, and module bundles
      if (
        evt.category === 'http' &&
        evt.level === 'info' &&
        (
          msg.includes('GET / ') ||
          msg.includes('GET / (') ||
          msg.includes('GET /index.html') ||
          msg.includes('GET /@') ||
          msg.includes('GET /src/') ||
          msg.includes('GET /node_modules/') ||
          msg.includes('GET /assets/') ||
          msg.includes('GET /public/') ||
          msg.includes('GET /favicon.') ||
          /\.(js|jsx|ts|tsx|css|scss|svg|png|jpg|jpeg|gif|ico|woff|woff2|ttf|eot|map|html)\b/i.test(msg) ||
          (evt.path && (
            evt.path.startsWith('/@') ||
            evt.path.startsWith('/src/') ||
            evt.path.startsWith('/node_modules/') ||
            evt.path.startsWith('/assets/') ||
            /\.(js|jsx|ts|tsx|css|scss|svg|png|jpg|jpeg|gif|ico|woff|woff2|ttf|eot|map|html)$/i.test(evt.path)
          ))
        )
      ) {
        continue;
      }

      // 3. Deduplicate identical messages in rapid succession or within a 10-minute window
      const baseMsg = msg.split(' (Önceki')[0].trim();
      const eventKey = `${evt.level}:${evt.category}:${baseMsg}`;
      const lastTime = seenMessageTimes.get(eventKey);
      const currentTime = new Date(evt.timestamp).getTime();

      if (eventKey === lastEventKey || (lastTime && currentTime - lastTime < 10 * 60 * 1000)) {
        continue;
      }

      lastEventKey = eventKey;
      seenMessageTimes.set(eventKey, currentTime);

      simplified.push(evt);
    }

    // inMemoryEvents stores newest first
    this.inMemoryEvents = [...simplified].reverse();
    const removedCount = beforeCount - this.inMemoryEvents.length;

    // This is an in-memory presentation cleanup only. Never rewrite the
    // append-only source log from a bounded RAM buffer: doing so would delete
    // older history and rotated records. Explicit archival/retention is separate.

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
