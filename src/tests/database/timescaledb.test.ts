import { describe, it, expect } from 'vitest';

export function calculateTimeBucket(timestampMs: number, bucketSeconds: number): number {
  const bucketMs = bucketSeconds * 1000;
  return Math.floor(timestampMs / bucketMs) * bucketMs;
}

export interface RawReading {
  deviceId: string;
  metric: string;
  value: number;
  createdAt: number;
}

export function aggregateReadingsByBucket(
  readings: RawReading[],
  bucketSeconds: number
): { timeBucket: number; deviceId: string; metric: string; avg: number; min: number; max: number; count: number }[] {
  const groups = new Map<string, { timeBucket: number; deviceId: string; metric: string; values: number[] }>();

  for (const r of readings) {
    const bucket = calculateTimeBucket(r.createdAt, bucketSeconds);
    const key = `${bucket}_${r.deviceId}_${r.metric}`;
    if (!groups.has(key)) {
      groups.set(key, { timeBucket: bucket, deviceId: r.deviceId, metric: r.metric, values: [] });
    }
    groups.get(key)!.values.push(r.value);
  }

  return Array.from(groups.values()).map((g) => {
    const count = g.values.length;
    const sum = g.values.reduce((a, b) => a + b, 0);
    const min = Math.min(...g.values);
    const max = Math.max(...g.values);
    const avg = Number((sum / count).toFixed(2));
    return { timeBucket: g.timeBucket, deviceId: g.deviceId, metric: g.metric, avg, min, max, count };
  });
}

describe('TimescaleDB Time-Series Engine Test Suite', () => {
  it('should align timestamps into discrete time_bucket slots', () => {
    // 5-minute buckets (300 seconds)
    const t1 = new Date('2026-08-15T10:04:23.000Z').getTime();
    const t2 = new Date('2026-08-15T10:04:59.000Z').getTime();
    const t3 = new Date('2026-08-15T10:05:01.000Z').getTime();

    const b1 = calculateTimeBucket(t1, 300);
    const b2 = calculateTimeBucket(t2, 300);
    const b3 = calculateTimeBucket(t3, 300);

    expect(b1).toBe(b2); // Both fall into 10:00:00 bucket
    expect(b3).toBeGreaterThan(b1); // Falls into 10:05:00 bucket
  });

  it('should compute accurate downsampling aggregates (AVG, MIN, MAX, COUNT)', () => {
    const baseTime = new Date('2026-08-15T12:00:00.000Z').getTime();
    const mockReadings: RawReading[] = [
      { deviceId: 'dev-01', metric: 'temperature', value: 20.0, createdAt: baseTime + 10 * 1000 },
      { deviceId: 'dev-01', metric: 'temperature', value: 25.0, createdAt: baseTime + 30 * 1000 },
      { deviceId: 'dev-01', metric: 'temperature', value: 30.0, createdAt: baseTime + 50 * 1000 },
      { deviceId: 'dev-01', metric: 'temperature', value: 40.0, createdAt: baseTime + 120 * 1000 }, // in next 1m bucket
    ];

    const aggregates1m = aggregateReadingsByBucket(mockReadings, 60);

    expect(aggregates1m).toHaveLength(2);

    const firstBucket = aggregates1m[0];
    expect(firstBucket.count).toBe(3);
    expect(firstBucket.min).toBe(20.0);
    expect(firstBucket.max).toBe(30.0);
    expect(firstBucket.avg).toBe(25.0);

    const secondBucket = aggregates1m[1];
    expect(secondBucket.count).toBe(1);
    expect(secondBucket.avg).toBe(40.0);
  });

  it('should calculate compression savings percentage correctly', () => {
    const rawBytes = 10485760; // 10 MB
    const compressedBytes = 838860; // 0.8 MB

    const savedBytes = rawBytes - compressedBytes;
    const ratio = Number(((savedBytes / rawBytes) * 100).toFixed(1));

    expect(ratio).toBe(92.0);
    expect(savedBytes).toBe(9646900);
  });
});
