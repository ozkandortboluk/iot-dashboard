import fs from 'fs';
import path from 'path';
import type { SystemEvent, SystemEventLevel, SystemEventCategory } from '../../types.js';

class SystemLoggerService {
  private inMemoryEvents: SystemEvent[] = [];
  private maxInMemoryEvents = 1000;
  private logDir = path.join(process.cwd(), 'logs');
  private logFilePath = path.join(this.logDir, 'system_events.log');
  private jsonBackupPath = path.join(process.cwd(), 'data', 'system_events.json');
  private flushTimeout: NodeJS.Timeout | null = null;
  private pendingFileWrites: string[] = [];

  constructor() {
    this.ensureLogDirectory();
    this.loadPersistedEvents();
  }

  private ensureLogDirectory(): void {
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

  public log(
    level: SystemEventLevel,
    category: SystemEventCategory,
    message: string,
    details?: any,
    source?: string
  ): SystemEvent {
    const event: SystemEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      details: details ? (typeof details === 'object' ? JSON.stringify(details) : String(details)) : undefined,
      source: source || 'system',
    };

    // Add to circular memory buffer
    this.inMemoryEvents.unshift(event);
    if (this.inMemoryEvents.length > this.maxInMemoryEvents) {
      this.inMemoryEvents.length = this.maxInMemoryEvents;
    }

    // Console logging with tag
    const logPrefix = `[SystemLog][${level.toUpperCase()}][${category.toUpperCase()}]`;
    if (level === 'critical' || level === 'error') {
      console.error(logPrefix, message, details || '');
    } else if (level === 'warn') {
      console.warn(logPrefix, message, details || '');
    } else {
      console.log(logPrefix, message);
    }

    // Schedule async file persistence
    this.queueFilePersistence(event);

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
      fs.appendFileSync(this.logFilePath, linesToWrite, 'utf-8');
      // Save recent 200 events to data/system_events.json for fast reload
      fs.writeFileSync(this.jsonBackupPath, JSON.stringify(this.inMemoryEvents.slice(0, 200), null, 2), 'utf-8');
    } catch (err) {
      console.warn('[SystemLogger] Dosyaya yazılamadı:', err);
    }
  }

  public getEvents(options: {
    limit?: number;
    level?: SystemEventLevel;
    category?: SystemEventCategory;
    search?: string;
  } = {}): { events: SystemEvent[]; total: number } {
    let filtered = [...this.inMemoryEvents];

    if (options.level) {
      filtered = filtered.filter((e) => e.level === options.level);
    }

    if (options.category) {
      filtered = filtered.filter((e) => e.category === options.category);
    }

    if (options.search && options.search.trim()) {
      const q = options.search.toLowerCase().trim();
      filtered = filtered.filter((e) =>
        e.message.toLowerCase().includes(q) ||
        (e.details && e.details.toLowerCase().includes(q)) ||
        e.category.toLowerCase().includes(q) ||
        (e.source && e.source.toLowerCase().includes(q))
      );
    }

    const limit = Math.min(Math.max(1, options.limit || 100), 1000);
    return {
      events: filtered.slice(0, limit),
      total: filtered.length,
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
    this.info('server', 'Sistem olay günlükleri yönetici tarafından temizlendi.');
  }
}

export const systemLogger = new SystemLoggerService();
