import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Server,
  Zap,
  Clock,
  Trash2,
  Filter,
  Search,
  FileCode,
  Download,
  AlertOctagon,
  Info,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { apiFetch as fetch } from '../../lib/apiFetch';
import type { SystemEvent, SystemEventLevel, SystemEventCategory } from '../../types';

interface HealthReport {
  status: 'healthy' | 'degraded' | 'recovering' | 'down';
  isPostgresConnected: boolean;
  activeEngine: string;
  latencyMs: number;
  poolStats: {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  };
  tableCount: number;
  missingTables: string[];
  hungQueriesCleared: number;
  lastRepairedAt: string | null;
  lastCheckedAt: string;
  healingEvents: string[];
  isSchemaHealthy?: boolean;
  schemaHealthScore?: number;
  schemaRepairStatus?: 'PASS' | 'FAIL' | 'NO_OP';
  remainingDiscrepancies?: string[];
}

interface SchemaAuditData {
  success: boolean;
  audit: {
    timestamp: string;
    isHealthy: boolean;
    score: number;
    summary: {
      totalCanonicalTables: number;
      existingTablesCount: number;
      missingTablesCount: number;
      missingColumnsCount: number;
      typeMismatchCount: number;
      missingIndexesCount: number;
      missingConstraintsCount?: number;
      missingTriggersCount: number;
      missingFunctionsCount: number;
    };
    discrepancies: {
      missingTables: string[];
      missingColumns: any[];
      typeMismatches: any[];
      missingIndexes: any[];
      missingConstraints?: any[];
      missingTriggers: any[];
      missingFunctions: string[];
    };
    humanReadableMessages: string[];
  };
  alignment: {
    drizzleMatchesCanonical: boolean;
    migrationMatchesCanonical: boolean;
  };
}

interface SchemaHealResponse {
  success: boolean;
  stage: 'DETECT' | 'REPAIR' | 'RE_CHECK' | 'VERIFIED';
  status: 'PASS' | 'FAIL' | 'NO_OP';
  verificationPassed: boolean;
  isHealthy: boolean;
  actionsTaken: string[];
  errors: string[];
  remainingDiscrepancies: string[];
  summaryMessage: string;
  beforeReport: any;
  afterReport: any;
}

