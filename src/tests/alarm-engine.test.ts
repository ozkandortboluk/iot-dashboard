import { describe, it, expect } from 'vitest';

export interface AlarmRule {
  id: string;
  deviceId: string;
  metric: string;
  condition: '>' | '<' | '>=' | '<=' | '==' | '!=';
  threshold: number;
  severity: 'critical' | 'warning' | 'info';
  enabled: boolean;
  cooldownSeconds?: number;
  lastTriggered?: number;
}

export function evaluateAlarm(rule: AlarmRule, value: number, currentTime = Date.now()): { triggered: boolean; reason?: string } {
  if (!rule.enabled) {
    return { triggered: false, reason: 'Rule is disabled' };
  }

  if (rule.cooldownSeconds && rule.lastTriggered) {
    const elapsed = (currentTime - rule.lastTriggered) / 1000;
    if (elapsed < rule.cooldownSeconds) {
      return { triggered: false, reason: `Cooldown active (${Math.ceil(rule.cooldownSeconds - elapsed)}s remaining)` };
    }
  }

  let triggered = false;
  switch (rule.condition) {
    case '>':
      triggered = value > rule.threshold;
      break;
    case '<':
      triggered = value < rule.threshold;
      break;
    case '>=':
      triggered = value >= rule.threshold;
      break;
    case '<=':
      triggered = value <= rule.threshold;
      break;
    case '==':
      triggered = Math.abs(value - rule.threshold) < 0.0001;
      break;
    case '!=':
      triggered = Math.abs(value - rule.threshold) >= 0.0001;
      break;
  }

  return {
    triggered,
    reason: triggered
      ? `Metric ${rule.metric} value ${value} triggered condition ${rule.condition} ${rule.threshold} (${rule.severity})`
      : 'Value within normal threshold range',
  };
}

describe('Industrial IoT Alarm Engine Test Suite', () => {
  const temperatureRule: AlarmRule = {
    id: 'rule-temp-crit',
    deviceId: 'esp32-factory-01',
    metric: 'temperature',
    condition: '>',
    threshold: 85.0,
    severity: 'critical',
    enabled: true,
    cooldownSeconds: 60,
  };

  it('should trigger critical alarm when temperature exceeds 85°C threshold', () => {
    const result = evaluateAlarm(temperatureRule, 88.5);
    expect(result.triggered).toBe(true);
    expect(result.reason).toContain('critical');
    expect(result.reason).toContain('88.5');
  });

  it('should NOT trigger alarm when temperature is below threshold', () => {
    const result = evaluateAlarm(temperatureRule, 45.2);
    expect(result.triggered).toBe(false);
  });

  it('should respect disabled rule state', () => {
    const disabledRule: AlarmRule = { ...temperatureRule, enabled: false };
    const result = evaluateAlarm(disabledRule, 99.0);
    expect(result.triggered).toBe(false);
    expect(result.reason).toContain('disabled');
  });

  it('should enforce alarm cooldown periods to avoid alert flapping', () => {
    const now = Date.now();
    const ruleWithRecentTrigger: AlarmRule = {
      ...temperatureRule,
      lastTriggered: now - 30 * 1000, // Triggered 30 seconds ago (cooldown is 60s)
    };

    const result = evaluateAlarm(ruleWithRecentTrigger, 92.0, now);
    expect(result.triggered).toBe(false);
    expect(result.reason).toContain('Cooldown active');
  });

  it('should trigger again after cooldown period has elapsed', () => {
    const now = Date.now();
    const ruleWithOldTrigger: AlarmRule = {
      ...temperatureRule,
      lastTriggered: now - 65 * 1000, // Triggered 65s ago
    };

    const result = evaluateAlarm(ruleWithOldTrigger, 92.0, now);
    expect(result.triggered).toBe(true);
  });

  it('should evaluate complex inequality operators correctly (<, <=, >=, ==)', () => {
    const lowPressureRule: AlarmRule = {
      id: 'rule-pressure-low',
      deviceId: 'boiler-sensor-03',
      metric: 'pressure',
      condition: '<=',
      threshold: 1.5,
      severity: 'warning',
      enabled: true,
    };

    expect(evaluateAlarm(lowPressureRule, 1.4).triggered).toBe(true);
    expect(evaluateAlarm(lowPressureRule, 1.5).triggered).toBe(true);
    expect(evaluateAlarm(lowPressureRule, 1.6).triggered).toBe(false);
  });
});
