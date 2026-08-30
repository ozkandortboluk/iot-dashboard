import React, { useState } from 'react';
import type { WidgetConfig, WidgetSpan } from '../types';
import { useRealtime } from '../context/RealtimeContext';
import { MetricWidget } from './widgets/MetricWidget';
import { MultiMetricWidget } from './widgets/MultiMetricWidget';
import { MetricMatrixWidget } from './widgets/MetricMatrixWidget';
import { ChartWidget } from './widgets/ChartWidget';
import { GaugeWidget } from './widgets/GaugeWidget';
import { DevicesWidget } from './widgets/DevicesWidget';
import { LogStreamWidget } from './widgets/LogStreamWidget';
import { NotificationsWidget } from './widgets/NotificationsWidget';
import { PieChartWidget } from './widgets/PieChartWidget';
import { RadarChartWidget } from './widgets/RadarChartWidget';
import { GeoMapWidget } from './widgets/GeoMapWidget';
import { DeviceControlWidget } from './widgets/DeviceControlWidget';
import { ButtonControlWidget } from './widgets/ButtonControlWidget';
import { SliderControlWidget } from './widgets/SliderControlWidget';
import { SwitchControlWidget } from './widgets/SwitchControlWidget';
import { ProgressBarWidget } from './widgets/ProgressBarWidget';
import { DataTableWidget } from './widgets/DataTableWidget';
import { PowerAnalyzerWidget } from './widgets/PowerAnalyzerWidget';
import { QuickAccessWidget } from './widgets/QuickAccessWidget';
import { EditWidgetModal } from './EditWidgetModal';
import {
  ArrowLeft,
  ArrowRight,
  Maximize2,
  Minimize2,
  Trash2,
  Sparkles,
  Sliders,
  Layers,
  Settings,
} from 'lucide-react';

interface WidgetGridProps {
  onOpenAddWidgetModal: () => void;
  editMode: boolean;
  setEditMode: (mode: boolean) => void;
  onNavigateToTab?: (tab: string) => void;
}

