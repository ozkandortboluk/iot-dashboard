import { db } from '../db.js';
import { broadcast } from './websocket.js';
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

  private executeAction(auto: Automation) {
    console.log(`[Automation] Triggering automation: ${auto.name}`);
    const device = db.getDevices().find(d => d.id === auto.action.deviceId);
    if (!device) return;

    // Create a command
    const newCmd = {
      id: `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      deviceId: device.id,
      tenantId: device.tenantId,
      issuerId: 'system_automation',
      issuerName: 'Otomasyon Motoru',
      commandPayload: auto.action.commandPayload,
      status: 'PENDING',
      createdAt: new Date().toISOString()
    };

    if (!db.data.commands) db.data.commands = [];
    db.data.commands.push(newCmd as any);
    db.saveData(db.data);
    
    // Broadcast creation
    broadcast('command:created', newCmd);
    
    // Trigger the device to handle it (send over WS if online)
    // The easiest way is to let the existing MQTT/WS system handle PENDING commands 
    // or emit a control event
    broadcast('device:control', {
      deviceId: device.id,
      command: auto.action.commandPayload
    });

    db.addAuditLog(
      auto.tenantId,
      'System Automation',
      `Otomasyon tetiklendi: "${auto.name}". Cihaz: ${device.name} hedefine komut gönderildi.`,
      'high'
    );
  }
}

export const automationEngine = new AutomationEngine();
