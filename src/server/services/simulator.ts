import { db } from '../db.js';
import { broadcast } from './websocket.js';
import type { TelemetryReading, Device } from '../../types.js';

export let simulatorActive = true;
export let simulatorIntervalMs = 2000;
export let anomalyProbability = 0.05; // 5% chance of warning/critical anomaly
export let activeScenario = 'normal'; // 'normal', 'overheat', 'spike_burst', 'sine_wave'
export let telemetryIngestedCount = 0;
let stepCounter = 0;
let simTimeout: NodeJS.Timeout | null = null;

export function setSimulatorActive(active: boolean) {
  simulatorActive = active;
}

export function setSimulatorConfig(config: { intervalMs?: number; anomalyRate?: number; scenario?: string; active?: boolean }) {
  if (config.intervalMs !== undefined && typeof config.intervalMs === 'number') {
    simulatorIntervalMs = Math.max(200, Math.min(60000, config.intervalMs));
    scheduleSimulationStep();
  }
  if (config.anomalyRate !== undefined && typeof config.anomalyRate === 'number') {
    anomalyProbability = Math.max(0, Math.min(1, config.anomalyRate));
  }
  if (config.scenario !== undefined && typeof config.scenario === 'string') {
    activeScenario = config.scenario;
  }
  if (config.active !== undefined && typeof config.active === 'boolean') {
    simulatorActive = config.active;
  }
}

export function incrementTelemetryIngested(count = 1) {
  telemetryIngestedCount += count;
}

export function computeValueForMetric(
  m: string,
  isAnomaly: boolean,
  currentStep: number,
  calculatedValues: Record<string, number> = {}
): { val: number; unit: string } {
  const mLower = m.toLowerCase();

  if (activeScenario === 'overheat' && ['temperature', 'temp', 'sicaklik', 'isi'].includes(mLower)) {
    return { val: Number((65 + Math.random() * 35).toFixed(1)), unit: '°C' };
  }
  if (activeScenario === 'spike_burst' && ['vibration', 'titresim'].includes(mLower)) {
    return { val: Number((12.0 + Math.random() * 25.0).toFixed(1)), unit: 'mm/s' };
  }
  if (activeScenario === 'sine_wave' && ['power', 'p', 'active_power', 'kw', 'guc'].includes(mLower)) {
    return { val: Number((50 + 40 * Math.sin(currentStep / 3)).toFixed(1)), unit: 'kW' };
  }

  if (['l1', 'l2', 'l3', 'v1', 'v2', 'v3', 'voltage', 'voltage_l1', 'voltage_l2', 'voltage_l3'].includes(mLower)) {
    return {
      val: isAnomaly ? Number((185 + Math.random() * 15).toFixed(1)) : Number((224 + Math.random() * 10).toFixed(1)),
      unit: 'V',
    };
  } else if (['ri', 'ind_reactive', 'induktif', 'enduktif', 'reactive_ind'].includes(mLower)) {
    return {
      val: isAnomaly ? Number((7.5 + Math.random() * 3).toFixed(2)) : Number((1.2 + Math.random() * 3.5).toFixed(2)),
      unit: 'kVAr',
    };
  } else if (['rc', 'cap_reactive', 'kapasitif', 'reactive_cap'].includes(mLower)) {
    return {
      val: isAnomaly ? Number((5.5 + Math.random() * 2.5).toFixed(2)) : Number((0.5 + Math.random() * 2.0).toFixed(2)),
      unit: 'kVAr',
    };
  } else if (['p', 'power', 'active_power', 'kw', 'guc'].includes(mLower)) {
    return {
      val: isAnomaly ? Number((110 + Math.random() * 30).toFixed(1)) : Number((15 + Math.random() * 30).toFixed(1)),
      unit: 'kW',
    };
  } else if (['pct_ri', 'percent_ri', 'percent_ind', 'yuzde_ri', 'ri_percent', 'ri_ratio', 'pct_ind'].includes(mLower)) {
    const pVal = calculatedValues['p'] ?? calculatedValues['power'] ?? calculatedValues['kw'] ?? calculatedValues['active_power'];
    const riVal = calculatedValues['ri'] ?? calculatedValues['reactive_ind'] ?? calculatedValues['ind_reactive'];
    if (pVal !== undefined && riVal !== undefined && pVal > 0) {
      return { val: Number(((riVal / pVal) * 100).toFixed(1)), unit: '%' };
    }
    return {
      val: isAnomaly ? Number((22 + Math.random() * 8).toFixed(1)) : Number((8 + Math.random() * 8).toFixed(1)),
      unit: '%',
    };
  } else if (['pct_rc', 'percent_rc', 'percent_cap', 'yuzde_rc', 'rc_percent', 'rc_ratio', 'pct_cap'].includes(mLower)) {
    const pVal = calculatedValues['p'] ?? calculatedValues['power'] ?? calculatedValues['kw'] ?? calculatedValues['active_power'];
    const rcVal = calculatedValues['rc'] ?? calculatedValues['reactive_cap'] ?? calculatedValues['cap_reactive'];
    if (pVal !== undefined && rcVal !== undefined && pVal > 0) {
      return { val: Number(((rcVal / pVal) * 100).toFixed(1)), unit: '%' };
    }
    return {
      val: isAnomaly ? Number((18 + Math.random() * 6).toFixed(1)) : Number((2 + Math.random() * 6).toFixed(1)),
      unit: '%',
    };
  } else if (['temperature', 'temp', 'sicaklik', 'isi'].includes(mLower)) {
    return {
      val: isAnomaly ? Number((75 + Math.random() * 20).toFixed(1)) : Number((20 + Math.random() * 22).toFixed(1)),
      unit: '°C',
    };
  } else if (['humidity', 'nem'].includes(mLower)) {
    return { val: Number((35 + Math.random() * 45).toFixed(1)), unit: '%' };
  } else if (['pressure', 'basinc'].includes(mLower)) {
    return { val: Number((1005 + Math.random() * 25).toFixed(1)), unit: 'hPa' };
  } else if (['co2', 'co2_ppm'].includes(mLower)) {
    return {
      val: isAnomaly ? Number((1800 + Math.random() * 1000).toFixed(0)) : Number((400 + Math.random() * 600).toFixed(0)),
      unit: 'ppm',
    };
  } else if (['vibration', 'titresim'].includes(mLower)) {
    return {
      val: isAnomaly ? Number((15 + Math.random() * 10).toFixed(1)) : Number((1.2 + Math.random() * 6.8).toFixed(1)),
      unit: 'mm/s',
    };
  } else if (['cpu', 'memory', 'ram', 'disk'].includes(mLower)) {
    return {
      val: isAnomaly ? Number((88 + Math.random() * 11).toFixed(1)) : Number((25 + Math.random() * 55).toFixed(1)),
      unit: '%',
    };
  } else if (['bandwidth', 'bant_genisligi'].includes(mLower)) {
    return {
      val: isAnomaly ? Number((900 + Math.random() * 200).toFixed(1)) : Number((100 + Math.random() * 800).toFixed(1)),
      unit: 'Mbps',
    };
  } else if (['current', 'akim', 'i1', 'i2', 'i3'].includes(mLower)) {
    return { val: Number((5 + Math.random() * 40).toFixed(1)), unit: 'A' };
  } else if (['frequency', 'frekans', 'freq'].includes(mLower)) {
    return { val: Number((49.8 + Math.random() * 0.4).toFixed(2)), unit: 'Hz' };
  }

  return { val: Number((10 + Math.random() * 80).toFixed(1)), unit: 'birim' };
}

