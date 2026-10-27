import type { Device, DeviceOutputDefinition, OutputType, DeviceCommand } from '../../../types';

export type CommandActionStatus = 'idle' | 'gönderiliyor' | 'başarılı' | 'başarısız' | 'timeout';

export interface OutputControlState {
  outputId: string;
  status: CommandActionStatus;
  lastValue?: any;
  commandId?: string;
  message?: string;
  sentAt?: number;
  completedAt?: number;
  durationMs?: number;
}
