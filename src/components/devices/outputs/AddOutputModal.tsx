import React from 'react';
import { Plus, X } from 'lucide-react';
import type { Device, DeviceOutputDefinition, OutputType } from '../../../types';

interface AddOutputModalProps {
  device: Device;
  newOutput: Partial<DeviceOutputDefinition>;
  onNewOutputChange: (draft: Partial<DeviceOutputDefinition>) => void;
  onSave: () => void;
  onClose: () => void;
}

export const AddOutputModal: React.FC<AddOutputModalProps> = ({
  device,
  newOutput,
  onNewOutputChange,
  onSave,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full space-y-4 animate-scale-up">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-600 text-white">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                Yeni Saha Çıkışı Tanımla
              </h3>
              <p className="text-[11px] text-slate-500">
                Cihaz: <strong className="text-indigo-500">{device.name}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Çıkış Kimliği (outputId) *
            </label>
            <input
              type="text"
              placeholder="Örn: relay_3, valve_1, fan_pwm"
              value={newOutput.id || ''}
              onChange={(e) => onNewOutputChange({ ...newOutput, id: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-white"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              Çıkış Adı / Tanımı *
            </label>
            <input
              type="text"
              placeholder="Örn: Bahçe Sulama Valfi, Isıtıcı Rezistans"
              value={newOutput.name || ''}
              onChange={(e) => onNewOutputChange({ ...newOutput, name: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Çıkış Türü
              </label>
              <select
                value={newOutput.type || 'relay'}
                onChange={(e) => onNewOutputChange({ ...newOutput, type: e.target.value as OutputType })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-white"
              >
                <option value="relay">Röle (Relay)</option>
                <option value="digital">Dijital GPIO</option>
                <option value="pwm">PWM Hız / Dimmer</option>
                <option value="analog">Analog DAC</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                GPIO Pin No
              </label>
              <input
                type="number"
                placeholder="Örn: 26, 18, 4"
                value={newOutput.pin || ''}
                onChange={(e) => onNewOutputChange({ ...newOutput, pin: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none dark:text-white"
              />
            </div>
          </div>

          {newOutput.type === 'relay' && (
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="activeLowCheck"
                checked={newOutput.activeLow ?? true}
                onChange={(e) => onNewOutputChange({ ...newOutput, activeLow: e.target.checked })}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="activeLowCheck" className="text-slate-600 dark:text-slate-400 text-xs">
                Ters Lojik (Active-Low) Röle Modülü (LOW = Röle Çeker)
              </label>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700 text-xs cursor-pointer"
          >
            İptal
          </button>
          <button
            type="button"
            disabled={!newOutput.id || !newOutput.name}
            onClick={onSave}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-md shadow-indigo-600/20 text-xs cursor-pointer disabled:opacity-50"
          >
            Kaydet ve Uygula
          </button>
        </div>
      </div>
    </div>
  );
};