export const WidgetGrid: React.FC<WidgetGridProps> = ({ onOpenAddWidgetModal, editMode, setEditMode, onNavigateToTab }) => {
  const { widgets, saveWidgets, resetWidgetsToDefault } = useRealtime();

  const [editingWidget, setEditingWidget] = useState<WidgetConfig | null>(null);

  const moveWidget = (index: number, direction: 'left' | 'right') => {
    const newWidgets = [...widgets];
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newWidgets.length) return;

    const temp = newWidgets[index];
    newWidgets[index] = newWidgets[targetIndex];
    newWidgets[targetIndex] = temp;
    saveWidgets(newWidgets);
  };

  const changeSpan = (index: number, newSpan: WidgetSpan) => {
    const newWidgets = [...widgets];
    newWidgets[index] = { ...newWidgets[index], span: newSpan };
    saveWidgets(newWidgets);
  };

  const removeWidget = (id: string) => {
    const filtered = widgets.filter((w) => w.id !== id);
    saveWidgets(filtered);
  };

  const applyPresetTemplate = (type: 'iot' | 'server' | 'exec' | 'comprehensive') => {
    if (type === 'iot') {
      const iotWidgets: WidgetConfig[] = [
        { id: 'w_power', title: 'Elektrik Sayacı & Reaktif Analizör', type: 'power_analyzer', span: 2, colorScheme: '#f59e0b' },
        { id: 'w_1', title: 'Sıcaklık (°C)', type: 'line_chart', metricKey: 'temperature', span: 2, colorScheme: '#f59e0b' },
        { id: 'w_2', title: 'Nem Oranı (%)', type: 'area_chart', metricKey: 'humidity', span: 2, colorScheme: '#3b82f6' },
        { id: 'w_3', title: 'Cihaz Durum Dağılımı', type: 'pie_chart', span: 2, colorScheme: '#8b5cf6' },
        { id: 'w_4', title: 'Coğrafi Saha Haritası', type: 'geo_map', span: 2, colorScheme: '#06b6d4' },
        { id: 'w_5', title: 'Canlı Telemetri Tablosu', type: 'data_table', span: 4, colorScheme: '#10b981' },
      ];
      saveWidgets(iotWidgets, 'Saha & IoT Sensör İzleme Paneli');
    } else if (type === 'server') {
      const serverWidgets: WidgetConfig[] = [
        { id: 'w_s1', title: 'Sunucu İşlemci (CPU) Yükü', type: 'area_chart', metricKey: 'cpu', span: 2, colorScheme: '#3b82f6' },
        { id: 'w_s2', title: 'Bellek (RAM) Kullanımı', type: 'line_chart', metricKey: 'memory', span: 2, colorScheme: '#8b5cf6' },
        { id: 'w_s3', title: 'Çoklu Metrik Radar', type: 'radar_chart', span: 2, colorScheme: '#ec4899' },
        { id: 'w_s4', title: 'Metrik SLA Toleransları', type: 'progress_bar', span: 2, colorScheme: '#f59e0b' },
        { id: 'w_s5', title: 'Sistem Konsolu', type: 'log_stream', span: 4, colorScheme: '#10b981' },
      ];
      saveWidgets(serverWidgets, 'Sunucu & Altyapı Performans Paneli');
    } else if (type === 'exec') {
      const execWidgets: WidgetConfig[] = [
        { id: 'w_e1', title: 'Ortalama CPU', type: 'metric', metricKey: 'cpu', span: 1, colorScheme: '#3b82f6' },
        { id: 'w_e2', title: 'Sıcaklık Taraması', type: 'metric', metricKey: 'temperature', span: 1, colorScheme: '#f97316' },
        { id: 'w_e3', title: 'Güç Tüketimi (kW)', type: 'gauge', metricKey: 'power', span: 1, colorScheme: '#10b981' },
        { id: 'w_e4', title: 'Cihaz Durumları', type: 'pie_chart', span: 1, colorScheme: '#8b5cf6' },
        { id: 'w_e5', title: 'Anlık Cihaz Kontrolü', type: 'device_control', span: 2, colorScheme: '#3b82f6' },
        { id: 'w_e6', title: 'Ortam Trendleri', type: 'area_chart', metricKey: 'temperature', span: 2, colorScheme: '#ec4899' },
      ];
      saveWidgets(execWidgets, 'Yönetici Analitik Paneli');
    }
  };

  const renderWidgetContent = (widget: WidgetConfig) => {
    const handleEdit = () => setEditingWidget(widget);

    switch (widget.type) {
      case 'metric':
        return <MetricWidget config={widget} />;
      case 'multi_metric':
        return <MultiMetricWidget config={widget} onEdit={handleEdit} />;
      case 'metric_matrix':
        return <MetricMatrixWidget config={widget} onEdit={handleEdit} />;
      case 'area_chart':
      case 'line_chart':
      case 'bar_chart':
        return <ChartWidget config={widget} />;
      case 'pie_chart':
        return <PieChartWidget config={widget} onEdit={handleEdit} />;
      case 'radar_chart':
        return <RadarChartWidget config={widget} onEdit={handleEdit} />;
      case 'gauge':
        return <GaugeWidget config={widget} />;
      case 'power_analyzer':
        return <PowerAnalyzerWidget config={widget} onEdit={handleEdit} />;
      case 'devices_status':
        return <DevicesWidget config={widget} />;
      case 'geo_map':
        return <GeoMapWidget config={widget} onEdit={handleEdit} />;
      case 'device_control':
        return <DeviceControlWidget config={widget} onEdit={handleEdit} />;
      case 'button_control':
        return <ButtonControlWidget config={widget} onEdit={handleEdit} />;
      case 'slider_control':
        return <SliderControlWidget config={widget} onEdit={handleEdit} />;
      case 'switch_control':
        return <SwitchControlWidget config={widget} onEdit={handleEdit} />;
      case 'progress_bar':
        return <ProgressBarWidget config={widget} onEdit={handleEdit} />;
      case 'data_table':
        return <DataTableWidget config={widget} onEdit={handleEdit} />;
      case 'log_stream':
        return <LogStreamWidget config={widget} />;
      case 'notifications':
        return <NotificationsWidget config={widget} />;
      case 'quick_access':
        return <QuickAccessWidget config={widget} onEdit={handleEdit} onNavigateToTab={onNavigateToTab} />;
      default:
        return <ChartWidget config={widget} />;
    }
  };

  const getSpanClass = (span: WidgetSpan) => {
    switch (span) {
      case 1:
        return 'col-span-12 lg:col-span-3';
      case 2:
        return 'col-span-12 lg:col-span-6';
      case 3:
        return 'col-span-12 lg:col-span-9';
      case 4:
      default:
        return 'col-span-12';
    }
  };

  return (
    <div className="space-y-6">
      {/* Grid Canvas */}
      {widgets.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-[#0f172a] rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 shadow-xl">
          <Layers className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
            Dashboard'unuzda henüz widget bulunmuyor.
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
            Yukarıdaki "Widget Ekle" butonuna tıklayarak veya hazır şablonlardan birini seçerek grafikleri yerleştirebilirsiniz.
          </p>
          <button
            onClick={onOpenAddWidgetModal}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-2xl shadow-lg hover:bg-indigo-500 transition-all"
          >
            İlk Widget'ı Ekle
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-6">
          {widgets.map((widget, idx) => (
            <div
              key={widget.id}
              className={`${getSpanClass(
                widget.span
              )} relative transition-all duration-200 ${
                editMode ? 'ring-2 ring-amber-500/60 rounded-3xl p-1 bg-amber-500/5' : ''
              }`}
            >
              {/* Edit Mode Controls overlay */}
              {editMode && (
                <div className="absolute -top-3 right-3 z-20 flex items-center gap-1 bg-[#020617] text-white p-1.5 rounded-2xl shadow-2xl border border-slate-700 text-[10px]">
                  <button
                    onClick={() => moveWidget(idx, 'left')}
                    disabled={idx === 0}
                    className="p-1 hover:bg-slate-800 rounded-lg disabled:opacity-30"
                    title="Sola / Yukarı Taşı"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => moveWidget(idx, 'right')}
                    disabled={idx === widgets.length - 1}
                    className="p-1 hover:bg-slate-800 rounded-lg disabled:opacity-30"
                    title="Sağa / Aşağı Taşı"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-px h-3 bg-slate-700 mx-0.5" />
                  <button
                    onClick={() => setEditingWidget(widget)}
                    className="p-1 hover:bg-slate-800 rounded-lg text-blue-400"
                    title="Widget Ayarlarını Düzenle"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() =>
                      changeSpan(idx, widget.span === 1 ? 2 : widget.span === 2 ? 3 : widget.span === 3 ? 4 : 1)
                    }
                    className="px-1.5 py-0.5 hover:bg-slate-800 rounded-lg font-bold text-amber-400"
                    title="Genişliği Değiştir"
                  >
                    {widget.span * 25}%
                  </button>
                  <span className="w-px h-3 bg-slate-700 mx-0.5" />
                  <button
                    onClick={() => removeWidget(widget.id)}
                    className="p-1 text-rose-400 hover:bg-rose-950/50 rounded-lg"
                    title="Widget'ı Kaldır"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Widget Component */}
              <div className="h-full">{renderWidgetContent(widget)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Widget Modal */}
      <EditWidgetModal
        widget={editingWidget}
        isOpen={!!editingWidget}
        onClose={() => setEditingWidget(null)}
      />
    </div>
  );
};

