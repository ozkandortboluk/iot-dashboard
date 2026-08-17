export interface RateLimitResult {
  allowed: boolean;
  currentCount: number;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetTime: number;
}

export class RateLimiterService {
  // Device sliding window map: deviceId -> array of epoch millisecond timestamps
  private deviceWindows = new Map<string, number[]>();

  // IP sliding window map: ip -> array of epoch millisecond timestamps
  private ipWindows = new Map<string, number[]>();

  // Total rate-limited packet drop counter for telemetry stats
  private totalDroppedPackets = 0;

  constructor() {
    // Run cleanup every 2 minutes to remove inactive keys and prevent memory growth
    setInterval(() => this.cleanup(), 120_000);
  }

  /**
   * Evaluates and records a request for a specific device using its configured rate limit per minute.
   * Uses a sliding window algorithm with sub-millisecond precision.
   */
  public checkDeviceRateLimit(deviceId: string, limitPerMin = 120): RateLimitResult {
    const now = Date.now();
    const windowStart = now - 60_000; // 60-second sliding window

    let timestamps = this.deviceWindows.get(deviceId);
    if (!timestamps) {
      timestamps = [];
      this.deviceWindows.set(deviceId, timestamps);
    }

    // Purge timestamps older than 60 seconds
    const validIdx = timestamps.findIndex((ts) => ts > windowStart);
    if (validIdx === -1) {
      timestamps.length = 0;
    } else if (validIdx > 0) {
      timestamps.splice(0, validIdx);
    }

    const effectiveLimit = Math.max(1, limitPerMin);

    if (timestamps.length >= effectiveLimit) {
      this.totalDroppedPackets++;
      const earliest = timestamps[0] || now;
      const retryAfterSeconds = Math.max(1, Math.ceil((earliest + 60_000 - now) / 1000));
      const resetTime = Math.floor((earliest + 60_000) / 1000);

      return {
        allowed: false,
        currentCount: timestamps.length,
        limit: effectiveLimit,
        remaining: 0,
        retryAfterSeconds,
        resetTime,
      };
    }

    timestamps.push(now);
    const remaining = Math.max(0, effectiveLimit - timestamps.length);
    const resetTime = Math.floor((timestamps[0] + 60_000) / 1000);

    return {
      allowed: true,
      currentCount: timestamps.length,
      limit: effectiveLimit,
      remaining,
      retryAfterSeconds: 0,
      resetTime,
    };
  }

  /**
   * IP-based rate limiter for unauthorized spam or unauthenticated packets.
   */
  public checkIpRateLimit(ip: string, limitPerMin = 300): RateLimitResult {
    const now = Date.now();
    const windowStart = now - 60_000;

    let timestamps = this.ipWindows.get(ip);
    if (!timestamps) {
      timestamps = [];
      this.ipWindows.set(ip, timestamps);
    }

    const validIdx = timestamps.findIndex((ts) => ts > windowStart);
    if (validIdx === -1) {
      timestamps.length = 0;
    } else if (validIdx > 0) {
      timestamps.splice(0, validIdx);
    }

    const effectiveLimit = Math.max(1, limitPerMin);

    if (timestamps.length >= effectiveLimit) {
      this.totalDroppedPackets++;
      const earliest = timestamps[0] || now;
      const retryAfterSeconds = Math.max(1, Math.ceil((earliest + 60_000 - now) / 1000));
      const resetTime = Math.floor((earliest + 60_000) / 1000);

      return {
        allowed: false,
        currentCount: timestamps.length,
        limit: effectiveLimit,
        remaining: 0,
        retryAfterSeconds,
        resetTime,
      };
    }

    timestamps.push(now);
    const remaining = Math.max(0, effectiveLimit - timestamps.length);
    const resetTime = Math.floor((timestamps[0] + 60_000) / 1000);

    return {
      allowed: true,
      currentCount: timestamps.length,
      limit: effectiveLimit,
      remaining,
      retryAfterSeconds: 0,
      resetTime,
    };
  }

  /**
   * Returns current rate limit metrics for telemetry monitoring / stats.
   */
  public getStats() {
    return {
      totalDroppedPackets: this.totalDroppedPackets,
      trackedDevicesCount: this.deviceWindows.size,
      trackedIpsCount: this.ipWindows.size,
    };
  }

  /**
   * Resets rate limit window for a specific device (e.g. on manual unlock / restart).
   */
  public resetDevice(deviceId: string) {
    this.deviceWindows.delete(deviceId);
  }

  /**
   * Cleans up stale in-memory windows.
   */
  private cleanup() {
    const windowStart = Date.now() - 60_000;

    for (const [key, timestamps] of this.deviceWindows.entries()) {
      const validIdx = timestamps.findIndex((ts) => ts > windowStart);
      if (validIdx === -1 || timestamps.length === 0) {
        this.deviceWindows.delete(key);
      } else if (validIdx > 0) {
        timestamps.splice(0, validIdx);
      }
    }

    for (const [key, timestamps] of this.ipWindows.entries()) {
      const validIdx = timestamps.findIndex((ts) => ts > windowStart);
      if (validIdx === -1 || timestamps.length === 0) {
        this.ipWindows.delete(key);
      } else if (validIdx > 0) {
        timestamps.splice(0, validIdx);
      }
    }
  }
}

export const rateLimiterService = new RateLimiterService();
