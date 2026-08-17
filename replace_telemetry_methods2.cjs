const fs = require('fs');
let code = fs.readFileSync('src/server/db.ts', 'utf8');

const replacement = `  // Telemetry
  public addTelemetryReading(reading: Omit<TelemetryReading, 'id' | 'timestamp'>): TelemetryReading { return this.telemetryRepository.addTelemetryReading(reading); }
  public getTelemetryStats(userId?: string, customerId?: string): any { return this.telemetryRepository.getTelemetryStats(userId, customerId); }
  public getHistory(deviceId: string, metric: string, timeRange: '1h' | '24h' | '7d' | '30d' = '24h'): any[] { return this.telemetryRepository.getHistory(deviceId, metric, timeRange); }
  public async getHistoryAsync(deviceId: string, metric: string, timeRange: '1h' | '24h' | '7d' | '30d' = '24h'): Promise<any[]> { return this.telemetryRepository.getHistoryAsync(deviceId, metric, timeRange); }
  public getTelemetry(deviceId?: string, metric?: string, limit: number = 100, userId?: string, customerId?: string): TelemetryReading[] { return this.telemetryRepository.getTelemetry(deviceId, metric, limit, userId, customerId); }
  public async getTelemetryAsync(deviceId?: string, metric?: string, limit: number = 100, userId?: string, customerId?: string): Promise<TelemetryReading[]> { return this.telemetryRepository.getTelemetryAsync(deviceId, metric, limit, userId, customerId); }
  // Notifications`;

code = code.replace(/  public addTelemetryReading.*?\/\/ Notifications/s, replacement);
fs.writeFileSync('src/server/db.ts', code);
