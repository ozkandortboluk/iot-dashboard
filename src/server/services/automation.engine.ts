import { db } from '../db.js';
import { broadcast } from './websocket.js';
import { commandService } from './command.service.js';
import type { TelemetryReading, Automation } from '../../types.js';

export class AutomationEngine {
  public evaluateAutomations(reading: TelemetryReading) {
    const automations = db.data.automations || [];
    if (automations.length === 0) return;

    const activeAutomations = automations.filter(a => a.enabled && a.trigger.deviceId === reading.deviceId);

    for (const auto of activeAutomations) {
      const val = reading.metric === auto.trigger.metric
        ? reading.value
        : ((reading as Record<string, any>).data?.[auto.trigger.metric]);
      if (val === undefined || val === null) continue;

      let triggered = false;
      const numVal = Number(val);
      const thresNum = Number(auto.trigger.value);

      switch (auto.trigger.condition) {
        case 'GREATER_THAN':
          if (!isNaN(numVal) && !isNaN(thresNum) && numVal > thresNum) triggered = true;
          break;
        case 'LESS_THAN':
          if (!isNaN(numVal) && !isNaN(thresNum) && numVal < thresNum) triggered = true;
          break;
        case 'EQUALS':
          if (String(val) === String(auto.trigger.value)) triggered = true;
          break;
        case 'NOT_EQUALS':
          if (String(val) !== String(auto.trigger.value)) triggered = true;
          break;
      }

      if (triggered) {
        // Debounce: don't trigger if it was triggered less than 60 seconds ago
        if (auto.lastTriggered) {
          const lastT = new Date(auto.lastTriggered).getTime();
          if (Date.now() - lastT < 60000) {
            continue;
          }
        }

        // Trigger the action
        this.executeAction(auto);
        
        // Update lastTriggered
        db.updateAutomation(auto.id, { lastTriggered: new Date().toISOString() });
      }
    }
  }

  private async executeAction(auto: Automation) {
    console.log(`[Automation] Triggering automation: ${auto.name}`);
    const device = db.getDevices().find(d => d.id === auto.action.deviceId);
    if (!device) return;

    try {
      await commandService.createCommand(
        {
          deviceId: device.id,
          commandPayload: typeof auto.action.commandPayload === 'string'
            ? auto.action.commandPayload
            : JSON.stringify(auto.action.commandPayload),
        },
        {
          id: 'system_automation',
          name: 'Otomasyon Motoru',
          role: 'admin',
        }
      );

      db.addAuditLog(
        auto.tenantId || device.tenantId || 'system',
        'System Automation',
        `Otomasyon tetiklendi: "${auto.name}". Cihaz: ${device.name} hedefine komut gönderildi.`,
        'high'
      );
    } catch (err: any) {
      console.error(`[Automation] Komut gönderim hatası (${auto.name}):`, err?.message || err);
    }
  }
}

export const automationEngine = new AutomationEngine();