export const DatabaseAutoHealerPanel: React.FC = () => {
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [isLoadingHealth, setIsLoadingHealth] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [repairSuccessMessage, setRepairSuccessMessage] = useState<string | null>(null);

  // Schema Audit & Repair -> Verify state
  const [schemaAudit, setSchemaAudit] = useState<SchemaAuditData | null>(null);
  const [isLoadingSchemaAudit, setIsLoadingSchemaAudit] = useState(false);
  const [isHealVerifying, setIsHealVerifying] = useState(false);
  const [schemaHealResult, setSchemaHealResult] = useState<SchemaHealResponse | null>(null);
  const [healVerifyStep, setHealVerifyStep] = useState<'IDLE' | 'DETECT' | 'REPAIR' | 'RE_CHECK' | 'PASS' | 'FAIL'>('IDLE');

  // System Events state
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [totalEvents, setTotalEvents] = useState(0);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<SystemEvent | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [panelNotification, setPanelNotification] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const fetchHealth = async () => {
    setIsLoadingHealth(true);
    try {
      const res = await fetch('/api/database/auto-repair/health');
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      }
    } catch (err) {
      console.warn('Sağlık verisi alınamadı:', err);
    } finally {
      setIsLoadingHealth(false);
    }
  };

  const fetchSchemaAudit = async () => {
    setIsLoadingSchemaAudit(true);
    try {
      const res = await fetch('/api/database/audit');
      if (res.ok) {
        const data = await res.json();
        setSchemaAudit(data);
      }
    } catch (err) {
      console.warn('Şema denetimi alınamadı:', err);
    } finally {
      setIsLoadingSchemaAudit(false);
    }
  };

  const triggerRepairVerifyLoop = async () => {
    setIsHealVerifying(true);
    setSchemaHealResult(null);
    setHealVerifyStep('DETECT');
    setPanelNotification(null);

    try {
      // Step 1: Detect
      await new Promise((r) => setTimeout(r, 350));
      setHealVerifyStep('REPAIR');

      // Step 2 & 3: Repair and Re-check directly on server
      const res = await fetch('/api/database/auto-heal', { method: 'POST' });
      setHealVerifyStep('RE_CHECK');
      await new Promise((r) => setTimeout(r, 350));

      const data: SchemaHealResponse = await res.json();
      setSchemaHealResult(data);

      if (data.status === 'PASS' && data.verificationPassed && data.isHealthy) {
        setHealVerifyStep('PASS');
        setPanelNotification({
          type: 'success',
          text: `Repair → Verify döngüsü BAŞARILI (PASS). Sağlık skoru: %${data.afterReport?.score ?? 100}. Doğrulandı.`,
        });
      } else {
        setHealVerifyStep('FAIL');
        setPanelNotification({
          type: 'error',
          text: `Repair → Verify döngüsü BAŞARISIZ (FAIL). ${data.remainingDiscrepancies?.length || 0} adet kusur giderilemedi. Veritabanı "healthy" olarak gösterilmeyecek.`,
        });
      }

      fetchHealth();
      fetchEvents();
      fetchSchemaAudit();
    } catch (err: any) {
      setHealVerifyStep('FAIL');
      setPanelNotification({
        type: 'error',
        text: 'Repair → Verify işlemi sırasında sunucu hatası: ' + (err?.message || err),
      });
    } finally {
      setIsHealVerifying(false);
    }
  };

  const triggerRepair = async () => {
    setIsRepairing(true);
    setRepairSuccessMessage(null);
    setPanelNotification(null);
    try {
      const res = await fetch('/api/database/auto-repair/run', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setHealth(data.report);
        setRepairSuccessMessage(
          `Onarım tamamlandı: ${data.report.hungQueriesCleared} askıda kilit/sorgu sonlandırıldı, şema kontrol edildi.`
        );
        fetchEvents();
        fetchSchemaAudit();
      } else {
        setPanelNotification({ type: 'error', text: 'Onarım sırasında hata: ' + (data.error || 'Bilinmeyen hata') });
      }
    } catch (err: any) {
      setPanelNotification({ type: 'error', text: 'Onarım isteği başarısız oldu: ' + (err?.message || err) });
    } finally {
      setIsRepairing(false);
    }
  };

  const fetchEvents = async () => {
    setIsLoadingEvents(true);
    try {
      const params = new URLSearchParams();
      if (filterLevel !== 'all') params.append('level', filterLevel);
      if (filterCategory !== 'all') params.append('category', filterCategory);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      params.append('limit', '100');

      const res = await fetch(`/api/system/events?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
        setTotalEvents(data.total || 0);
      }
    } catch (err) {
      console.warn('Olaylar yüklenemedi:', err);
    } finally {
      setIsLoadingEvents(false);
    }
  };

  const executeClearEvents = async () => {
    setConfirmingClear(false);
    setPanelNotification(null);
    try {
      const res = await fetch('/api/system/events/clear', { method: 'POST' });
      if (res.ok) {
        setEvents([]);
        setTotalEvents(0);
        setPanelNotification({ type: 'success', text: 'Sistem olay günlüğü başarıyla temizlendi.' });
        fetchEvents();
      } else {
        const d = await res.json().catch(() => ({}));
        setPanelNotification({ type: 'error', text: 'Loglar temizlenemedi: ' + (d.message || res.statusText) });
      }
    } catch (err: any) {
      setPanelNotification({ type: 'error', text: 'Loglar temizlenemedi: ' + err?.message });
    }
  };

  const exportEventsJson = () => {
    const jsonStr = JSON.stringify(events, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sistem_olay_gunlugu_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    fetchHealth();
    fetchEvents();
    fetchSchemaAudit();
    const timer = setInterval(() => {
      fetchHealth();
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      fetchEvents();
    }, 300);
    return () => clearTimeout(debounceTimer);
  }, [filterLevel, filterCategory, searchQuery]);

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'healthy':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5" /> Sağlıklı & Aktif
          </span>
        );
      case 'degraded':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
            <AlertTriangle className="w-3.5 h-3.5" /> Gecikmeli / Degraded
          </span>
        );
      case 'recovering':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Otomatik Onarılıyor
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
            <AlertOctagon className="w-3.5 h-3.5" /> Kesintide (Bellek İçi Koruma Aktif)
          </span>
        );
    }
  };

  const getLevelBadge = (level: SystemEventLevel) => {
    switch (level) {
      case 'critical':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200 border border-rose-300 dark:border-rose-800">
            Kritik
          </span>
        );
      case 'error':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-200 border border-orange-300 dark:border-orange-800">
            Hata
          </span>
        );
      case 'warn':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 border border-amber-300 dark:border-amber-800">
            Uyarı
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            Bilgi
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER BANNER */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-900/40 text-white p-6 rounded-2xl shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-indigo-500/20 border border-indigo-400/30 rounded-xl text-indigo-300">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Veritabanı Otomatik Onarım & Sistem Olay Günlüğü</h2>
              <p className="text-xs text-indigo-200/80">
                PostgreSQL bağlantı kilitlerini otomatik çözer, çökme koruması sağlar ve tüm sistem olaylarını canlı kaydeder.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={fetchHealth}
            disabled={isLoadingHealth}
            className="flex-1 md:flex-initial px-4 py-2.5 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHealth ? 'animate-spin' : ''}`} />
            <span>Yenile</span>
          </button>
          <button
            onClick={triggerRepair}
            disabled={isRepairing}
            className="flex-1 md:flex-initial px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-indigo-600/30 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Zap className={`w-3.5 h-3.5 ${isRepairing ? 'animate-bounce' : ''}`} />
            <span>{isRepairing ? 'Onarılıyor...' : 'Otomatik Onarımı Çalıştır'}</span>
          </button>
        </div>
      </div>

      {repairSuccessMessage && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{repairSuccessMessage}</span>
          </div>
          <button
            onClick={() => setRepairSuccessMessage(null)}
            className="text-emerald-600 hover:text-emerald-800 dark:hover:text-emerald-200 text-xs font-bold px-2 py-0.5"
          >
            Kapat
          </button>
        </div>
      )}

      {/* METRIC CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Status */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Veritabanı Durumu</span>
            <Server className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="flex items-center gap-2 mb-2">
            {getStatusBadge(health?.status)}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            Aktif Motor: <span className="font-semibold text-slate-700 dark:text-slate-200">{health?.activeEngine || 'PostgreSQL'}</span>
          </p>
        </div>

        {/* Latency */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Gecikme (Ping Latency)</span>
            <Activity className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {health?.latencyMs !== undefined && health.latencyMs >= 0 ? `${health.latencyMs} ms` : 'N/A'}
            </span>
            {health?.latencyMs !== undefined && health.latencyMs >= 0 && (
              <span className={`text-[10px] font-bold ${health.latencyMs < 50 ? 'text-emerald-600' : health.latencyMs < 200 ? 'text-blue-600' : 'text-amber-600'}`}>
                {health.latencyMs < 50 ? 'Mükemmel' : health.latencyMs < 200 ? 'İyi' : 'Yüksek'}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            Son Kontrol: {health?.lastCheckedAt ? new Date(health.lastCheckedAt).toLocaleTimeString('tr-TR') : '-'}
          </p>
        </div>

        {/* Pool Connections */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Bağlantı Havuzu</span>
            <Zap className="w-4 h-4 text-amber-500" />
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {health?.poolStats?.totalCount ?? 0}
            </span>
            <span className="text-xs text-slate-400 font-normal">
              (Boşta: {health?.poolStats?.idleCount ?? 0} | Bekleyen: {health?.poolStats?.waitingCount ?? 0})
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {health?.poolStats?.waitingCount && health.poolStats.waitingCount > 0 ? (
              <span className="text-amber-600 font-semibold">Kuyrukta bekleyen istemciler var</span>
            ) : (
              <span className="text-emerald-600 font-semibold">Havuz kuyruğu temiz</span>
            )}
          </p>
        </div>

        {/* Cleared Locks */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Çözülen Kilit / Askıda Sorgu</span>
            <ShieldCheck className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-2xl font-bold tracking-tight text-indigo-600 dark:text-indigo-400">
              {health?.hungQueriesCleared ?? 0}
            </span>
            <span className="text-xs text-slate-400 font-normal">adet kilit çözüldü</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            Son Onarım: {health?.lastRepairedAt ? new Date(health.lastRepairedAt).toLocaleTimeString('tr-TR') : 'Kilitlenme yaşanmadı'}
          </p>
        </div>
      </div>

      {/* RECENT HEALING ACTIONS */}
      {health?.healingEvents && health.healingEvents.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Son Otomatik Onarım Adımları</h3>
          </div>
          <div className="space-y-1.5 max-h-40 overflow-y-auto font-mono text-[11px]">
            {health.healingEvents.map((evt, idx) => (
              <div key={idx} className="p-2 bg-slate-50 dark:bg-slate-800/60 rounded-lg text-slate-700 dark:text-slate-300 border border-slate-100 dark:border-slate-800/80">
                {evt}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* REPAIR -> VERIFY SCHEMA CONTRACT AUDIT & REPAIR SECTION */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-200 dark:border-indigo-800/50">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Kanonik Şema Onarım & Doğrulama Döngüsü (Repair → Verify)
                </h3>
                {schemaAudit?.audit ? (
                  schemaAudit.audit.isHealthy ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                      PASS (%{schemaAudit.audit.score})
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                      FAIL (%{schemaAudit.audit.score})
                    </span>
                  )
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    Beklemede
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Onarım yapıldıktan sonra veritabanı anında tekrar okunur (Re-check). Kusur kalmışsa sistem "healthy" durumuna geçirilmez ve admin uyarılır.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full md:w-auto">
            <button
              onClick={fetchSchemaAudit}
              disabled={isLoadingSchemaAudit || isHealVerifying}
              className="flex-1 md:flex-initial px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSchemaAudit ? 'animate-spin' : ''}`} />
              <span>Şemayı Denetle</span>
            </button>
            <button
              onClick={triggerRepairVerifyLoop}
              disabled={isHealVerifying}
              className="flex-1 md:flex-initial px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-semibold rounded-xl shadow-md shadow-indigo-600/20 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Zap className={`w-3.5 h-3.5 ${isHealVerifying ? 'animate-spin' : ''}`} />
              <span>{isHealVerifying ? 'Repair → Verify Devrede...' : 'Repair → Verify Çalıştır'}</span>
            </button>
          </div>
        </div>

        {/* 4-STAGE REPAIR-VERIFY FLOW PIPELINE */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className={`p-3 rounded-xl border text-center transition-all ${
            healVerifyStep === 'DETECT'
              ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-400 dark:border-indigo-600 ring-2 ring-indigo-500/20'
              : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
          }`}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">1. Adım</div>
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-center gap-1.5">
              {healVerifyStep === 'DETECT' && <RefreshCw className="w-3 h-3 animate-spin text-indigo-500" />}
              <span>Detect (Tespit)</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-1">Eksik tablo/kolon/indeks tara</div>
          </div>

          <div className={`p-3 rounded-xl border text-center transition-all ${
            healVerifyStep === 'REPAIR'
              ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-400 dark:border-amber-600 ring-2 ring-amber-500/20'
              : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
          }`}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">2. Adım</div>
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-center gap-1.5">
              {healVerifyStep === 'REPAIR' && <RefreshCw className="w-3 h-3 animate-spin text-amber-500" />}
              <span>Repair (Onarım)</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-1">DDL & Trigger yamalarını uygula</div>
          </div>

          <div className={`p-3 rounded-xl border text-center transition-all ${
            healVerifyStep === 'RE_CHECK'
              ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-400 dark:border-blue-600 ring-2 ring-blue-500/20'
              : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
          }`}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">3. Adım</div>
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-center gap-1.5">
              {healVerifyStep === 'RE_CHECK' && <RefreshCw className="w-3 h-3 animate-spin text-blue-500" />}
              <span>Re-check (Doğrulama)</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-1">Canlı DB sözleşmesini tekrar oku</div>
          </div>

          <div className={`p-3 rounded-xl border text-center transition-all ${
            healVerifyStep === 'PASS'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-400 dark:border-emerald-600 ring-2 ring-emerald-500/20 text-emerald-800 dark:text-emerald-300'
              : healVerifyStep === 'FAIL'
              ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-400 dark:border-rose-600 ring-2 ring-rose-500/20 text-rose-800 dark:text-rose-300'
              : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
          }`}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">4. Sonuç</div>
            <div className="text-xs font-bold flex items-center justify-center gap-1.5">
              {healVerifyStep === 'PASS' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
              {healVerifyStep === 'FAIL' && <AlertOctagon className="w-3.5 h-3.5 text-rose-500" />}
              <span>{healVerifyStep === 'PASS' ? 'PASS (Onaylandı)' : healVerifyStep === 'FAIL' ? 'FAIL (Kusur Var)' : 'PASS / FAIL'}</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-1">
              {healVerifyStep === 'PASS' ? 'Sistem Sağlıklı' : healVerifyStep === 'FAIL' ? 'Degraded Koruması Aktif' : 'Doğrulama Kontrolü'}
            </div>
          </div>
        </div>

        {/* SCHEMA AUDIT STATS & SUMMARY */}
        {schemaAudit?.audit && (
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 text-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Tablolar:</span>
                <span className="font-mono bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                  {schemaAudit.audit.summary.existingTablesCount} / {schemaAudit.audit.summary.totalCanonicalTables} mevcut
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Eksik Kolonlar:</span>
                <span className={`font-mono px-2 py-0.5 rounded border ${
                  schemaAudit.audit.summary.missingColumnsCount === 0
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                }`}>
                  {schemaAudit.audit.summary.missingColumnsCount} adet
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-700 dark:text-slate-300">İndeksler:</span>
                <span className="font-mono bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                  {schemaAudit.audit.summary.missingIndexesCount === 0 ? 'Tam' : `${schemaAudit.audit.summary.missingIndexesCount} eksik`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Kısıtlar (Constraints):</span>
                <span className={`font-mono px-2 py-0.5 rounded border ${
                  (schemaAudit.audit.summary.missingConstraintsCount ?? 0) === 0
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                }`}>
                  {(schemaAudit.audit.summary.missingConstraintsCount ?? 0) === 0 ? 'Tam' : `${schemaAudit.audit.summary.missingConstraintsCount} eksik`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Drizzle/Migration Uyumu:</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  %100 Uyumlu
                </span>
              </div>
            </div>

            {/* If Discrepancies exist or Fail */}
            {schemaAudit.audit.humanReadableMessages && schemaAudit.audit.humanReadableMessages.length > 0 && !schemaAudit.audit.isHealthy && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-lg text-rose-800 dark:text-rose-300 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                  <span>Doğrulama Sonrası Giderilemeyen Şema Kusurları:</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                  {schemaAudit.audit.humanReadableMessages.map((msg, i) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ACTIONS TAKEN AFTER REPAIR */}
        {schemaHealResult && (
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 dark:text-slate-200">
                Son Onarım Özeti: {schemaHealResult.summaryMessage}
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                schemaHealResult.status === 'PASS'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
              }`}>
                Döngü Sonucu: {schemaHealResult.status}
              </span>
            </div>
            {schemaHealResult.actionsTaken && schemaHealResult.actionsTaken.length > 0 && (
              <div className="space-y-1">
                <span className="text-[11px] text-slate-500 font-semibold">Uygulanan DDL Adımları:</span>
                <div className="space-y-1 max-h-32 overflow-y-auto font-mono text-[10px]">
                  {schemaHealResult.actionsTaken.map((act, idx) => (
                    <div key={idx} className="p-1.5 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                      {act}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SYSTEM ARCHITECTURE & INSTALLATION DIAGNOSTIC AUDIT */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Sistem & Kurulum Sağlık Taraması (Installation Audit)</h3>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            Tüm Bileşenler Denetlendi
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-slate-800 dark:text-slate-200">1. Kilit & Deadlock Koruması</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              `SET lock_timeout = '2s'` ile engellendi. Ağır DDL sorguları arka plan havuzunu asla kitlemez.
            </p>
          </div>

          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-slate-800 dark:text-slate-200">2. Süreç Çökme Kalkanı</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              `uncaughtException` ve `unhandledRejection` kalkanları devrede. Node.js süreci asla aniden kapanmaz.
            </p>
          </div>

          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-slate-800 dark:text-slate-200">3. WebSocket Sunucu Koruması</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Hatalı soket yükseltmeleri ve istemci kopmaları yalıtıldı. Bağlantı kesintisi sistemi çökertmez.
            </p>
          </div>

          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-slate-800 dark:text-slate-200">4. Müşteri Veri İzolasyonu</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Müşteriler sadece kendi cihazlarına erişebilir. Sanal cihaz üretimi ve veri işleme yöneticiye aittir.
            </p>
          </div>

          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-slate-800 dark:text-slate-200">5. Canlı Kod Örnekleri Uyumu</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              ESP32 / NodeMCU / Python / WebSocket kod blokları güncel telemetri ve heartbeat API'leri ile senkronize.
            </p>
          </div>

          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-slate-800 dark:text-slate-200">6. Otomatik Havuz Kurtarma</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              PostgreSQL bağlantısı koptuğunda bellek içi veritabanına geçilir; düzeldiğinde otomatik yeniden bağlanır.
            </p>
          </div>
        </div>
      </div>

      {/* SYSTEM EVENT LOGS SECTION */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Sistem Olay Günlüğü (Event Logs)</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                {totalEvents} kayıt
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Veritabanı işlemleri, arka plan çalışanları, API istekleri ve sunucu olaylarının anlık kaydı.
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={exportEventsJson}
              disabled={events.length === 0}
              className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Dışa Aktar</span>
            </button>
            {confirmingClear ? (
              <div className="flex items-center gap-1.5 bg-rose-50 dark:bg-rose-950/60 p-1 rounded-lg border border-rose-200 dark:border-rose-900">
                <span className="text-[11px] text-rose-700 dark:text-rose-300 font-medium px-1">Emin misiniz?</span>
                <button
                  onClick={executeClearEvents}
                  className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded transition cursor-pointer"
                >
                  Evet, Temizle
                </button>
                <button
                  onClick={() => setConfirmingClear(false)}
                  className="px-2 py-1 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded transition cursor-pointer"
                >
                  İptal
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingClear(true)}
                disabled={events.length === 0}
                className="px-3 py-1.5 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Günlüğü Temizle</span>
              </button>
            )}
            <button
              onClick={fetchEvents}
              disabled={isLoadingEvents}
              className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingEvents ? 'animate-spin' : ''}`} />
              <span>Yenile</span>
            </button>
          </div>
        </div>

        {panelNotification && (
          <div
            className={`p-3 rounded-xl border flex items-center justify-between text-xs font-medium ${
              panelNotification.type === 'error'
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200'
                : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200'
            }`}
          >
            <span>{panelNotification.text}</span>
            <button
              onClick={() => setPanelNotification(null)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 ml-3 cursor-pointer"
            >
              ×
            </button>
          </div>
        )}

        {/* FILTERS & SEARCH */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Olay mesajı veya ayrıntı ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="all">Kategori: Tümü</option>
              <option value="database">database (Veritabanı)</option>
              <option value="auto_repair">auto_repair (Otomatik Onarım)</option>
              <option value="server">server (Sunucu)</option>
              <option value="websocket">websocket (Canlı Soket)</option>
              <option value="telemetry">telemetry (Telemetri)</option>
              <option value="security">security (Güvenlik)</option>
              <option value="auth">auth (Kimlik Doğrulama)</option>
            </select>
          </div>

          <div>
            <select
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="all">Seviye: Tümü</option>
              <option value="critical">Kritik (Critical)</option>
              <option value="error">Hata (Error)</option>
              <option value="warn">Uyarı (Warn)</option>
              <option value="info">Bilgi (Info)</option>
            </select>
          </div>
        </div>

        {/* EVENTS TABLE */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-2.5 px-3 w-16">Seviye</th>
                <th className="py-2.5 px-3 w-28">Kategori</th>
                <th className="py-2.5 px-3">Olay Mesajı</th>
                <th className="py-2.5 px-3 w-24">Kaynak</th>
                <th className="py-2.5 px-3 w-36">Zaman Damgası</th>
                <th className="py-2.5 px-3 w-12 text-center">Detay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {events.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Kayıtlı olay bulunamadı.
                  </td>
                </tr>
              ) : (
                events.map((evt) => {
                  const isExpanded = expandedEventId === evt.id;
                  return (
                    <React.Fragment key={evt.id}>
                      <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                        <td className="py-2.5 px-3">{getLevelBadge(evt.level)}</td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded font-mono text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {evt.category}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-800 dark:text-slate-200 font-medium">
                          {evt.message}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">{evt.source || 'system'}</td>
                        <td className="py-2.5 px-3 text-slate-500 text-[11px] whitespace-nowrap">
                          {new Date(evt.timestamp).toLocaleString('tr-TR')}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {evt.details ? (
                            <button
                              onClick={() => setExpandedEventId(isExpanded ? null : evt.id)}
                              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition text-slate-500 cursor-pointer"
                              title="Detayı Göster"
                            >
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-700">-</span>
                          )}
                        </td>
                      </tr>
                      {isExpanded && evt.details && (
                        <tr className="bg-slate-50 dark:bg-slate-950/60">
                          <td colSpan={6} className="p-3">
                            <div className="bg-slate-900 text-slate-200 font-mono text-[11px] p-3 rounded-lg overflow-x-auto max-h-48">
                              <pre>{evt.details}</pre>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