export function runSimulationStep() {
  if (!simulatorActive) return;

  // CRITICAL PROTECTION RULE:
  // Simulator MUST ONLY generate fake data for explicitly marked SIMULATED devices (isSimulated === true).
  // Real physical hardware devices (isSimulated === false) will NEVER receive fake simulator data.
  const devices = (db.getDevices() || []).filter(
    (d: Device) => d.isSimulated === true && d.dataFlowActive !== false && d.status !== 'maintenance'
  );
  if (!devices.length) return;

  stepCounter++;
  const isAnomaly = Math.random() < anomalyProbability;
  const stepReadings: TelemetryReading[] = [];

  for (const dev of devices) {
    if (!dev.isSimulated) continue;

    // Keep device online and refresh lastSeen on every simulation tick
    dev.status = 'online';
    dev.lastSeen = new Date().toISOString();

    let metricsToGenerate: string[] = [];

    if (activeScenario === 'overheat') {
      metricsToGenerate = ['temperature'];
    } else if (activeScenario === 'spike_burst') {
      metricsToGenerate = ['vibration'];
    } else if (activeScenario === 'sine_wave') {
      metricsToGenerate = ['power'];
    } else if (Array.isArray(dev.simulatedMetrics) && dev.simulatedMetrics.length > 0) {
      metricsToGenerate = dev.simulatedMetrics;
    } else {
      if (dev.type === 'server') {
        metricsToGenerate = ['cpu', 'memory', 'bandwidth'];
      } else if (dev.type === 'sensor') {
        metricsToGenerate = ['temperature', 'humidity', 'pressure', 'vibration', 'co2_ppm'];
      } else if (dev.type === 'meter' || dev.type === 'inverter') {
        metricsToGenerate = ['l1', 'l2', 'l3', 'ri', 'rc', 'p', 'pct_ri', 'pct_rc', 'power', 'voltage', 'current', 'frequency'];
      } else {
        metricsToGenerate = ['l1', 'l2', 'l3', 'ri', 'rc', 'p', 'temperature', 'humidity'];
      }
    }

    if (!metricsToGenerate || metricsToGenerate.length === 0) {
      metricsToGenerate = ['l1', 'l2', 'l3', 'ri', 'rc', 'p', 'temperature', 'humidity'];
    }

    const calculatedValues: Record<string, number> = {};

    for (const m of metricsToGenerate) {
      const { val, unit } = computeValueForMetric(m, isAnomaly, stepCounter, calculatedValues);
      calculatedValues[m.toLowerCase()] = val;

      const rawPayload = `${dev.apiKey}, ${dev.name}, ${m}:${val}:${unit}`;

      const reading = db.addTelemetryReading({
        deviceId: dev.id,
        deviceName: dev.name,
        metric: m,
        value: val,
        unit,
        status: 'normal',
        rawPayload,
      });

      telemetryIngestedCount++;
      stepReadings.push(reading);
    }
  }

  if (stepReadings.length > 0) {
    broadcast('telemetry:batch', stepReadings);
  }
}

export function scheduleSimulationStep() {
  if (simTimeout) clearTimeout(simTimeout);
  simTimeout = setTimeout(() => {
    runSimulationStep();
    scheduleSimulationStep();
  }, simulatorIntervalMs);
}

export function initSimulator() {
  scheduleSimulationStep();
}
