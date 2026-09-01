import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Play, Activity, Power, Settings2, Save, X, Cpu } from 'lucide-react';
import type { Device, Automation } from '../types.js';

export const AutomationsView: React.FC = () => {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    enabled: true,
    triggerDeviceId: '',
    triggerMetric: '',
    triggerCondition: 'GREATER_THAN',
    triggerValue: '',
    actionDeviceId: '',
    actionCommandPayload: '{"relay_1": 1}',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [autoRes, devRes] = await Promise.all([
        fetch('/api/automations', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }),
        fetch('/api/devices', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        })
      ]);
      
      if (autoRes.ok && devRes.ok) {
        setAutomations(await autoRes.json());
        setDevices(await devRes.json());
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      let parsedPayload = {};
      try {
        parsedPayload = JSON.parse(formData.actionCommandPayload);
      } catch (err) {
        throw new Error('Komut formatı geçerli bir JSON olmalıdır. Örn: {"roley1": 1}');
      }

      const payload = {
        name: formData.name,
        enabled: formData.enabled,
        trigger: {
          deviceId: formData.triggerDeviceId,
          metric: formData.triggerMetric,
          condition: formData.triggerCondition,
          value: formData.triggerValue
        },
        action: {
          deviceId: formData.actionDeviceId,
          commandPayload: parsedPayload
        }
      };

      const url = editingId ? `/api/automations/${editingId}` : '/api/automations';
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error(await res.text());

      setIsFormOpen(false);
      setEditingId(null);
      fetchData();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Silmek istediğinize emin misiniz?')) return;
    try {
      await fetch(`/api/automations/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const openEdit = (auto: Automation) => {
    setEditingId(auto.id);
    setFormData({
      name: auto.name,
      enabled: auto.enabled,
      triggerDeviceId: auto.trigger.deviceId,
      triggerMetric: auto.trigger.metric,
      triggerCondition: auto.trigger.condition,
      triggerValue: String(auto.trigger.value),
      actionDeviceId: auto.action.deviceId,
      actionCommandPayload: JSON.stringify(auto.action.commandPayload, null, 2),
    });
    setIsFormOpen(true);
  };

  if (loading) return <div className="p-8">Yükleniyor...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Activity className="w-7 h-7 text-indigo-500" />
            Otomasyon & Senaryolar
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Cihazlarınızdan gelen verilere göre otomatik senaryolar ve cihaz kontrolleri oluşturun.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingId(null);
            setFormData({
              name: '',
              enabled: true,
              triggerDeviceId: devices[0]?.id || '',
              triggerMetric: 'temperature',
              triggerCondition: 'GREATER_THAN',
              triggerValue: '30',
              actionDeviceId: devices[0]?.id || '',
              actionCommandPayload: '{"role_1": 1}',
            });
            setIsFormOpen(true);
          }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-indigo-600/20 flex items-center gap-2 transition"
        >
          <Plus className="w-5 h-5" />
          Yeni Senaryo
        </button>
      </div>

      {isFormOpen && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 animate-fadeIn">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-indigo-500" />
              {editingId ? 'Senaryoyu Düzenle' : 'Yeni Senaryo Oluştur'}
            </h3>
            <button onClick={() => setIsFormOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg">
              <X className="w-6 h-6" />
            </button>
          </div>

          {error && <div className="mb-6 p-4 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 rounded-xl text-sm font-medium">{error}</div>}

          <form onSubmit={handleSave} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Trigger Section */}
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-4">
                <h4 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-500" />
                  Eğer (Tetikleyici)
                </h4>
                
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Kaynak Cihaz</label>
                  <select
                    required
                    value={formData.triggerDeviceId}
                    onChange={e => setFormData({ ...formData, triggerDeviceId: e.target.value })}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">Cihaz Seçin</option>
                    {devices.map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.hardwareModel || 'Bilinmiyor'})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Metrik (Örn: temperature)</label>
                    <input
                      required
                      type="text"
                      value={formData.triggerMetric}
                      onChange={e => setFormData({ ...formData, triggerMetric: e.target.value })}
                      placeholder="temperature"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Değer</label>
                    <input
                      required
                      type="text"
                      value={formData.triggerValue}
                      onChange={e => setFormData({ ...formData, triggerValue: e.target.value })}
                      placeholder="30"
                      className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Koşul</label>
                  <select
                    value={formData.triggerCondition}
                    onChange={e => setFormData({ ...formData, triggerCondition: e.target.value as any })}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2.5 text-sm dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="GREATER_THAN">Büyüktür (&gt;)</option>
                    <option value="LESS_THAN">Küçüktür (&lt;)</option>
                    <option value="EQUALS">Eşittir (==)</option>
                    <option value="NOT_EQUALS">Eşit Değildir (!=)</option>
                  </select>
                </div>
              </div>

              {/* Action Section */}
              <div className="p-5 rounded-2xl bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-500/20 space-y-4">
                <h4 className="font-semibold text-indigo-900 dark:text-indigo-400 flex items-center gap-2">
                  <Play className="w-4 h-4" />
                  O Zaman Yap (Aksiyon)
                </h4>
                
                <div>
                  <label className="block text-xs font-semibold text-indigo-900/60 dark:text-indigo-400/60 mb-1">Hedef Cihaz</label>
                  <select
                    required
                    value={formData.actionDeviceId}
                    onChange={e => setFormData({ ...formData, actionDeviceId: e.target.value })}
                    className="w-full bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-500/30 rounded-xl px-3 py-2.5 text-sm dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">Cihaz Seçin</option>
                    {devices.map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.hardwareModel || 'Bilinmiyor'})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-indigo-900/60 dark:text-indigo-400/60 mb-1">Gönderilecek Komut (JSON)</label>
                  <textarea
                    required
                    value={formData.actionCommandPayload}
                    onChange={e => setFormData({ ...formData, actionCommandPayload: e.target.value })}
                    className="w-full h-32 font-mono text-sm bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-500/30 rounded-xl px-3 py-2.5 dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none"
                    placeholder={`{\n  "relay_1": 1\n}`}
                  />
                  <p className="text-[10px] text-indigo-900/50 dark:text-indigo-400/50 mt-1">
                    Cihaza doğrudan gönderilecek JSON formatındaki payload.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Senaryo Adı (Örn: Aşırı Sıcaklık Fanı)"
                  className="w-64 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-sm font-medium dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={formData.enabled}
                    onChange={e => setFormData({ ...formData, enabled: e.target.checked })}
                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                  />
                  Aktif
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-5 py-2 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-indigo-600/20 flex items-center gap-2 transition"
                >
                  <Save className="w-4 h-4" />
                  Kaydet
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {automations.map(auto => {
          const triggerDev = devices.find(d => d.id === auto.trigger.deviceId);
          const actionDev = devices.find(d => d.id === auto.action.deviceId);
          
          return (
            <div key={auto.id} className={`p-6 rounded-3xl border transition-all ${auto.enabled ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm hover:border-indigo-500/30' : 'bg-slate-50 dark:bg-slate-950/50 border-slate-200 dark:border-slate-800 opacity-60'}`}>
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${auto.enabled ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400' : 'bg-slate-200 text-slate-500 dark:bg-slate-800'}`}>
                    <Cpu className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-base">
                      {auto.name}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`w-2 h-2 rounded-full ${auto.enabled ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                      <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                        {auto.enabled ? 'Aktif' : 'Devre Dışı'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(auto)} className="p-1.5 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(auto.id)} className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="bg-slate-50 dark:bg-slate-950/50 rounded-xl p-3 border border-slate-100 dark:border-slate-800">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Koşul (Eğer)</div>
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    <span className="text-indigo-600 dark:text-indigo-400">{triggerDev?.name || 'Bilinmeyen Cihaz'}</span>
                    {' '}üzerindeki{' '}
                    <span className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 rounded font-mono text-xs">{auto.trigger.metric}</span>
                    {' '}{auto.trigger.condition === 'GREATER_THAN' ? '>' : auto.trigger.condition === 'LESS_THAN' ? '<' : auto.trigger.condition === 'EQUALS' ? '==' : '!='}{' '}
                    <span className="font-bold">{auto.trigger.value}</span>
                  </div>
                </div>

                <div className="bg-indigo-50 dark:bg-indigo-500/5 rounded-xl p-3 border border-indigo-100 dark:border-indigo-500/10">
                  <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1">Aksiyon (O Zaman)</div>
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    <span className="text-indigo-600 dark:text-indigo-400">{actionDev?.name || 'Bilinmeyen Cihaz'}</span>
                    {' '}cihazına gönder:{' '}
                    <div className="mt-1.5 px-2 py-1.5 bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-500/20 rounded-lg font-mono text-xs overflow-x-auto text-indigo-700 dark:text-indigo-300">
                      {JSON.stringify(auto.action.commandPayload)}
                    </div>
                  </div>
                </div>
              </div>

              {auto.lastTriggered && (
                <div className="mt-4 text-[11px] text-slate-500 flex justify-between items-center">
                  <span>Son tetiklenme:</span>
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {new Date(auto.lastTriggered).toLocaleString('tr-TR')}
                  </span>
                </div>
              )}
            </div>
          );
        })}
        {automations.length === 0 && !isFormOpen && (
          <div className="col-span-full py-16 flex flex-col items-center justify-center text-slate-500">
            <Activity className="w-16 h-16 text-slate-300 dark:text-slate-700 mb-4" />
            <p className="text-lg font-medium text-slate-600 dark:text-slate-400">Henüz senaryo oluşturmadınız.</p>
            <p className="text-sm mt-1">Cihazlarınız arasında otomasyon kurmak için "Yeni Senaryo" butonuna tıklayın.</p>
          </div>
        )}
      </div>
    </div>
  );
};
