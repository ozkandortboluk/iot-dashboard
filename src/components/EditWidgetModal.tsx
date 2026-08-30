import React, { useState, useEffect, useMemo } from 'react';
import type { Device, WidgetConfig, WidgetSpan, WidgetType, MatrixSlotConfig, ThresholdRule } from '../types';
import { useRealtime } from '../context/RealtimeContext';
import { useAuth } from '../context/AuthContext';
import { X, Sliders, Save, Trash2, Palette, Activity, Cpu, Layers, Tag, Grid, Bell, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { getMetricUnit, COMMON_UNITS, isInternalOrControlMetric } from '../lib/utils';
import { AlarmRuleWizard } from './notifications/AlarmRuleWizard';
import { apiFetch, safeJson } from '../lib/apiFetch';

interface EditWidgetModalProps {
  widget: WidgetConfig | null;
  isOpen: boolean;
  onClose: () => void;
  onNavigateToAlarms?: () => void;
}

export const EditWidgetModal: React.FC<EditWidgetModalProps> = ({ widget, isOpen, onClose, onNavigateToAlarms }) => {
  const { widgets, saveWidgets, devices, latestTelemetry, customersList } = useRealtime();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [title, setTitle] = useState('');
  const [type, setType] = useState<WidgetType>('area_chart');
  const [metricKey, setMetricKey] = useState('temperature');
  const [customUnit, setCustomUnit] = useState('');
  const [isCustomMetric, setIsCustomMetric] = useState(false);
  const [deviceId, setDeviceId] = useState('all');
  const [span, setSpan] = useState<WidgetSpan>(2);
  const [colorScheme, setColorScheme] = useState('#3b82f6');
  const [displayStyle, setDisplayStyle] = useState<'card' | 'glass' | 'neon' | 'flat'>('card');
  const [timeRange, setTimeRange] = useState<'live' | '1h' | '24h' | '7d'>('live');

  // Alarm Wizard & Integration State
  const [isAlarmWizardOpen, setIsAlarmWizardOpen] = useState(false);
  const [alarmSuccessBanner, setAlarmSuccessBanner] = useState<string | null>(null);

  // Control Widget specific state
  const [buttonCount, setButtonCount] = useState<1 | 2 | 3 | 4>(1);
  const [multiMetricCount, setMultiMetricCount] = useState<2 | 4>(2);
  const [sliderMin, setSliderMin] = useState<number>(0);
  const [sliderMax, setSliderMax] = useState<number>(100);
  const [sliderStep, setSliderStep] = useState<number>(1);
  const [outputPin, setOutputPin] = useState<string>('PWM_OUT_1');
  const [metricMappings, setMetricMappings] = useState<Record<string, string>>({});
  const [thresholdRi, setThresholdRi] = useState<number>(20);
  const [thresholdRc, setThresholdRc] = useState<number>(15);
  const [lastRiIndex, setLastRiIndex] = useState<number | undefined>(undefined);
  const [lastRcIndex, setLastRcIndex] = useState<number | undefined>(undefined);
  const [lastTpIndex, setLastTpIndex] = useState<number | undefined>(undefined);
  const [matrixSlots, setMatrixSlots] = useState<MatrixSlotConfig[]>([]);

  const generateSmartActiveMatrixSlots = () => {
    const pairs: { deviceId: string; deviceName: string; metricKey: string }[] = [];

    devices.forEach((dev) => {
      const devTele = latestTelemetry.filter(
        (t) => (t.deviceId === dev.id || t.deviceName === dev.name) && t.metric && !isInternalOrControlMetric(t.metric)
      );
      if (devTele.length > 0) {
        devTele.forEach((t) => {
          if (!pairs.some((p) => p.deviceId === dev.id && p.metricKey === t.metric)) {
            pairs.push({ deviceId: dev.id, deviceName: dev.name, metricKey: t.metric });
          }
        });
      } else if (dev.metrics) {
        Object.keys(dev.metrics).forEach((m) => {
          if (m && !isInternalOrControlMetric(m)) {
            if (!pairs.some((p) => p.deviceId === dev.id && p.metricKey === m)) {
              pairs.push({ deviceId: dev.id, deviceName: dev.name, metricKey: m });
            }
          }
        });
      }
    });

    if (pairs.length === 0) {
      const defaultMetrics = ['temperature', 'humidity', 'cpu', 'power', 'voltage', 'pressure', 'memory', 'bandwidth'];
      for (let i = 0; i < 32; i++) {
        const dev = devices.length > 0 ? devices[i % devices.length] : null;
        const mKey = defaultMetrics[i % defaultMetrics.length];
        pairs.push({
          deviceId: dev ? dev.id : (isAdmin ? 'all' : (devices[0]?.id || '')),
          deviceName: dev ? dev.name : (isAdmin ? `Cihaz ${i + 1}` : 'Cihazım'),
          metricKey: mKey,
        });
      }
    }

    const newSlots: MatrixSlotConfig[] = [];
    for (let i = 0; i < 32; i++) {
      if (i < pairs.length) {
        const pair = pairs[i];
        const shortDevName = (pair.deviceName || 'Cihaz').replace(/^Cihaz\s*/i, 'C').slice(0, 8);
        newSlots.push({
          id: `slot_${i + 1}`,
          label: `${shortDevName}:${pair.metricKey}`,
          deviceId: pair.deviceId,
          metricKey: pair.metricKey,
        });
      } else {
        newSlots.push({
          id: `slot_${i + 1}`,
          label: '',
          deviceId: isAdmin ? 'all' : (devices[0]?.id || ''),
          metricKey: '',
        });
      }
    }
    return newSlots;
  };

  const generateDefaultMatrixSlots = () => {
    return generateSmartActiveMatrixSlots();
  };

  const getMetricsForDevice = (targetDeviceId: string): string[] => {
    const set = new Set<string>();
    if (targetDeviceId === 'all' || !targetDeviceId) {
      activeDeviceMetrics.forEach((m) => set.add(m));
    } else {
      const dev = devices.find((d) => d.id === targetDeviceId);
      if (dev) {
        if (dev.metrics) {
          Object.keys(dev.metrics).forEach((m) => {
            if (!isInternalOrControlMetric(m)) set.add(m);
          });
        }
        latestTelemetry.forEach((t) => {
          if (
            (t.deviceId === dev.id || t.deviceName === dev.name) &&
            t.metric &&
            !isInternalOrControlMetric(t.metric)
          ) {
            set.add(t.metric);
          }
        });
      }
    }
    if (set.size === 0) {
      activeDeviceMetrics.forEach((m) => set.add(m));
    }
    if (set.size === 0) {
      ['temperature', 'humidity', 'cpu', 'power', 'voltage', 'pressure', 'memory', 'bandwidth'].forEach((m) => set.add(m));
    }
    return Array.from(set);
  };

  // Active metrics dynamic list from telemetry and device definitions (open/online devices only)
  const activeDeviceMetrics = useMemo(() => {
    const set = new Set<string>();

    const onlineActiveDevices = devices.filter(
      (d) => d.status === 'online' && d.dataFlowActive !== false
    );

    const targetDevices = deviceId && deviceId !== 'all'
      ? onlineActiveDevices.filter((d) => d.id === deviceId)
      : onlineActiveDevices;

    const targetDevMap = new Map<string, Device>();
    targetDevices.forEach((d) => {
      targetDevMap.set(d.id, d);
      if (d.apiKey) targetDevMap.set(d.apiKey, d);
      if (d.name) targetDevMap.set(d.name, d);
    });

    latestTelemetry.forEach((t) => {
      if (!t.metric || isInternalOrControlMetric(t.metric)) return;

      const dev = targetDevMap.get(t.deviceId) || targetDevMap.get(t.deviceName);
      if (!dev) return;

      if (dev.isSimulated && Array.isArray(dev.simulatedMetrics)) {
        const allowedLower = dev.simulatedMetrics.map((m) => m.toLowerCase());
        if (!allowedLower.includes(t.metric.toLowerCase())) return;
      }

      set.add(t.metric);
    });

    targetDevices.forEach((d) => {
      if (d.isSimulated && Array.isArray(d.simulatedMetrics)) {
        d.simulatedMetrics.forEach((m) => {
          if (m && !isInternalOrControlMetric(m)) set.add(m);
        });
      } else if (d.metrics) {
        Object.keys(d.metrics).forEach((m) => {
          if (m && !isInternalOrControlMetric(m)) set.add(m);
        });
      }
    });

    return Array.from(set);
  }, [latestTelemetry, devices, deviceId]);

  useEffect(() => {
    if (isOpen && widget) {
      setTitle(widget.title);
      setType(widget.type);
      setMetricKey(widget.metricKey || 'temperature');
      setCustomUnit(widget.unit || getMetricUnit(widget.metricKey || 'temperature'));
      if (!isAdmin && (!widget.deviceId || widget.deviceId === 'all')) {
        setDeviceId(devices.length === 1 ? devices[0].id : 'all');
      } else {
        setDeviceId(widget.deviceId || (isAdmin ? 'all' : (devices[0]?.id || '')));
      }
      setSpan(widget.span);
      setColorScheme(widget.colorScheme || '#3b82f6');
      setDisplayStyle(widget.displayStyle || 'card');
      setTimeRange(widget.timeRange || 'live');
      setButtonCount(widget.buttonCount || 1);
      setMultiMetricCount(widget.multiMetricCount || 2);
      setSliderMin(widget.sliderMin ?? 0);
      setSliderMax(widget.sliderMax ?? 100);
      setSliderStep(widget.sliderStep ?? 1);
      setOutputPin(widget.outputPin || widget.metricKey || 'PWM_OUT_1');
      setMetricMappings(widget.metricMappings || {});
      setThresholdRi(widget.thresholdRi ?? 20);
      setThresholdRc(widget.thresholdRc ?? 15);
      setLastRiIndex(widget.lastRiIndex);
      setLastRcIndex(widget.lastRcIndex);
      setLastTpIndex(widget.lastTpIndex);
      if (widget.matrixSlots && widget.matrixSlots.length > 0) {
        const existing = widget.matrixSlots.map((s, i) => ({
          ...s,
          id: s.id || `slot_${i + 1}`,
          deviceId: !isAdmin && (!s.deviceId || s.deviceId === 'all') && devices.length === 1 ? devices[0].id : (s.deviceId || (isAdmin ? 'all' : (devices[0]?.id || ''))),
        }));
        while (existing.length < 32) {
          const idx = existing.length + 1;
          existing.push({
            id: `slot_${idx}`,
            label: '',
            deviceId: isAdmin ? 'all' : (devices[0]?.id || ''),
            metricKey: '',
          });
        }
        setMatrixSlots(existing);
      } else {
        setMatrixSlots(generateSmartActiveMatrixSlots());
      }
    }
  }, [isOpen, widget?.id]);

  if (!isOpen || !widget) return null;

  const handleSaveAlarmRule = async (payload: Partial<ThresholdRule>) => {
    const res = await apiFetch('/api/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await safeJson<{ error?: string }>(res, {});
      throw new Error(data.error || 'Alarm kuralı oluşturulamadı.');
    }
    setIsAlarmWizardOpen(false);
    setAlarmSuccessBanner(`"${payload.metricKey}" metriği için alarm kuralı başarıyla devreye alındı.`);
    setTimeout(() => setAlarmSuccessBanner(null), 5000);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    const updatedWidgets = widgets.map((w) => {
      if (w.id === widget.id) {
        return {
          ...w,
          title: title || (type === 'button_control' ? `${buttonCount}'li Buton Paneli` : type === 'slider_control' ? 'Analog Çıkış Sürgüsü' : type === 'multi_metric' ? `${multiMetricCount}'li Çoklu Metrik Kartı` : type === 'metric_matrix' ? 'Çoklu Cihaz & Metrik Matrisi (4x8)' : `${metricKey} Grafiği`),
          type,
          metricKey,
          unit: customUnit.trim() || undefined,
          deviceId: deviceId === 'all' ? undefined : deviceId,
          span,
          colorScheme,
          displayStyle,
          timeRange,
          buttonCount,
          multiMetricCount,
          matrixSlots: type === 'metric_matrix' ? (matrixSlots.length > 0 ? matrixSlots : generateDefaultMatrixSlots()) : undefined,
          sliderMin,
          sliderMax,
          sliderStep,
          outputPin,
          metricMappings,
          thresholdRi,
          thresholdRc,
          lastRiIndex: lastRiIndex !== undefined && !isNaN(lastRiIndex) ? lastRiIndex : undefined,
          lastRcIndex: lastRcIndex !== undefined && !isNaN(lastRcIndex) ? lastRcIndex : undefined,
          lastTpIndex: lastTpIndex !== undefined && !isNaN(lastTpIndex) ? lastTpIndex : undefined,
        };
      }
      return w;
    });

    saveWidgets(updatedWidgets);
    onClose();
  };

  const handleDelete = () => {
    if (confirm('Bu widget\'ı silmek istediğinize emin misiniz?')) {
      saveWidgets(widgets.filter((w) => w.id !== widget.id));
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-xl bg-white dark:bg-[#0f172a] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl text-white font-bold shadow bg-blue-600 dark:bg-blue-500">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Widget Ayarlarını Özelleştir
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Görselleştirme türü, metrik parametresi, cihaz filtreleri ve boyutlandırma
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-4 text-xs max-h-[80vh] overflow-y-auto">
          {/* Widget Title & Visualization Type on the same row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Widget Başlığı
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-xs"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Görselleştirme Türü
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as WidgetType)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-xs"
              >
                <option value="area_chart">📈 Alan Grafiği (Area)</option>
                <option value="line_chart">📊 Çizgi Grafiği (Line)</option>
                <option value="bar_chart">📶 Sütun Grafiği (Bar)</option>
                <option value="pie_chart">🥧 Pasta / Donut Dağılım</option>
                <option value="radar_chart">🕸️ Çoklu Metrik Radar</option>
                <option value="metric">🔢 Tekli Metrik (Big Number)</option>
                <option value="multi_metric">🔢 Çoklu Metrik Kartı (2'li & 4'lü Izgara)</option>
                <option value="metric_matrix">🏷️ Çoklu Cihaz & Metrik Matrisi (1x1 Alan / 32 Veri Label)</option>
                <option value="gauge">⏲️ Dairesel Gauge Gösterge</option>
                <option value="power_analyzer">⚡ Elektrik Sayacı & Reaktif Analizör (8 Metrik)</option>
                <option value="progress_bar">📊 Eşik Progress Çubuğu</option>
                <option value="devices_status">📱 Cihaz Durum Izgarası</option>
                <option value="geo_map">🗺️ Coğrafi Saha Haritası</option>
                <option value="button_control">🔘 Buton Kontrol Paneli (1'li, 2'li, 3'lü, 4'lü)</option>
                <option value="slider_control">🎚️ Analog Slider / PWM Çıkış Kontrolü</option>
                <option value="switch_control">⚡ Röle & Anahtar (Switch) Paneli</option>
                <option value="device_control">🕹️ Genel Cihaz Kontrol Masası</option>
                <option value="data_table">📋 Canlı Veri Tablosu (CSV)</option>
                <option value="log_stream">💻 Ingestion Terminal Konsolu</option>
                <option value="notifications">🔔 Sistem Bildirim Akışı</option>
                <option value="quick_access">⚡ Hızlı Erişim (Cihaz Sağlığı & Kritik Alarmlar)</option>
              </select>
            </div>
          </div>

          {/* Conditional Control Options */}
          {type === 'button_control' && (
            <div className="p-4 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/50 rounded-2xl space-y-3">
              <label className="block font-bold text-blue-900 dark:text-blue-300">
                🔘 Buton Adedi Seçin (1'li, 2'li, 3'lü veya 4'lü)
              </label>
              <div className="grid grid-cols-4 gap-2">
                {([1, 2, 3, 4] as const).map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setButtonCount(cnt)}
                    className={`py-2 rounded-xl font-extrabold text-xs border transition ${
                      buttonCount === cnt
                        ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {cnt}'li Buton
                  </button>
                ))}
              </div>
            </div>
          )}

          {type === 'slider_control' && (
            <div className="p-4 bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/50 rounded-2xl space-y-3">
              <label className="block font-bold text-purple-900 dark:text-purple-300">
                🎚️ Analog Çıkış & PWM Sürgü Ayarları
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-500 font-bold mb-1">Çıkış Pin Adı</label>
                  <input
                    type="text"
                    value={outputPin}
                    onChange={(e) => setOutputPin(e.target.value)}
                    placeholder="PWM_1 veya ANALOG_OUT"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 font-bold mb-1">Min Değer</label>
                  <input
                    type="number"
                    value={sliderMin}
                    onChange={(e) => setSliderMin(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 font-bold mb-1">Max Değer</label>
                  <input
                    type="number"
                    value={sliderMax}
                    onChange={(e) => setSliderMax(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 font-bold mb-1">Adım (Step)</label>
                  <input
                    type="number"
                    value={sliderStep}
                    onChange={(e) => setSliderStep(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          {type === 'power_analyzer' && (
            <div className="space-y-4">
              <div className="p-4 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 rounded-2xl space-y-3">
                <label className="block font-bold text-amber-900 dark:text-amber-300">
                  ⚡ Reaktif Analizör Metrik Eşleştirmeleri
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { key: 'l1', label: 'L1 Faz (V)' },
                    { key: 'l2', label: 'L2 Faz (V)' },
                    { key: 'l3', label: 'L3 Faz (V)' },
                    { key: 'p', label: 'Aktif Güç P (kW)' },
                    { key: 'ri', label: 'Endüktif Ri (kVAr)' },
                    { key: 'rc', label: 'Kapasitif Rc (kVAr)' },
                    { key: 'pct_ri', label: '% Ri (Endüktif Oran)' },
                    { key: 'pct_rc', label: '% Rc (Kapasitif Oran)' },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="block text-[10px] text-slate-500 font-bold mb-1 uppercase truncate" title={label}>
                        {label}
                      </label>
                      <input
                        type="text"
                        value={metricMappings[key] || ''}
                        onChange={(e) => setMetricMappings({ ...metricMappings, [key]: e.target.value })}
                        placeholder={`Örn: ${key}`}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/50 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-blue-900 dark:text-blue-300 text-xs sm:text-sm">
                    🔢 Son Sayaç Değerleri (İlk / Önceki İndeksler)
                  </label>
                  <span className="text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold px-2 py-0.5 rounded-full border border-blue-500/20">
                    Ceza Hesabı
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Sayaçtan okunan değerlerden bu son endeksler çıkarılarak zaman aralığındaki tüketim farkları ile %Ri ve %Rc ceza oranları hesaplanır.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Son Ri (Endüktif) İndeksi
                    </label>
                    <input
                      type="number"
                      step="any"
                      placeholder="Örn: 12500"
                      value={lastRiIndex ?? ''}
                      onChange={(e) => setLastRiIndex(e.target.value === '' ? undefined : Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-xs"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">kVArh</span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Son Rc (Kapasitif) İndeksi
                    </label>
                    <input
                      type="number"
                      step="any"
                      placeholder="Örn: 4800"
                      value={lastRcIndex ?? ''}
                      onChange={(e) => setLastRcIndex(e.target.value === '' ? undefined : Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-xs"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">kVArh</span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Son T/P (Aktif) İndeksi
                    </label>
                    <input
                      type="number"
                      step="any"
                      placeholder="Örn: 85000"
                      value={lastTpIndex ?? ''}
                      onChange={(e) => setLastTpIndex(e.target.value === '' ? undefined : Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-xs"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">kWh</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/50 rounded-2xl space-y-3">
                <label className="block font-bold text-rose-900 dark:text-rose-300">
                  🚨 Yasal Reaktif Ceza Limit Uyarısı Ayarları (%)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Endüktif (Ri) Ceza Eşiği (%)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      max="100"
                      value={thresholdRi}
                      onChange={(e) => setThresholdRi(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-xs"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">Türkiye Yasal Standart: %20</span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Kapasitif (Rc) Ceza Eşiği (%)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="1"
                      max="100"
                      value={thresholdRc}
                      onChange={(e) => setThresholdRc(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-xs"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">Türkiye Yasal Standart: %15</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {type === 'multi_metric' && (
            <div className="space-y-4">
              <div className="p-4 bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/50 rounded-2xl space-y-3">
                <label className="block font-bold text-purple-900 dark:text-purple-300">
                  🔢 Metrik Sayısı (2'li veya 4'lü Izgara)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {([2, 4] as const).map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => setMultiMetricCount(cnt)}
                      className={`py-2 rounded-xl font-extrabold text-xs border transition cursor-pointer ${
                        multiMetricCount === cnt
                          ? 'bg-purple-600 text-white border-purple-600 shadow-md'
                          : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {cnt}'li Metrik Kartı
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3">
                <label className="block font-bold text-slate-800 dark:text-slate-200">
                  ⚙️ Metrik Eşleştirmeleri & Başlık Ayarları
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(Array.from({ length: multiMetricCount }) as number[]).map((_, i) => {
                    const idx = i + 1;
                    const keyField = `m${idx}`;
                    const labelField = `m${idx}_label`;
                    const unitField = `m${idx}_unit`;

                    return (
                      <div key={idx} className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                        <span className="text-[11px] font-extrabold text-purple-600 dark:text-purple-400 block border-b pb-1 border-slate-100 dark:border-slate-800">
                          {idx}. Metrik Yuvası
                        </span>

                        <div>
                          <label className="block text-[10px] text-slate-500 font-bold mb-1">Metrik Parametresi / Anahtarı</label>
                          <input
                            type="text"
                            value={metricMappings[keyField] || (idx === 1 ? 'temperature' : idx === 2 ? 'humidity' : idx === 3 ? 'cpu' : 'power')}
                            onChange={(e) => setMetricMappings({ ...metricMappings, [keyField]: e.target.value })}
                            placeholder="Örn: temperature, cpu, power..."
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-1.5">
                          <div>
                            <label className="block text-[10px] text-slate-500 font-bold mb-1">Görünen Başlık</label>
                            <input
                              type="text"
                              value={metricMappings[labelField] || (idx === 1 ? 'Sıcaklık' : idx === 2 ? 'Nem Oranı' : idx === 3 ? 'İşlemci Yükü' : 'Güç Tüketimi')}
                              onChange={(e) => setMetricMappings({ ...metricMappings, [labelField]: e.target.value })}
                              placeholder="Örn: Sıcaklık"
                              className="w-full px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-500 font-bold mb-1">Birim</label>
                            <input
                              type="text"
                              value={metricMappings[unitField] || (idx === 1 ? '°C' : idx === 2 ? '%' : idx === 3 ? '%' : 'kW')}
                              onChange={(e) => setMetricMappings({ ...metricMappings, [unitField]: e.target.value })}
                              placeholder="Örn: °C, kW, %"
                              className="w-full px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {type === 'metric_matrix' && (
            <div className="space-y-4">
              <datalist id="edit_matrix_metrics_autocomplete">
                {activeDeviceMetrics.map((m) => (
                  <option key={m} value={m} />
                ))}
                <option value="temperature" />
                <option value="humidity" />
                <option value="cpu" />
                <option value="power" />
                <option value="voltage" />
                <option value="pressure" />
                <option value="memory" />
                <option value="bandwidth" />
              </datalist>

              <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/50 rounded-2xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="block font-bold text-indigo-900 dark:text-indigo-300 text-xs">
                      🏷️ Matris Veri Slotları (4x8 = 32 Adet Label Veri)
                    </label>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Her slot için bağımsız cihaz seçebilir, metrik adını elle yazabilir veya sistemdekilerden seçebilirsiniz.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMatrixSlots(generateSmartActiveMatrixSlots())}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-xl text-xs font-bold shadow transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <Grid className="w-3.5 h-3.5" />
                    Aktif Cihaz & Metriklerle Otomatik Doldur
                  </button>
                </div>

                <div className="max-h-64 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                  {(matrixSlots.length > 0 ? matrixSlots : generateDefaultMatrixSlots()).map((slot, idx) => {
                    const devMetrics = getMetricsForDevice(slot.deviceId || 'all');
                    const isCustomMetric = slot.metricKey ? !devMetrics.includes(slot.metricKey) : false;

                    return (
                      <div key={slot.id || `slot_${idx + 1}`} className="flex items-center gap-1.5 p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs">
                        <span className="font-extrabold text-indigo-600 dark:text-indigo-400 w-6 text-center shrink-0">
                          #{idx + 1}
                        </span>
                        <input
                          type="text"
                          placeholder="Etiket (Örn: Sıcaklık)"
                          value={slot.label || ''}
                          onChange={(e) => {
                            const updated = matrixSlots.length > 0 ? [...matrixSlots] : generateDefaultMatrixSlots();
                            updated[idx] = { ...updated[idx], label: e.target.value };
                            setMatrixSlots(updated);
                          }}
                          className="w-1/3 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs"
                        />
                        <select
                          value={slot.deviceId || 'all'}
                          onChange={(e) => {
                            const newDevId = e.target.value;
                            const updated = matrixSlots.length > 0 ? [...matrixSlots] : generateDefaultMatrixSlots();
                            const newDevMetrics = getMetricsForDevice(newDevId);
                            let newMetricKey = slot.metricKey;
                            if (newMetricKey && !newDevMetrics.includes(newMetricKey) && newDevMetrics.length > 0) {
                              newMetricKey = newDevMetrics[0];
                            }
                            const targetDev = devices.find((d) => d.id === newDevId);
                            const devShortName = targetDev ? targetDev.name.replace(/^Cihaz\s*/i, 'C').slice(0, 8) : 'Tüm';
                            const updatedLabel = (!slot.label || slot.label.includes(':')) ? (newMetricKey ? `${devShortName}:${newMetricKey}` : '') : slot.label;

                            updated[idx] = {
                              ...updated[idx],
                              deviceId: newDevId,
                              metricKey: newMetricKey,
                              label: updatedLabel,
                            };
                            setMatrixSlots(updated);
                          }}
                          className="w-1/3 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs"
                        >
                          {isAdmin && <option value="all">🌐 Tüm Cihazlar (Sistem Geneli)</option>}
                          {!isAdmin && devices.length > 1 && <option value="all">📱 Tüm Cihazlarım</option>}
                          {devices.map((d) => (
                            <option key={d.id} value={d.id}>
                              📱 {d.name}
                            </option>
                          ))}
                        </select>

                        <div className="w-1/3 flex items-center gap-1">
                          <select
                            value={isCustomMetric ? '__custom__' : (slot.metricKey || '')}
                            onChange={(e) => {
                              const val = e.target.value;
                              const updated = matrixSlots.length > 0 ? [...matrixSlots] : generateDefaultMatrixSlots();
                              if (val === '__custom__') {
                                updated[idx] = { ...updated[idx], metricKey: slot.metricKey || '' };
                              } else if (val === '') {
                                updated[idx] = { ...updated[idx], metricKey: '', label: '' };
                              } else {
                                const targetDev = devices.find((d) => d.id === slot.deviceId);
                                const devShortName = targetDev ? targetDev.name.replace(/^Cihaz\s*/i, 'C').slice(0, 8) : 'Tüm';
                                const updatedLabel = (!slot.label || slot.label.includes(':')) ? `${devShortName}:${val}` : slot.label;
                                updated[idx] = { ...updated[idx], metricKey: val, label: updatedLabel };
                              }
                              setMatrixSlots(updated);
                            }}
                            className="w-full px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs truncate"
                            title="Seçili cihaza ait yayınlanan metrikler"
                          >
                            <option value="">-- Boş Slot (Metrik Yok) --</option>
                            <optgroup label={slot.deviceId !== 'all' ? 'Cihazın Metrikleri' : 'Aktif Metrikler'}>
                              {devMetrics.map((m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              ))}
                            </optgroup>
                            <option value="__custom__">✍️ Elle Özel Metrik Gir</option>
                          </select>

                          {isCustomMetric && (
                            <input
                              type="text"
                              placeholder="Metrik Kodu"
                              value={slot.metricKey || ''}
                              onChange={(e) => {
                                const updated = matrixSlots.length > 0 ? [...matrixSlots] : generateDefaultMatrixSlots();
                                updated[idx] = { ...updated[idx], metricKey: e.target.value };
                                setMatrixSlots(updated);
                              }}
                              className="w-1/2 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800 border border-indigo-400 dark:border-indigo-600 text-slate-900 dark:text-white text-xs font-mono"
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {type !== 'power_analyzer' && type !== 'multi_metric' && type !== 'metric_matrix' && type !== 'quick_access' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block font-semibold text-slate-700 dark:text-slate-300">
                    İzlenecek Metrik Parametresi
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsCustomMetric(!isCustomMetric)}
                    className="text-[10px] text-blue-600 dark:text-blue-400 font-bold hover:underline"
                  >
                    {isCustomMetric ? '📋 Hazır Listeden Seç' : '✍️ Özel Metrik Gir'}
                  </button>
                </div>

                {!isCustomMetric ? (
                  <select
                    value={metricKey}
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        setIsCustomMetric(true);
                      } else {
                        setMetricKey(e.target.value);
                        if (!customUnit) {
                          setCustomUnit(getMetricUnit(e.target.value));
                        }
                      }
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-xs"
                  >
                    {activeDeviceMetrics.length > 0 && (
                      <optgroup label="🟢 Açık Cihazlardan Gelen Aktif Metrikler">
                        {activeDeviceMetrics.map((m) => (
                          <option key={m} value={m}>
                            {m} ({getMetricUnit(m)})
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="🔥 Sık Kullanılan Metrikler">
                      <option value="temperature">Sıcaklık (°C)</option>
                      <option value="humidity">Nem Oranı (%)</option>
                      <option value="cpu">İşlemci / CPU Yükü (%)</option>
                      <option value="memory">Bellek / RAM Kullanımı (%)</option>
                      <option value="power">Güç Tüketimi (kW)</option>
                      <option value="pressure">Basınç (hPa)</option>
                      <option value="voltage">Gerilim / Voltaj (V)</option>
                      <option value="current">Akım / Amperaj (A)</option>
                      <option value="vibration">Titreşim / Vibrasyon (mm/s)</option>
                      <option value="flow_rate">Akış Hızı (L/min)</option>
                      <option value="co2_ppm">CO2 Karbondioksit (ppm)</option>
                      <option value="ph_level">pH Seviyesi</option>
                      <option value="battery">Batarya Seviyesi (%)</option>
                      <option value="bandwidth">Ağ Bant Genişliği (Mbps)</option>
                    </optgroup>
                    <option value="__custom__">✍️ Elle Özel Metrik İfadesi Gir...</option>
                  </select>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      value={metricKey}
                      onChange={(e) => setMetricKey(e.target.value.replace(/\s+/g, '_'))}
                      placeholder="Örn: Temp_Sensor_1, Vibration_X, RPM_Speed..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-xs font-mono"
                    />
                  </div>
                )}

                {/* Custom Unit Input */}
                <div className="pt-1.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      Ölçüm Birimi (Elle Özelleştirilebilir)
                    </label>
                    <span className="text-[10px] text-slate-400">
                      Algılanan: <strong className="text-emerald-500 font-semibold">{getMetricUnit(metricKey)}</strong>
                    </span>
                  </div>
                  <input
                    type="text"
                    value={customUnit}
                    onChange={(e) => setCustomUnit(e.target.value)}
                    placeholder={`Varsayılan: ${getMetricUnit(metricKey)} (örn: °C, kW, Bar, RPM, ppm)`}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-xs font-mono"
                  />

                  {/* Suggested Unit Chips */}
                  <div className="pt-0.5">
                    <span className="text-[10px] text-slate-400 font-medium block mb-1">
                      💡 Hızlı Birim Önerileri (Tıklayıp Seçin):
                    </span>
                    <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto pr-1 scrollbar-thin">
                      {COMMON_UNITS.map((u) => (
                        <button
                          key={u}
                          type="button"
                          onClick={() => setCustomUnit(u)}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-mono transition ${
                            (customUnit || getMetricUnit(metricKey)) === u
                              ? 'bg-emerald-600 text-white font-bold shadow-sm'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-emerald-500/20 hover:text-emerald-500'
                          }`}
                        >
                          {u}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="text-[10px] text-slate-400 flex items-center justify-between pt-0.5">
                  <span>Seçilen Metrik İfadesi: <strong className="text-blue-500 font-mono">{metricKey || '—'}</strong></span>
                  <span>Aktif Birim: <strong className="text-emerald-500">{customUnit || getMetricUnit(metricKey)}</strong></span>
                </div>
              </div>
            )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Filter Specific Device */}
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Hedef Cihaz Filtresi
              </label>
              <select
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-xs"
              >
                {deviceId && deviceId !== 'all' && !devices.some((d) => d.id === deviceId) && (
                  <option value={deviceId}>⚠️ Kayıp / Silinmiş Cihaz ({deviceId})</option>
                )}
                {isAdmin ? (
                  <>
                    <option value="all">🌐 Tüm Cihazlar (Sistem Geneli - {devices.length} Cihaz)</option>
                    {devices.map((d) => {
                      const isOnline = d.status === 'online' && d.dataFlowActive !== false;
                      return (
                        <option key={d.id} value={d.id}>
                          {isOnline ? '🟢' : '🔴'} {d.name} ({d.location}) - {isOnline ? 'Açık / Çevrimiçi' : 'Kapalı / Çevrimdışı'}
                        </option>
                      );
                    })}
                  </>
                ) : (
                  <>
                    {devices.length === 0 ? (
                      <option value="">Atanmış Cihazınız Bulunmuyor</option>
                    ) : (
                      <>
                        {devices.length > 1 && (
                          <option value="all">📱 Tüm Cihazlarım (Yalnızca Şirketiniz - {devices.length} Cihaz)</option>
                        )}
                        {devices.map((d) => {
                          const isOnline = d.status === 'online' && d.dataFlowActive !== false;
                          return (
                            <option key={d.id} value={d.id}>
                              {isOnline ? '🟢' : '🔴'} {d.name} ({d.location}) - {isOnline ? 'Açık / Çevrimiçi' : 'Kapalı / Çevrimdışı'}
                            </option>
                          );
                        })}
                      </>
                    )}
                  </>
                )}
              </select>
            </div>

            {/* Time Range */}
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Zaman Aralığı
              </label>
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value as any)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-xs"
              >
                <option value="live">⚡ Anlık Veri Akışı (Realtime)</option>
                <option value="1h">⏱️ Son 1 Saat</option>
                <option value="24h">📅 Son 24 Saat</option>
                <option value="7d">🗓️ Son 7 Gün</option>
              </select>
            </div>
          </div>

          {/* Grid Span Width */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Grid Genişliği (% Ekran Kaplama)
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { value: 1, label: '%25' },
                { value: 2, label: '%50' },
                { value: 3, label: '%75' },
                { value: 4, label: '%100' },
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setSpan(item.value as WidgetSpan)}
                  className={`py-2 rounded-xl border font-bold text-xs transition-colors ${
                    span === item.value
                      ? 'bg-blue-600 text-white border-blue-600 shadow'
                      : 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Alarm ve Eşik Kuralları Yönlendirme / Hızlı Alarm Ekleme (Kompakt Tasarım) */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 rounded-xl p-2.5 sm:px-3.5 sm:py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">
                  <Bell className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Eşik & Alarm Kuralları</span>
                    <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/60">
                      {metricKey}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate hidden sm:block">
                    Bu metrik için anlık eşik uyarısı veya bildirim tanımlayın.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={() => setIsAlarmWizardOpen(true)}
                  className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span>Alarm Ekle</span>
                </button>

                {onNavigateToAlarms && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigateToAlarms();
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700/60 text-slate-600 dark:text-slate-300 font-medium text-xs transition-colors flex items-center gap-1 cursor-pointer"
                    title="Bildirimler & Alarmlar Yönetim Masası"
                  >
                    <span>Alarmlar</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {alarmSuccessBanner && (
              <div className="mt-2 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                <span>{alarmSuccessBanner}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <button
              type="button"
              onClick={handleDelete}
              className="px-3.5 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/20 rounded-xl font-bold transition flex items-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              <span>Widget'ı Sil</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                İptal
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg shadow-blue-600/30 transition-all flex items-center gap-1.5"
              >
                <Save className="w-4 h-4" />
                <span>Kaydet</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Embedded Alarm Rule Wizard */}
      {isAlarmWizardOpen && (
        <AlarmRuleWizard
          isOpen={isAlarmWizardOpen}
          editingRule={null}
          initialRule={{
            tenantId: user?.role === 'admin' ? 'usr_admin' : user?.id || 'usr_customer1',
            deviceId: deviceId === 'all' ? 'all' : deviceId,
            metricKey: metricKey,
            thresholdValue: 80,
            severity: 'critical',
          }}
          devices={devices}
          customersList={customersList}
          serviceConfig={null}
          currentUserRole={user?.role}
          currentUserId={user?.id}
          onClose={() => setIsAlarmWizardOpen(false)}
          onSave={handleSaveAlarmRule}
        />
      )}
    </div>
  );
};
