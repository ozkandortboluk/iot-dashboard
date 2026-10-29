import { db } from '../db.js';
import { commandService } from './command.service.js';
import { systemLogger } from './systemLogger.service.js';
import type { TelemetryReading, Automation } from '../../types.js';

export class AutomationEngine {
  private enabled: boolean = true;

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(val: boolean): void {
    this.enabled = val;
  }

  private activeLocks = new Set<string>();

  public async evaluateAutomations(reading: TelemetryReading): Promise<void> {
    if (!this.enabled) return;
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
        // Cooldown: don't trigger if it was triggered less than 60 seconds ago
        if (auto.lastTriggered) {
          const lastT = new Date(auto.lastTriggered).getTime();
          if (Date.now() - lastT < 60000) {
            continue;
          }
        }

        // Concurrency lock: prevent duplicate concurrent triggers for the same automation
        if (this.activeLocks.has(auto.id)) {
          continue;
        }

        this.activeLocks.add(auto.id);
        try {
          // Execute command action & update lastTriggered ONLY IF command creation succeeded
          const success = await this.executeAction(auto);
          if (success) {
            db.updateAutomation(auto.id, { lastTriggered: new Date().toISOString() });
          }
        } finally {
          this.activeLocks.delete(auto.id);
        }
      }
    }
  }

  private async executeAction(auto: Automation): Promise<boolean> {
    console.log(`[Automation] Triggering automation: ${auto.name}`);
    const device = db.getDevices().find(d => d.id === auto.action.deviceId);
    
    if (!device) {
      systemLogger.error('system', `Otomasyon hedef cihazı bulunamadı (Automation ID: ${auto.id}, Device ID: ${auto.action.deviceId})`);
      db.addAuditLog(
        auto.tenantId || 'system',
        'System Automation',
        `Otomasyon BAŞARISIZ oldu: "${auto.name}". Hedef cihaz (${auto.action.deviceId}) sistemde kayıtlı değil veya silinmiş.`,
        'high'
      );
      return false;
    }

    // Tenant ownership verification at execution time
    if (auto.tenantId && device.tenantId && auto.tenantId !== device.tenantId) {
      systemLogger.error('system', `Otomasyon tenant sahipliği uyuşmazlığı (Auto Tenant: ${auto.tenantId}, Device Tenant: ${device.tenantId})`);
      db.addAuditLog(
        auto.tenantId,
        'System Automation',
        `Otomasyon İPTAL edildi: "${auto.name}". Cihaz (${device.name}) başka bir müşteriye/tenanta devredilmiş.`,
        'high'
      );
      return false;
    }

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
        `Otomasyon başarıyla tetiklendi: "${auto.name}". Cihaz: ${device.name} hedefine komut kalıcı olarak iletildi.`,
        'medium'
      );
      return true;
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      systemLogger.error('system', `Otomasyon komut kalıcılık hatası (${auto.name}): ${errMsg}`);
      db.addAuditLog(
        auto.tenantId || device.tenantId || 'system',
        'System Automation',
        `Otomasyon komut gönderimi BAŞARISIZ oldu: "${auto.name}". Hata: ${errMsg}`,
        'high'
      );
      return false;
    }
  }
}

export const automationEngine = new AutomationEngine();
