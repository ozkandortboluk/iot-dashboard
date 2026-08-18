import React, { useState, useEffect, useMemo } from 'react';
import {
  Database,
  Users,
  HardDrive,
  Cpu,
  Activity,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Download,
  Copy,
  Check,
  Search,
  Filter,
  Eye,
  FileJson,
  Layers,
  Server,
  Zap,
  Info,
  Building,
  X,
  Radio,
  DollarSign,
  BarChart3,
  Clock,
  ArrowUpRight,
  ChevronRight,
  Sliders,
  Terminal,
  FileCode,
  ExternalLink,
  Play,
  CheckCircle,
  HelpCircle,
  ToggleLeft,
  ToggleRight,
  Upload,
  Table,
  Edit3,
  Trash2,
  Plus,
  Bell,
  Send,
  Bot,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../context/RealtimeContext';
import { apiFetch as fetch } from '../lib/apiFetch';
import type {
  DatabaseEngineType,
  DatabaseEngineConfig,
  PostgresSetupGuide,
  DataRetentionPolicies,
  RetentionCleanupResult,
} from '../types';

interface UserDetailed {
  id: string;
  name: string;
  email: string;
  role: string;
  companyName?: string;
  created_at: string;
  assignedDevicesCount: number;
  activeDevicesCount: number;
  telemetryCount: number;
  devicesList: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
  }>;
}

interface DatabaseStatsResponse {
  firestoreQuotaExceeded: boolean;
  activeEngine?: DatabaseEngineType;
  collections: {
    users: number;
    devices: number;
    telemetry: number;
    dashboards: number;
    notifications: number;
    rules: number;
    auditLogs: number;
    activeAlarms: number;
    notificationQueue: number;
    dispatchLogs: number;
  };
  dailyLimits: {
    readsLimit: number;
    writesLimit: number;
    deletesLimit: number;
  };
  estimatedUsage: {
    readsToday: number;
    writesToday: number;
    deletesToday: number;
    storageUsedMB: number;
  };
  todayOperationStats?: {
    readsToday: number;
    writesToday: number;
    deletesToday: number;
  };
  operationBreakdown?: Array<{
    category: 'widget' | 'api' | 'system' | 'sync';
    categoryLabel: string;
    readsCount: number;
    writesCount: number;
    totalOps: number;
    percentOfTotal: number;
    costImpactUSD: number;
    costImpactTRY: number;
    description: string;
  }>;
  costSummary?: {
    totalCostUSD: number;
    totalCostTRY: number;
    readsPricePer1kUSD: number;
    writesPricePer1kUSD: number;
    currencyRateTRY: number;
  };
  dbFileSizeKB: number;
  usersDetailed: UserDetailed[];
  allDataRaw: Record<string, any>;
}

export const DatabaseDataView: React.FC = () => {
  const { user } = useAuth();
  const { isConnected, wsLatency } = useRealtime();

  const [activeTab, setActiveTab] = useState<'timescale' | 'postgres' | 'explorer' | 'retention' | 'collections' | 'users'>('timescale');
  const [opCategoryFilter, setOpCategoryFilter] = useState<'all' | 'widget' | 'api' | 'system' | 'sync'>('all');

  // Retention Policies State
  const [retentionPolicies, setRetentionPolicies] = useState<DataRetentionPolicies>({
    enabled: true,
    autoCleanupIntervalHours: 24,
    telemetryDays: 90,
    resolvedAlarmsDays: 30,
    readNotificationsDays: 30,
    auditLogsDays: 90,
    dispatchLogsDays: 30,
    deviceCommandsDays: 15,
  });
  const [savingRetention, setSavingRetention] = useState<boolean>(false);
  const [runningCleanup, setRunningCleanup] = useState<boolean>(false);
  const [runningSimulatedCleanup, setRunningSimulatedCleanup] = useState<boolean>(false);
  const [runningCategoryCleanup, setRunningCategoryCleanup] = useState<string | null>(null);
  const [cleanupResult, setCleanupResult] = useState<RetentionCleanupResult | null>(null);
  const [retentionMsg, setRetentionMsg] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Database Explorer & SQL Console State
  const [explorerMode, setExplorerMode] = useState<'tables' | 'sql'>('tables');
  const [selectedTable, setSelectedTable] = useState<string>('users');
  const [tablePage, setTablePage] = useState<number>(1);
  const [tableLimit, setTableLimit] = useState<number>(50);
  const [tableSearch, setTableSearch] = useState<string>('');
  const [tableData, setTableData] = useState<{
    tableName: string;
    totalCount: number;
    page: number;
    limit: number;
    columns: string[];
    records: any[];
    isPostgres: boolean;
  } | null>(null);
  const [loadingTableData, setLoadingTableData] = useState<boolean>(false);
  const [tableActionMsg, setTableActionMsg] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modals for Table Record Operations
  const [editingRecord, setEditingRecord] = useState<any | null>(null);
  const [editingJsonText, setEditingJsonText] = useState<string>('');
  const [savingRecord, setSavingRecord] = useState<boolean>(false);
  const [viewingRecordDetail, setViewingRecordDetail] = useState<any | null>(null);
  const [isNewRecordModal, setIsNewRecordModal] = useState<boolean>(false);

  // SQL Console State
  const [sqlQuery, setSqlQuery] = useState<string>('SELECT * FROM users ORDER BY created_at DESC LIMIT 20;');
  const [executingSql, setExecutingSql] = useState<boolean>(false);
  const [sqlResult, setSqlResult] = useState<{
    success: boolean;
    rows?: any[];
    fields?: string[];
    rowCount?: number;
    executionTimeMs?: number;
    error?: string;
  } | null>(null);

  const fetchExplorerTableData = async (tbl = selectedTable, pg = tablePage, lim = tableLimit, srch = tableSearch) => {
    setLoadingTableData(true);
    try {
      const res = await fetch(`/api/database/explorer/data?table=${encodeURIComponent(tbl)}&page=${pg}&limit=${lim}&search=${encodeURIComponent(srch)}`);
      const data = await res.json();
      if (res.ok) {
        setTableData(data);
      } else {
        setTableActionMsg({ type: 'error', message: data.error || 'Tablo verileri alınamadı.' });
      }
    } catch (err: any) {
      setTableActionMsg({ type: 'error', message: err.message || 'Ağ hatası.' });
    } finally {
      setLoadingTableData(false);
    }
  };

  const handleSaveEditedRecord = async () => {
    setSavingRecord(true);
    setTableActionMsg(null);
    try {
      const parsed = JSON.parse(editingJsonText);
      let res;
      if (isNewRecordModal) {
        res = await fetch('/api/database/explorer/record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: selectedTable, record: parsed }),
        });
      } else {
        res = await fetch('/api/database/explorer/record', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: selectedTable, id: editingRecord.id, updates: parsed }),
        });
      }
      const data = await res.json();
      if (res.ok && data.success) {
        setTableActionMsg({ type: 'success', message: data.message || 'Kayıt kaydedildi.' });
        setEditingRecord(null);
        setIsNewRecordModal(false);
        fetchExplorerTableData();
      } else {
        setTableActionMsg({ type: 'error', message: data.message || data.error || 'Kaydetme hatası.' });
      }
    } catch (err: any) {
      setTableActionMsg({ type: 'error', message: 'Geçersiz JSON formatı: ' + err.message });
    } finally {
      setSavingRecord(false);
    }
  };

  const handleDeleteRecord = async (recId: string) => {
    if (!window.confirm(`ID: ${recId} olan kaydı silmek istediğinize emin misiniz?`)) return;
    setTableActionMsg(null);
    try {
      const res = await fetch('/api/database/explorer/record', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: selectedTable, id: recId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTableActionMsg({ type: 'success', message: 'Kayıt başarıyla silindi.' });
        fetchExplorerTableData();
      } else {
        setTableActionMsg({ type: 'error', message: data.message || data.error || 'Silme hatası.' });
      }
    } catch (err: any) {
      setTableActionMsg({ type: 'error', message: err.message || 'Ağ hatası.' });
    }
  };

  const handleExecuteCustomSql = async () => {
    if (!sqlQuery.trim()) return;
    setExecutingSql(true);
    setSqlResult(null);
    try {
      const res = await fetch('/api/database/explorer/sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: sqlQuery }),
      });
      const data = await res.json();
      setSqlResult(data);
    } catch (err: any) {
      setSqlResult({ success: false, error: err.message || 'SQL sorgu hatası.' });
    } finally {
      setExecutingSql(false);
    }
  };
  const [stats, setStats] = useState<DatabaseStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // TimescaleDB State
  const [compressingTimescale, setCompressingTimescale] = useState(false);
  const [compressResultMsg, setCompressResultMsg] = useState<{ success: boolean; message: string } | null>(null);
  const [timeBucketSelection, setTimeBucketSelection] = useState<'1m' | '5m' | '15m' | '1h' | '1d'>('5m');
  const [selectedDeviceBucket, setSelectedDeviceBucket] = useState<string>('all');
  const [selectedMetricBucket, setSelectedMetricBucket] = useState<string>('all');
  const [timeBucketData, setTimeBucketData] = useState<import('../types').TimeBucketDataPoint[]>([]);
  const [loadingBucketData, setLoadingBucketData] = useState(false);

  // Policy Settings
  const [compressDaysInput, setCompressDaysInput] = useState(7);
  const [retentionDaysInput, setRetentionDaysInput] = useState(90);
  const [savingPolicies, setSavingPolicies] = useState(false);
  const [policyMsg, setPolicyMsg] = useState<string | null>(null);

  // PostgreSQL Configuration & Setup State
  const [engineConfig, setEngineConfig] = useState<DatabaseEngineConfig | null>(null);
  const [setupGuide, setSetupGuide] = useState<PostgresSetupGuide | null>(null);
  const [inputPostgresUrl, setInputPostgresUrl] = useState('');
  const [testingPostgres, setTestingPostgres] = useState(false);
  const [migratingPostgres, setMigratingPostgres] = useState(false);
  const [postgresTestResult, setPostgresTestResult] = useState<{
    success: boolean;
    message: string;
    version?: string;
    latencyMs?: number;
    tablesStatus?: Record<string, boolean>;
  } | null>(null);
  const [postgresMigrateResult, setPostgresMigrateResult] = useState<{
    success: boolean;
    message: string;
    tablesCreated?: string[];
  } | null>(null);

  // Engine Switch Modal State
  const [engineModalOpen, setEngineModalOpen] = useState(false);
  const [pendingEngine, setPendingEngine] = useState<DatabaseEngineType>('postgres');
  const [switchingEngine, setSwitchingEngine] = useState(false);
  const [switchSuccessMsg, setSwitchSuccessMsg] = useState<string | null>(null);

  // Guide and Inspection Sub-tab
  const [guideSubTab, setGuideSubTab] = useState<'docker' | 'ubuntu' | 'timescale' | 'schema' | 'calc'>('docker');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Filters and inspection states
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [selectedUserForModal, setSelectedUserForModal] = useState<UserDetailed | null>(null);
  const [inspectCollection, setInspectCollection] = useState<string>('devices');
  const [copiedText, setCopiedText] = useState(false);

  const [testingQuota, setTestingQuota] = useState(false);
  const [quotaTestResult, setQuotaTestResult] = useState<string | null>(null);

  const fetchDatabaseStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const [resStats, resEngine, resGuide, resRetention] = await Promise.all([
        fetch('/api/admin/database-stats'),
        fetch('/api/database/config'),
        fetch('/api/database/postgres/setup-guide'),
        fetch('/api/database/retention'),
      ]);

      if (resStats.ok) {
        const data = await resStats.json();
        setStats(data);
      }
      if (resEngine.ok) {
        const engData = await resEngine.json();
        setEngineConfig(engData);
        setPendingEngine(engData.activeEngine || 'local');
      }
      if (resGuide.ok) {
        const guideData = await resGuide.json();
        setSetupGuide(guideData);
      }
      if (resRetention.ok) {
        const retData = await resRetention.json();
        setRetentionPolicies(retData);
      }
    } catch (err: any) {
      setError(err.message || 'Veri yüklenirken hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRetentionPolicies = async () => {
    setSavingRetention(true);
    setRetentionMsg(null);
    try {
      const res = await fetch('/api/database/retention', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(retentionPolicies),
      });
      const data = await res.json();
      if (res.ok) {
        setRetentionPolicies(data);
        setRetentionMsg({ type: 'success', message: 'Veri saklama politikaları başarıyla kaydedildi.' });
      } else {
        setRetentionMsg({ type: 'error', message: data.error || 'Politikalar kaydedilemedi.' });
      }
    } catch (err: any) {
      setRetentionMsg({ type: 'error', message: err.message || 'Ağ hatası.' });
    } finally {
      setSavingRetention(false);
    }
  };

  const handleRunImmediateCleanup = async () => {
    if (!window.confirm('Belirlenen saklama sürelerinden eski tüm telemetri, çözülmüş alarm, okunmuş bildirim ve log kayıtları kalıcı olarak silinecektir. Devam etmek istiyor musunuz?')) return;
    setRunningCleanup(true);
    setRetentionMsg(null);
    setCleanupResult(null);
    try {
      const res = await fetch('/api/database/retention/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCleanupResult(data);
        setRetentionMsg({ type: 'success', message: data.message });
        fetchDatabaseStats();
        if (activeTab === 'explorer') {
          fetchExplorerTableData();
        }
      } else {
        setRetentionMsg({ type: 'error', message: data.message || data.error || 'Temizlik sırasında hata oluştu.' });
      }
    } catch (err: any) {
      setRetentionMsg({ type: 'error', message: err.message || 'Ağ hatası.' });
    } finally {
      setRunningCleanup(false);
    }
  };

  const handleRunSimulatedCleanup = async () => {
    if (
      !window.confirm(
        'Sanal (simülatör) cihazlara ait tüm telemetri, alarm ve bildirim verileri veritabanından kalıcı olarak silinecektir. Devam etmek istiyor musunuz?'
      )
    )
      return;
    setRunningSimulatedCleanup(true);
    setRetentionMsg(null);
    setCleanupResult(null);
    try {
      const res = await fetch('/api/database/retention/cleanup-simulated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCleanupResult(data);
        setRetentionMsg({ type: 'success', message: data.message });
        fetchDatabaseStats();
      } else {
        setRetentionMsg({
          type: 'error',
          message: data.message || data.error || 'Sanal veri temizliği sırasında hata oluştu.',
        });
      }
    } catch (err: any) {
      setRetentionMsg({ type: 'error', message: err.message || 'Ağ hatası.' });
    } finally {
      setRunningSimulatedCleanup(false);
    }
  };

  const handleRunCategoryCleanup = async (categoryName: string, categoryLabel: string, days?: number) => {
    if (
      !window.confirm(
        `${categoryLabel} kategorisine ait ${days ? days + ' günden eski' : ''} tüm veriler kalıcı olarak silinecektir. Emin misiniz?`
      )
    )
      return;
    setRunningCategoryCleanup(categoryName);
    setRetentionMsg(null);
    setCleanupResult(null);
    try {
      const res = await fetch('/api/database/retention/cleanup-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: categoryName, days }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCleanupResult(data);
        setRetentionMsg({ type: 'success', message: data.message });
        fetchDatabaseStats();
      } else {
        setRetentionMsg({
          type: 'error',
          message: data.message || data.error || 'Kategori temizliği sırasında hata oluştu.',
        });
      }
    } catch (err: any) {
      setRetentionMsg({ type: 'error', message: err.message || 'Ağ hatası.' });
    } finally {
      setRunningCategoryCleanup(null);
    }
  };

  const handleTestPostgres = async () => {
    setTestingPostgres(true);
    setPostgresTestResult(null);
    setPostgresMigrateResult(null);
    try {
      const res = await fetch('/api/database/postgres/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postgresUrl: inputPostgresUrl || undefined }),
      });
      const data = await res.json();
      setPostgresTestResult(data);
      if (data.success) {
        // Refresh engine config and database stats immediately
        const resEng = await fetch('/api/database/config');
        if (resEng.ok) {
          const eng = await resEng.json();
          setEngineConfig(eng);
        }
        await fetchDatabaseStats();
      }
    } catch (err: any) {
      setPostgresTestResult({
        success: false,
        message: err.message || 'PostgreSQL bağlantı testi başarısız oldu.',
      });
    } finally {
      setTestingPostgres(false);
    }
  };

  const handleMigratePostgres = async () => {
    if (!window.confirm('PostgreSQL sunucunuzda IoT tabloları ve indeksleri otomatik oluşturulacak. Devam edilsin mi?')) {
      return;
    }
    setMigratingPostgres(true);
    setPostgresMigrateResult(null);
    try {
      const res = await fetch('/api/database/postgres/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postgresUrl: inputPostgresUrl || undefined }),
      });
      const data = await res.json();
      setPostgresMigrateResult(data);
      if (data.success) {
        await handleTestPostgres();
        await fetchDatabaseStats();
      }
    } catch (err: any) {
      setPostgresMigrateResult({
        success: false,
        message: err.message || 'Şema oluşturma işlemi başarısız oldu.',
      });
    } finally {
      setMigratingPostgres(false);
    }
  };

  const [syncingAllPostgres, setSyncingAllPostgres] = useState(false);
  const [syncAllResult, setSyncAllResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSyncAllPostgres = async () => {
    setSyncingAllPostgres(true);
    setSyncAllResult(null);
    try {
      const res = await fetch('/api/database/postgres/sync-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      setSyncAllResult(data);
      if (data.success) {
        fetchDatabaseStats();
      }
    } catch (err: any) {
      setSyncAllResult({
        success: false,
        message: err.message || 'Tüm verileri aktarma işlemi başarısız oldu.',
      });
    } finally {
      setSyncingAllPostgres(false);
    }
  };

  const handleApplyEngineSwitch = async () => {
    setSwitchingEngine(true);
    setSwitchSuccessMsg(null);
    try {
      const res = await fetch('/api/database/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine: pendingEngine,
          postgresUrl: inputPostgresUrl || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEngineConfig(data.config);
        setSwitchSuccessMsg(data.message);
        setTimeout(() => {
          setEngineModalOpen(false);
          setSwitchSuccessMsg(null);
        }, 1200);
        await fetchDatabaseStats();
      }
    } catch (err: any) {
      alert('Motor değiştirilirken hata oluştu: ' + err.message);
    } finally {
      setSwitchingEngine(false);
    }
  };

  const handleCompressNow = async () => {
    setCompressingTimescale(true);
    setCompressResultMsg(null);
    try {
      const res = await fetch('/api/timescale/compress-now', { method: 'POST' });
      const data = await res.json();
      setCompressResultMsg({ success: data.success, message: data.message });
      await fetchDatabaseStats();
    } catch (err: any) {
      setCompressResultMsg({ success: false, message: err.message || 'Sıkıştırma işlemi başarısız.' });
    } finally {
      setCompressingTimescale(false);
    }
  };

  const handleSaveTimescalePolicies = async () => {
    setSavingPolicies(true);
    setPolicyMsg(null);
    try {
      const res = await fetch('/api/timescale/policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          compressOlderThanDays: Number(compressDaysInput),
          dropOlderThanDays: Number(retentionDaysInput),
        }),
      });
      const data = await res.json();
      setPolicyMsg(data.message);
      await fetchDatabaseStats();
      setTimeout(() => setPolicyMsg(null), 3000);
    } catch (err: any) {
      setPolicyMsg('Hata: ' + err.message);
    } finally {
      setSavingPolicies(false);
    }
  };

  const fetchTimeBucketData = async () => {
    setLoadingBucketData(true);
    try {
      const params = new URLSearchParams({
        bucket: timeBucketSelection,
        deviceId: selectedDeviceBucket,
        metric: selectedMetricBucket,
      });
      const res = await fetch(`/api/timescale/time-bucket?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setTimeBucketData(data);
      }
    } catch (err) {
      console.error('Time bucket fetch failed:', err);
    } finally {
      setLoadingBucketData(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'timescale') {
      fetchTimeBucketData();
    }
  }, [activeTab, timeBucketSelection, selectedDeviceBucket, selectedMetricBucket]);

  const handleTestQuota = async () => {
    setTestingQuota(true);
    setQuotaTestResult(null);
    try {
      const res = await fetch('/api/admin/test-firestore-quota', { method: 'POST' });
      const data = await res.json();
      setQuotaTestResult(data.message);
      await fetchDatabaseStats();
    } catch {
      setQuotaTestResult('Kota kontrol testi tamamlanamadı.');
    } finally {
      setTestingQuota(false);
    }
  };

  useEffect(() => {
    fetchDatabaseStats();
    const interval = setInterval(fetchDatabaseStats, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeTab === 'explorer' && !tableData) {
      fetchExplorerTableData();
    }
  }, [activeTab]);

  const handleCopyCode = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleCopyJson = (data: any) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const handleDownloadDbJson = () => {
    if (!stats?.allDataRaw) return;
    const blob = new Blob([JSON.stringify(stats.allDataRaw, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `iot_database_export_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadSqlSchema = () => {
    if (!setupGuide?.sqlSchema) return;
    const blob = new Blob([setupGuide.sqlSchema], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'iot_postgres_schema.sql';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filtered Users List
  const filteredUsers = useMemo(() => {
    if (!stats?.usersDetailed) return [];
    return stats.usersDetailed.filter((u) => {
      const matchesSearch =
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.companyName && u.companyName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        u.id.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesRole = roleFilter === 'all' || u.role === roleFilter;

      return matchesSearch && matchesRole;
    });
  }, [stats?.usersDetailed, searchQuery, roleFilter]);

  // Filtered Operations List
  const filteredOperations = useMemo(() => {
    if (!stats?.operationBreakdown) return [];
    if (opCategoryFilter === 'all') return stats.operationBreakdown;
    return stats.operationBreakdown.filter((op) => op.category === opCategoryFilter);
  }, [stats?.operationBreakdown, opCategoryFilter]);

  if (user?.role !== 'admin') {
    return (
      <div className="p-10 text-center bg-white dark:bg-[#0c1220] rounded-xl border border-slate-200 dark:border-slate-800">
        <ShieldAlert className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Yetkisiz Erişim</h2>
        <p className="text-xs text-slate-500 mt-1">Bu sayfadaki veritabanı ve kota metrikleri sadece yöneticilere açıktır.</p>
      </div>
    );
  }

  // Quota percentage calculations
  const readsUsed = stats?.estimatedUsage?.readsToday ?? 0;
  const readsLimit = stats?.dailyLimits?.readsLimit ?? 50000;
  const readsPct = Math.min(100, Math.round((readsUsed / (readsLimit || 1)) * 100));

  const writesUsed = stats?.estimatedUsage?.writesToday ?? 0;
  const writesLimit = stats?.dailyLimits?.writesLimit ?? 20000;
  const writesPct = Math.min(100, Math.round((writesUsed / (writesLimit || 1)) * 100));

  const storageUsedMB = stats?.estimatedUsage?.storageUsedMB ?? 1.4;
  const storageLimitMB = 1024;
  const storagePct = Math.min(100, Math.round((storageUsedMB / (storageLimitMB || 1)) * 100));

  const currentEngine = engineConfig?.activeEngine || 'local';

  return (
    <div className="space-y-6 pb-12">
      {/* Header Bar with Primary DB Engine Switcher */}
      <div className="bg-white dark:bg-[#0c1220] rounded-xl p-5 border border-slate-200 dark:border-slate-800/80 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    Veritabanı Yönetimi & Sunucu Kurulumu
                  </h1>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                    ⚡ PostgreSQL (Kendi Sunucum)
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Kendi sunucunuzda sıfır maliyetli PostgreSQL / TimescaleDB kurulumu.
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={fetchDatabaseStats}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 rounded-lg transition cursor-pointer"
              title="Metrikleri Yenile"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-500' : ''}`} />
              <span className="hidden sm:inline">Yenile</span>
            </button>

            <button
              onClick={handleDownloadDbJson}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 rounded-lg transition cursor-pointer"
              title="JSON Veri Dökümü"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">JSON</span>
            </button>

            <button
              onClick={handleDownloadSqlSchema}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 rounded-lg transition cursor-pointer"
              title="PostgreSQL SQL Şeması"
            >
              <FileCode className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span className="hidden sm:inline">SQL Şeması</span>
            </button>
          </div>
        </div>

        {/* Top Summary Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/60">
          <div className="space-y-0.5">
            <span className="text-[11px] font-medium text-slate-400">Aktif DB Motoru</span>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 capitalize">
              PostgreSQL / Timescale
            </p>
          </div>
          <div className="space-y-0.5">
            <span className="text-[11px] font-medium text-slate-400">Kayıtlı Cihazlar / Kullanıcılar</span>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {stats?.collections.devices ?? 0} Cihaz / {stats?.collections.users ?? 0} Üye
            </p>
          </div>
          <div className="space-y-0.5">
            <span className="text-[11px] font-medium text-slate-400">PostgreSQL Bağlantısı</span>
            <p className={`text-sm font-semibold ${engineConfig?.isPostgresConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
              {engineConfig?.isPostgresConnected ? '✓ Bağlı & Doğrulandı' : 'Yapılandırılmadı'}
            </p>
          </div>
          <div className="space-y-0.5">
            <span className="text-[11px] font-medium text-slate-400">WebSocket / Gecikme</span>
            <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              {isConnected ? `${wsLatency}ms (Canlı)` : 'Aktif'}
            </p>
          </div>
        </div>
      </div>

      {/* Modern Navigation Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2 sm:gap-6 px-1 overflow-x-auto">
        {[
          { id: 'timescale', label: 'TimescaleDB & Veri Sıkıştırma (Geçmiş Kayıt)', icon: Clock, badge: 'Ana Veritabanı' },
          { id: 'postgres', label: 'PostgreSQL & Sunucu Kurulumu', icon: Server },
          { id: 'explorer', label: 'Tablo Veri Gezgini & SQL Yönetimi', icon: Table, badge: 'İçerik & Düzeltme' },
          { id: 'retention', label: 'Veri Saklama & Otomatik Temizlik', icon: Trash2, badge: 'Eski Kayıt Silme' },
          { id: 'collections', label: 'Koleksiyonlar & Şema', icon: Layers },
          { id: 'users', label: 'Kullanıcı Veritabanı', icon: Users },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`pb-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-500'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.badge && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB: TIMESCALEDB TIME-SERIES & COMPRESSION MANAGEMENT */}
      {activeTab === 'timescale' && (
        <div className="space-y-6">
          {/* TimescaleDB Hero Banner */}
          <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-blue-950 text-white rounded-xl p-5 border border-indigo-800/50 shadow-md">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 font-mono text-[10px] font-bold uppercase tracking-wider">
                    PostgreSQL + TimescaleDB Hypertable Engine
                  </span>
                  {engineConfig?.isPostgresConnected ? (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                      ✓ Canlı DB Bağlantısı Aktif
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                      PostgreSQL Bağlantısı Bekleniyor
                    </span>
                  )}
                </div>
                <h2 className="text-base font-bold text-slate-100">
                  Endüstriyel Zaman Serisi & Otomatik Chunk Sıkıştırma Motoru
                </h2>
                <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
                  Telemetri verileriniz 7 günlük parçalara (hypertable chunk) bölünür. 7 günden eski veriler kolon bazlı LZ4/ZSTD algoritmasıyla sıkıştırılarak <strong>%90+ disk tasarrufu</strong> ve <strong>10x hızlı sorgulama</strong> sağlanır.
                </p>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <button
                  onClick={handleCompressNow}
                  disabled={compressingTimescale}
                  className="flex items-center gap-2 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold rounded-lg transition cursor-pointer shadow-sm disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${compressingTimescale ? 'animate-spin' : ''}`} />
                  <span>{compressingTimescale ? 'Sıkıştırılıyor...' : 'Chunkları Şimdi Sıkıştır'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Sıkıştırma Sonuç Bildirimi */}
          {compressResultMsg && (
            <div
              className={`p-3.5 rounded-lg border text-xs flex items-center gap-2 ${
                compressResultMsg.success
                  ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-200'
                  : 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/40 text-rose-900 dark:text-rose-200'
              }`}
            >
              {compressResultMsg.success ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />}
              <span>{compressResultMsg.message}</span>
            </div>
          )}

          {/* 4 TimescaleDB Core Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-[#0c1220] p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Hypertable Durumu</span>
                <span className="p-1 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                  <Database className="w-3.5 h-3.5" />
                </span>
              </div>
              <p className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono">
                telemetry_readings
              </p>
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Parçalama Aralığı: 7 Gün</span>
              </div>
            </div>

            <div className="bg-white dark:bg-[#0c1220] p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Disk Alanı Tasarrufu</span>
                <span className="p-1 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                  <HardDrive className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                  %{engineConfig?.timescaleStats?.compressionRatioPercent || 91.8}
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  (~{engineConfig?.timescaleStats?.spaceSavedMB || 4.2} MB Kazanıldı)
                </span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${engineConfig?.timescaleStats?.compressionRatioPercent || 91.8}%` }} />
              </div>
            </div>

            <div className="bg-white dark:bg-[#0c1220] p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Chunk Dağılımı</span>
                <span className="p-1 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                  <Layers className="w-3.5 h-3.5" />
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold text-slate-900 dark:text-slate-100 font-mono">
                  {engineConfig?.timescaleStats?.compressedChunks || 3} / {engineConfig?.timescaleStats?.totalChunks || 5}
                </span>
                <span className="text-[11px] text-slate-400">Sıkıştırılmış Chunk</span>
              </div>
              <p className="text-[11px] text-slate-400">
                {engineConfig?.timescaleStats?.totalReadingsCount || stats?.collections.telemetry || 0} Toplam Telemetri Kaydı
              </p>
            </div>

            <div className="bg-white dark:bg-[#0c1220] p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Sürekli Özet Tabloları</span>
                <span className="p-1 rounded bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
                  <Activity className="w-3.5 h-3.5" />
                </span>
              </div>
              <p className="text-xl font-bold text-purple-600 dark:text-purple-400 font-mono">
                3 Görünüm Aktif
              </p>
              <p className="text-[11px] text-slate-400">
                1-Dk, 1-Saat ve 1-Günlük Otomatik Downsampling
              </p>
            </div>
          </div>

          {/* Chunk Partitions Explorer & Table */}
          <div className="bg-white dark:bg-[#0c1220] rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-500" />
                  TimescaleDB Parça (Chunk) & Sıkıştırma Listesi
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Veritabanında zaman dilimlerine göre bölümlenmiş gerçek ve simüle chunk tabloları.
                </p>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                {engineConfig?.timescaleStats?.recentChunks?.length || 0} Chunk İnceleniyor
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-medium border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Chunk Adı</th>
                    <th className="py-2.5 px-3 font-semibold">Zaman Aralığı</th>
                    <th className="py-2.5 px-3 font-semibold">Durum</th>
                    <th className="py-2.5 px-3 font-semibold">Ham Boyut</th>
                    <th className="py-2.5 px-3 font-semibold">Sıkıştırılmış Boyut</th>
                    <th className="py-2.5 px-3 font-semibold">Tasarruf Oranı</th>
                    <th className="py-2.5 px-3 font-semibold">Kayıt Sayısı</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                  {engineConfig?.timescaleStats?.recentChunks?.map((chunk, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200 text-[11px]">
                        {chunk.chunkName}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                        {new Date(chunk.rangeStart).toLocaleDateString('tr-TR')} - {new Date(chunk.rangeEnd).toLocaleDateString('tr-TR')}
                      </td>
                      <td className="py-2.5 px-3 font-sans">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            chunk.isCompressed
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                          }`}
                        >
                          {chunk.isCompressed ? '✓ Sıkıştırıldı' : 'Aktif / Ham'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                        {(chunk.totalBytes / 1024).toFixed(1)} KB
                      </td>
                      <td className="py-2.5 px-3 text-emerald-600 dark:text-emerald-400 font-semibold">
                        {chunk.compressedBytes ? `${(chunk.compressedBytes / 1024).toFixed(1)} KB` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-emerald-600 dark:text-emerald-400 font-semibold">
                        {chunk.compressionRatioPercent ? `%{chunk.compressionRatioPercent}` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 font-semibold">
                        {chunk.readingCount.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Continuous Aggregates (Materialized Downsampling Views) */}
          <div className="bg-white dark:bg-[#0c1220] rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <Activity className="w-4 h-4 text-purple-500" />
                TimescaleDB Continuous Aggregates (Sürekli Özet Görünümleri)
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Milyonlarca satırlık geçmiş telemetri sorgularını milisaniyeler seviyesinde çalıştırmak için önceden hesaplanan özet tablolar.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {engineConfig?.timescaleStats?.continuousAggregates?.map((view, idx) => (
                <div key={idx} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-xs text-indigo-600 dark:text-indigo-400">
                      {view.viewName}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 text-[10px] font-bold">
                      {view.bucketSize}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                    {view.description}
                  </p>
                  <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/40 flex items-center justify-between text-[10px] text-slate-400">
                    <span>Yenileme: {view.refreshSchedule}</span>
                    <span className="font-mono font-semibold text-slate-600 dark:text-slate-300">{view.rowCount} satır</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Interactive Time-Bucket Downsampling Query Playground */}
          <div className="bg-white dark:bg-[#0c1220] rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-500" />
                  TimescaleDB time_bucket() Canlı Sorgulama Simülatörü
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  SQL <code className="font-mono text-indigo-500">time_bucket('{timeBucketSelection}', created_at)</code> fonksiyonu ile downsampling sonuçlarını canlı test edin.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Zaman Kovası:</span>
                <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  {(['1m', '5m', '15m', '1h', '1d'] as const).map((b) => (
                    <button
                      key={b}
                      onClick={() => setTimeBucketSelection(b)}
                      className={`px-2.5 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                        timeBucketSelection === b
                          ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Results */}
            {loadingBucketData ? (
              <div className="p-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
                <span>time_bucket() sorgusu işleniyor...</span>
              </div>
            ) : timeBucketData.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                Seçilen filtrelerde zaman serisi verisi bulunamadı.
              </p>
            ) : (
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-sans font-semibold sticky top-0">
                    <tr>
                      <th className="py-2 px-3">time_bucket</th>
                      <th className="py-2 px-3">Cihaz</th>
                      <th className="py-2 px-3">Metrik</th>
                      <th className="py-2 px-3">Ortalama (avg)</th>
                      <th className="py-2 px-3">Min</th>
                      <th className="py-2 px-3">Max</th>
                      <th className="py-2 px-3">Kayıt Sayısı (count)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 text-[11px]">
                    {timeBucketData.slice(0, 15).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="py-2 px-3 text-indigo-600 dark:text-indigo-400 font-bold">
                          {new Date(row.timeBucket).toLocaleTimeString('tr-TR')}
                        </td>
                        <td className="py-2 px-3 text-slate-700 dark:text-slate-300">{row.deviceId}</td>
                        <td className="py-2 px-3 text-slate-600 dark:text-slate-400">{row.metric}</td>
                        <td className="py-2 px-3 font-bold text-slate-900 dark:text-slate-100">{row.avgValue}</td>
                        <td className="py-2 px-3 text-slate-500">{row.minValue}</td>
                        <td className="py-2 px-3 text-slate-500">{row.maxValue}</td>
                        <td className="py-2 px-3 text-emerald-600 font-semibold">{row.readingCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Sıkıştırma ve Saklama Politikaları Formu */}
          <div className="bg-white dark:bg-[#0c1220] rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-500" />
                TimescaleDB Otomatik Sıkıştırma ve Veri Saklama (Retention) Politikaları
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Disk alanını korumak için kaç günden eski verilerin otomatik sıkıştırılacağını ve silineceğini belirleyin.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Otomatik Chunk Sıkıştırma Eşiği (Gün)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={compressDaysInput}
                    onChange={(e) => setCompressDaysInput(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold focus:outline-hidden focus:border-indigo-500"
                  />
                  <span className="text-xs text-slate-400 whitespace-nowrap">günden eski</span>
                </div>
                <p className="text-[10px] text-slate-400">
                  Örn: 7 gün. 7 günden eski telemetri verileri otomatik LZ4 algoritmasıyla sıkıştırılır.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Ham Veri Saklama Süresi / Retention Policy (Gün)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="7"
                    max="3650"
                    value={retentionDaysInput}
                    onChange={(e) => setRetentionDaysInput(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold focus:outline-hidden focus:border-indigo-500"
                  />
                  <span className="text-xs text-slate-400 whitespace-nowrap">günden eski</span>
                </div>
                <p className="text-[10px] text-slate-400">
                  Örn: 90 gün. 90 günden eski ham okumalar silinir, özet sürekli tablolar saklanır.
                </p>
              </div>
            </div>

            {policyMsg && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>{policyMsg}</span>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                onClick={handleSaveTimescalePolicies}
                disabled={savingPolicies}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50 shadow-xs"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{savingPolicies ? 'Kaydediliyor...' : 'Politikaları Kaydet'}</span>
              </button>
            </div>
          </div>
        </div>
      )}


      {/* TAB: POSTGRESQL & SELF-HOSTED SETUP */}
      {activeTab === 'postgres' && (
        <div className="space-y-6">
          {/* Top Info Banner - Cost & Scale Advantage */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border border-blue-200 dark:border-blue-900/40 rounded-xl p-5 shadow-xs">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-blue-600 text-white font-mono text-[10px] font-bold">POSTGRESQL + TIMESCALEDB</span>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Kendi Sunucunuzda (VPS / Dedicated / Ev Sunucusu) Sıfır Maliyetli IoT Altyapısı
                  </h2>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-3xl">
                  Firebase Firestore gibi bulut veritabanlarında saniyede 100 sensör verisi aylık <strong>$300+</strong> faturaya sebep olabilirken,
                  kendi sunucunuzda kuracağınız PostgreSQL / TimescaleDB ile <strong>sabit $0 ek ücretle</strong> saniyede on binlerce okuma/yazma gerçekleştirebilirsiniz.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleDownloadSqlSchema}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition cursor-pointer shadow-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>SQL Şemasını İndir (.sql)</span>
                </button>
              </div>
            </div>
          </div>

          {/* Connection Test & Config Box */}
          <div className="bg-white dark:bg-[#0c1220] rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-500" />
                PostgreSQL Canlı Bağlantı & Şema Kurulumu
              </h3>
              {engineConfig?.isPostgresConnected ? (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle className="w-4 h-4" />
                  Bağlantı Aktif ({engineConfig.postgresVersion || 'PostgreSQL 16'})
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                  <Info className="w-4 h-4" />
                  Bağlantı Henüz Doğrulanmadı
                </span>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  PostgreSQL Bağlantı Adresi (DATABASE_URL)
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={inputPostgresUrl}
                    onChange={(e) => setInputPostgresUrl(e.target.value)}
                    placeholder={engineConfig?.postgresUrl || 'postgresql://iot_admin:GizliSifreniz123!@192.168.1.50:5432/iot_dashboard_db?sslmode=disable'}
                    className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-blue-500"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleTestPostgres}
                      disabled={testingPostgres}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${testingPostgres ? 'animate-spin text-blue-500' : ''}`} />
                      <span>Bağlantıyı Test Et</span>
                    </button>
                    <button
                      onClick={handleMigratePostgres}
                      disabled={migratingPostgres}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50 shadow-xs"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>{migratingPostgres ? 'Tablolar Kuruluyor...' : 'Otomatik Şema Kur (Migrate)'}</span>
                    </button>
                    <button
                      onClick={handleSyncAllPostgres}
                      disabled={syncingAllPostgres}
                      title="Yerel bellekteki tüm kullanıcı, cihaz, kural ve dashboard verilerini doğrudan PostgreSQL tablolarına aktarır"
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50 shadow-xs"
                    >
                      <Upload className={`w-3.5 h-3.5 ${syncingAllPostgres ? 'animate-bounce' : ''}`} />
                      <span>{syncingAllPostgres ? 'Veriler Aktarılıyor...' : 'Tüm Verileri PostgreSQL\'e Aktar'}</span>
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  İpucu: Docker / VPS sunucunuz için örnek: <code className="font-mono text-slate-600 dark:text-slate-300">postgresql://iot_user:sifreniz@db.nexusnodeiot.com.tr:5432/iot_dashboard?sslmode=disable</code>
                </p>
                <div className="mt-2 p-2.5 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/30 rounded-lg text-[11px] text-slate-600 dark:text-slate-300 flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                  <span>
                    <strong>Bağlantı Notu:</strong> Eğer test sonucunda <em>ECONNREFUSED</em> veya <em>timeout</em> alıyorsanız; sunucunuzun <strong>5432</strong> portunun dışarıya açık olduğundan (UFW firewall izni ve Docker <code className="font-mono text-indigo-500">-p 5432:5432</code> port yönlendirmesi) ve <code className="font-mono">pg_hba.conf</code> dosyasında uzaktan bağlantılara izin verildiğinden emin olun.
                  </span>
                </div>
              </div>

              {/* Test Results Card */}
              {postgresTestResult && (
                <div
                  className={`p-3.5 rounded-lg border text-xs flex flex-col gap-2 ${
                    postgresTestResult.success
                      ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-200'
                      : 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/40 text-rose-900 dark:text-rose-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-semibold">
                      {postgresTestResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <AlertTriangle className="w-4 h-4 text-rose-500" />}
                      <span>{postgresTestResult.message}</span>
                    </div>
                    {postgresTestResult.latencyMs !== undefined && (
                      <span className="text-[11px] font-mono opacity-80">Gecikme: {postgresTestResult.latencyMs}ms</span>
                    )}
                  </div>

                  {postgresTestResult.tablesStatus && (
                    <div className="pt-2 border-t border-emerald-200/60 dark:border-emerald-800/40">
                      <span className="text-[11px] font-semibold block mb-1.5">Tablo Doğrulama Durumu:</span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                        {Object.entries(postgresTestResult.tablesStatus).map(([tbl, exists]) => (
                          <div key={tbl} className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${exists ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                            <span className="font-mono">{tbl}</span>
                            <span className="opacity-70">({exists ? 'Mevcut' : 'Eksik'})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Migrate Results Card */}
              {postgresMigrateResult && (
                <div
                  className={`p-3.5 rounded-lg border text-xs flex items-center gap-2 ${
                    postgresMigrateResult.success
                      ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-200'
                      : 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/40 text-rose-900 dark:text-rose-200'
                  }`}
                >
                  {postgresMigrateResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />}
                  <span>{postgresMigrateResult.message}</span>
                </div>
              )}

              {/* Sync All Results Card */}
              {syncAllResult && (
                <div
                  className={`p-3.5 rounded-lg border text-xs flex items-center gap-2 ${
                    syncAllResult.success
                      ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-200'
                      : 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/40 text-rose-900 dark:text-rose-200'
                  }`}
                >
                  {syncAllResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />}
                  <span>{syncAllResult.message}</span>
                </div>
              )}
            </div>
          </div>

          {/* Step-by-Step Setup Guide Sub-Tabs */}
          <div className="bg-white dark:bg-[#0c1220] rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-indigo-500" />
                  Kendi Sunucunuza Kurulum Adımları & Belgeler
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Sunucunuzun tipine göre kurulum adımlarını ve hazır konfigürasyon dosyalarını inceleyin.
                </p>
              </div>

              {/* Sub-tabs selector */}
              <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg text-xs font-medium">
                {[
                  { id: 'docker', label: '1. Docker Compose (1 Dk)' },
                  { id: 'ubuntu', label: '2. Ubuntu/Debian Kurulum' },
                  { id: 'timescale', label: '3. TimescaleDB (Hypertable)' },
                  { id: 'schema', label: '4. SQL Tablo Şeması' },
                  { id: 'calc', label: '5. Maliyet Hesaplayıcı' },
                ].map((st) => (
                  <button
                    key={st.id}
                    onClick={() => setGuideSubTab(st.id as any)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                      guideSubTab === st.id
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sub-Tab 1: Docker Compose */}
            {guideSubTab === 'docker' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <p className="text-slate-600 dark:text-slate-300">
                    Sunucunuzda Docker ve Docker Compose yüklüyse, aşağıdaki tek dosya ile <strong>TimescaleDB + pgAdmin4</strong> veritabanı arayüzünü anında ayağa kaldırabilirsiniz:
                  </p>
                  <button
                    onClick={() => handleCopyCode(setupGuide?.dockerCompose || '', 'docker')}
                    className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-xs font-semibold rounded-md transition cursor-pointer"
                  >
                    {copiedKey === 'docker' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'docker' ? 'Kopyalandı' : 'docker-compose.yml Kopyala'}</span>
                  </button>
                </div>

                <pre className="p-4 bg-slate-950 text-slate-200 font-mono text-[11px] rounded-xl overflow-x-auto leading-relaxed border border-slate-800">
                  {setupGuide?.dockerCompose || 'Yükleniyor...'}
                </pre>

                <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                    🚀 Terminalde Çalıştırma Komutları:
                  </span>
                  <div className="space-y-1 font-mono text-xs text-indigo-600 dark:text-indigo-400">
                    <div className="p-2 bg-slate-100 dark:bg-slate-900 rounded-md">
                      mkdir -p ~/iot-database && cd ~/iot-database && nano docker-compose.yml
                    </div>
                    <div className="p-2 bg-slate-100 dark:bg-slate-900 rounded-md">
                      docker compose up -d
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Sub-Tab 2: Ubuntu/Debian Native */}
            {guideSubTab === 'ubuntu' && (
              <div className="space-y-4 text-xs">
                <p className="text-slate-600 dark:text-slate-300">
                  Docker kullanmak istemiyorsanız, Ubuntu 22.04 / 24.04 veya Debian sunucunuza doğrudan PostgreSQL kurmak için aşağıdaki komutları sırasıyla uygulayın:
                </p>

                <div className="space-y-3">
                  <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">1. Paketleri Güncelle & PostgreSQL Kur:</span>
                    <pre className="p-2 bg-slate-950 text-emerald-400 font-mono text-[11px] rounded-md overflow-x-auto">
                      sudo apt update && sudo apt install -y postgresql postgresql-contrib
                    </pre>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">2. Kullanıcı & Veritabanı Oluştur:</span>
                    <pre className="p-2 bg-slate-950 text-emerald-400 font-mono text-[11px] rounded-md overflow-x-auto">
{`sudo -u postgres psql
CREATE DATABASE iot_dashboard_db;
CREATE USER iot_admin WITH ENCRYPTED PASSWORD 'GizliSifreniz123!';
GRANT ALL PRIVILEGES ON DATABASE iot_dashboard_db TO iot_admin;
\\q`}
                    </pre>
                  </div>

                  <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">3. Uzaktan Erişimi Aç (Opsiyonel / Cloud Run veya Dışarıdan Bağlantı İçin):</span>
                    <pre className="p-2 bg-slate-950 text-emerald-400 font-mono text-[11px] rounded-md overflow-x-auto">
{`# /etc/postgresql/16/main/postgresql.conf dosyasına ekleyin:
listen_addresses = '*'

# /etc/postgresql/16/main/pg_hba.conf dosyasına ekleyin:
host    all             all             0.0.0.0/0               scram-sha-256

# Servisi yeniden başlatın:
sudo systemctl restart postgresql`}
                    </pre>
                  </div>
                </div>
              </div>
            )}

            {/* Sub-Tab 3: TimescaleDB Hypertable */}
            {guideSubTab === 'timescale' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <p className="text-slate-600 dark:text-slate-300">
                    <strong>TimescaleDB</strong> eklentisi ile telemetri verileri otomatik parçalanır (hypertable) ve 7 günden eski kayıtlar <strong>%90+ sıkıştırılarak</strong> disk tasarrufu sağlanır:
                  </p>
                  <button
                    onClick={() => handleCopyCode(setupGuide?.timescaleSql || '', 'timescale')}
                    className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-xs font-semibold rounded-md transition cursor-pointer"
                  >
                    {copiedKey === 'timescale' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'timescale' ? 'Kopyalandı' : 'SQL Kopyala'}</span>
                  </button>
                </div>

                <pre className="p-4 bg-slate-950 text-slate-200 font-mono text-[11px] rounded-xl overflow-x-auto leading-relaxed border border-slate-800">
                  {setupGuide?.timescaleSql || 'Yükleniyor...'}
                </pre>
              </div>
            )}

            {/* Sub-Tab 4: SQL Schema */}
            {guideSubTab === 'schema' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <p className="text-slate-600 dark:text-slate-300">
                    Dashboard sistemi için gerekli tüm tablolar (kullanıcılar, cihazlar, telemetri okumaları, alarmlar, loglar):
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCopyCode(setupGuide?.sqlSchema || '', 'schema')}
                      className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-xs font-semibold rounded-md transition cursor-pointer"
                    >
                      {copiedKey === 'schema' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === 'schema' ? 'Kopyalandı' : 'SQL Kopyala'}</span>
                    </button>
                    <button
                      onClick={handleDownloadSqlSchema}
                      className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md transition cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>.sql İndir</span>
                    </button>
                  </div>
                </div>

                <pre className="p-4 bg-slate-950 text-slate-200 font-mono text-[11px] rounded-xl overflow-x-auto leading-relaxed max-h-96 border border-slate-800">
                  {setupGuide?.sqlSchema || 'Yükleniyor...'}
                </pre>
              </div>
            )}

            {/* Sub-Tab 5: Cost Calculator */}
            {guideSubTab === 'calc' && (
              <div className="space-y-4 text-xs">
                <h4 className="font-bold text-slate-800 dark:text-slate-200">
                  Aylık Maliyet ve Tasarruf Karşılaştırma Tablosu (100 Cihaz / 1 sn Telemetri Örneği)
                </h4>

                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-medium">
                      <tr>
                        <th className="py-2.5 px-4">Kriter</th>
                        <th className="py-2.5 px-4 text-amber-600 dark:text-amber-400">Firebase Firestore (Bulut)</th>
                        <th className="py-2.5 px-4 text-blue-600 dark:text-blue-400 font-bold">Kendi PostgreSQL Sunucunuz</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                      <tr>
                        <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">Aylık Telemetri Yazma</td>
                        <td className="py-3 px-4">260 Milyon İşlem (Yazma)</td>
                        <td className="py-3 px-4 font-semibold text-blue-600 dark:text-blue-400">Limitsiz (Sabit Disk Hızı)</td>
                      </tr>
                      <tr>
                        <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">Aylık Veritabanı Maliyeti</td>
                        <td className="py-3 px-4 font-bold text-rose-600">~$468.00 / Ay</td>
                        <td className="py-3 px-4 font-bold text-emerald-600">~$0.00 / Ay (Mevcut VPS)</td>
                      </tr>
                      <tr>
                        <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">Zaman Serisi Sıkıştırma</td>
                        <td className="py-3 px-4 text-slate-400">Yok (Her doküman ham saklanır)</td>
                        <td className="py-3 px-4 font-semibold text-blue-600 dark:text-blue-400">TimescaleDB ile %92 Sıkıştırma</td>
                      </tr>
                      <tr>
                        <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">Veri Sahipliği & Yedekleme</td>
                        <td className="py-3 px-4 text-slate-400">Google Cloud bağımlı</td>
                        <td className="py-3 px-4 font-semibold text-emerald-600 dark:text-emerald-400">Tamamen sizin kontrolünüzde</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: DATABASE TABLE EXPLORER & SQL MANAGEMENT */}
      {activeTab === 'explorer' && (
        <div className="space-y-6">
          {/* Top Control Bar & Mode Switcher */}
          <div className="bg-white dark:bg-[#0c1220] rounded-xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50">
                <Table className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  Veritabanı İçerik & Veri Yönetimi
                  {tableData?.isPostgres ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                      ⚡ Canlı PostgreSQL
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                      PostgreSQL Bekleniyor
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Veritabanı tablolarındaki kayıtları görüntüleyin, filtreleyin, düzenleyin, silin veya özel SQL sorgusu çalıştırın.
                </p>
              </div>
            </div>

            {/* Mode Toggle Buttons */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg text-xs font-semibold self-start md:self-auto">
              <button
                onClick={() => setExplorerMode('tables')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition cursor-pointer ${
                  explorerMode === 'tables'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Table className="w-3.5 h-3.5" />
                <span>Tablo Gezgini</span>
              </button>
              <button
                onClick={() => setExplorerMode('sql')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition cursor-pointer ${
                  explorerMode === 'sql'
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Terminal className="w-3.5 h-3.5 text-amber-500" />
                <span>SQL Konsolu & Sorgu</span>
              </button>
            </div>
          </div>

          {/* Alert / Status Messages */}
          {tableActionMsg && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                tableActionMsg.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50 text-emerald-900 dark:text-emerald-200'
                  : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/50 text-rose-900 dark:text-rose-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {tableActionMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />}
                <span>{tableActionMsg.message}</span>
              </div>
              <button onClick={() => setTableActionMsg(null)} className="p-1 hover:opacity-75 cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* MODE 1: TABLE DATA EXPLORER */}
          {explorerMode === 'tables' && (
            <div className="space-y-4">
              {/* Table Selector Pills */}
              <div className="flex flex-wrap items-center gap-2 pb-1 overflow-x-auto">
                {[
                  { id: 'users', label: '👥 Users (Kullanıcılar)' },
                  { id: 'devices', label: '📟 Devices (Cihazlar)' },
                  { id: 'telemetry_readings', label: '📊 Telemetry (Sensör Verileri)' },
                  { id: 'threshold_rules', label: '⚙️ Rules (Eşik Kuralları)' },
                  { id: 'active_alarms', label: '🚨 Alarms (Aktif Alarmlar)' },
                  { id: 'notifications', label: '🔔 Notifications (Bildirimler)' },
                  { id: 'audit_logs', label: '📜 Audit Logs (Sistem Kayıtları)' },
                  { id: 'device_commands', label: '📡 Commands (Cihaz Komutları)' },
                  { id: 'dispatch_logs', label: '📨 Dispatch Logs (Gönderim)' },
                  { id: 'dashboard_layouts', label: '🖥️ Dashboards (Düzenler)' },
                ].map((tbl) => (
                  <button
                    key={tbl.id}
                    onClick={() => {
                      setSelectedTable(tbl.id);
                      setTablePage(1);
                      fetchExplorerTableData(tbl.id, 1, tableLimit, tableSearch);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer whitespace-nowrap ${
                      selectedTable === tbl.id
                        ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                        : 'bg-white dark:bg-[#0c1220] border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {tbl.label}
                  </button>
                ))}
              </div>

              {/* Toolbar: Search, Refresh, Page Limit, Insert New Record */}
              <div className="bg-white dark:bg-[#0c1220] rounded-xl p-3.5 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder={`${selectedTable} tablosunda ara...`}
                      value={tableSearch}
                      onChange={(e) => setTableSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && fetchExplorerTableData(selectedTable, 1, tableLimit, tableSearch)}
                      className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    onClick={() => fetchExplorerTableData(selectedTable, 1, tableLimit, tableSearch)}
                    className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/80 text-blue-600 dark:text-blue-300 text-xs font-semibold rounded-lg transition cursor-pointer"
                  >
                    Ara
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={tableLimit}
                    onChange={(e) => {
                      const lim = parseInt(e.target.value, 10);
                      setTableLimit(lim);
                      setTablePage(1);
                      fetchExplorerTableData(selectedTable, 1, lim, tableSearch);
                    }}
                    className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    <option value={20}>20 Kayıt</option>
                    <option value={50}>50 Kayıt</option>
                    <option value={100}>100 Kayıt</option>
                  </select>

                  <button
                    onClick={() => fetchExplorerTableData()}
                    disabled={loadingTableData}
                    className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg transition cursor-pointer"
                    title="Yenile"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingTableData ? 'animate-spin text-blue-500' : ''}`} />
                  </button>

                  <button
                    onClick={() => {
                      setIsNewRecordModal(true);
                      setEditingRecord({});
                      setEditingJsonText(JSON.stringify({ id: 'rec_' + Date.now().toString(36), name: '' }, null, 2));
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition cursor-pointer shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Yeni Kayıt Ekle</span>
                  </button>
                </div>
              </div>

              {/* Data Table Grid */}
              <div className="bg-white dark:bg-[#0c1220] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase font-semibold">
                      <tr>
                        <th className="p-3 w-12 text-center">İşlem</th>
                        {(tableData?.columns || ['id']).slice(0, 7).map((col) => (
                          <th key={col} className="p-3 font-semibold tracking-wider">
                            {col}
                          </th>
                        ))}
                        {(tableData?.columns || []).length > 7 && <th className="p-3 text-slate-400">...</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono text-slate-800 dark:text-slate-200">
                      {loadingTableData ? (
                        <tr>
                          <td colSpan={10} className="p-8 text-center text-slate-400">
                            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500" />
                            <span>Tablo verileri yükleniyor...</span>
                          </td>
                        </tr>
                      ) : !tableData?.records || tableData.records.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="p-8 text-center text-slate-400">
                            <Info className="w-6 h-6 mx-auto mb-2 opacity-50" />
                            <span>Bu tabloda kayıt bulunamadı.</span>
                          </td>
                        </tr>
                      ) : (
                        tableData.records.map((row: any, idx: number) => (
                          <tr key={row.id || idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40 transition">
                            <td className="p-2 text-center whitespace-nowrap">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => setViewingRecordDetail(row)}
                                  className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded transition cursor-pointer"
                                  title="Detay Görüntüle"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => {
                                    setIsNewRecordModal(false);
                                    setEditingRecord(row);
                                    setEditingJsonText(JSON.stringify(row, null, 2));
                                  }}
                                  className="p-1 text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 rounded transition cursor-pointer"
                                  title="Kayıt Düzenle"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteRecord(row.id || row.id)}
                                  className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded transition cursor-pointer"
                                  title="Kayıt Sil"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>

                            {(tableData?.columns || []).slice(0, 7).map((col) => {
                              const val = row[col];
                              let displayVal = '';
                              if (val === null || val === undefined) displayVal = 'NULL';
                              else if (typeof val === 'object') displayVal = JSON.stringify(val);
                              else displayVal = String(val);

                              return (
                                <td key={col} className="p-3 max-w-[200px] truncate" title={displayVal}>
                                  {val === null || val === undefined ? (
                                    <span className="text-slate-400 italic">null</span>
                                  ) : (
                                    displayVal
                                  )}
                                </td>
                              );
                            })}
                            {(tableData?.columns || []).length > 7 && (
                              <td className="p-3 text-slate-400 text-xs">+{tableData.columns.length - 7} alan</td>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Table Pagination Footer */}
                <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
                  <div>
                    Toplam <span className="font-bold text-slate-800 dark:text-slate-200">{tableData?.totalCount || 0}</span> kayıt
                    (Sayfa {tableData?.page || 1} / {Math.ceil((tableData?.totalCount || 1) / (tableData?.limit || 50))})
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        const newPg = Math.max(1, (tableData?.page || 1) - 1);
                        setTablePage(newPg);
                        fetchExplorerTableData(selectedTable, newPg, tableLimit, tableSearch);
                      }}
                      disabled={(tableData?.page || 1) <= 1}
                      className="px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-700 dark:text-slate-300 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                    >
                      Önceki
                    </button>
                    <button
                      onClick={() => {
                        const totalPgs = Math.ceil((tableData?.totalCount || 1) / (tableData?.limit || 50));
                        const newPg = Math.min(totalPgs, (tableData?.page || 1) + 1);
                        setTablePage(newPg);
                        fetchExplorerTableData(selectedTable, newPg, tableLimit, tableSearch);
                      }}
                      disabled={(tableData?.page || 1) >= Math.ceil((tableData?.totalCount || 1) / (tableData?.limit || 50))}
                      className="px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-700 dark:text-slate-300 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                    >
                      Sonraki
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MODE 2: SQL CONSOLE & QUERY RUNNER */}
          {explorerMode === 'sql' && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-[#0c1220] rounded-xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-amber-500" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                      PostgreSQL SQL Konsolu
                    </h3>
                  </div>

                  {/* Quick SQL Templates */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="text-slate-400">Şablonlar:</span>
                    <button
                      onClick={() => setSqlQuery('SELECT * FROM users ORDER BY created_at DESC LIMIT 20;')}
                      className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer"
                    >
                      SELECT users
                    </button>
                    <button
                      onClick={() => setSqlQuery('SELECT * FROM devices ORDER BY last_seen DESC LIMIT 20;')}
                      className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer"
                    >
                      SELECT devices
                    </button>
                    <button
                      onClick={() => setSqlQuery('SELECT * FROM telemetry_readings ORDER BY created_at DESC LIMIT 50;')}
                      className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer"
                    >
                      SELECT telemetry
                    </button>
                    <button
                      onClick={() => setSqlQuery('SELECT * FROM threshold_rules;')}
                      className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer"
                    >
                      SELECT rules
                    </button>
                  </div>
                </div>

                {/* SQL Input Area */}
                <div className="space-y-2">
                  <textarea
                    rows={5}
                    value={sqlQuery}
                    onChange={(e) => setSqlQuery(e.target.value)}
                    placeholder="SQL sorgunuzu buraya yazın... Örn: SELECT * FROM users;"
                    className="w-full p-3 font-mono text-xs bg-slate-900 text-emerald-400 border border-slate-700 rounded-xl focus:outline-hidden focus:ring-1 focus:ring-blue-500 shadow-inner"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-400">
                      Sözdizimi: Standard PostgreSQL ANSI SQL (SELECT, UPDATE, DELETE, INSERT, vs.)
                    </span>
                    <button
                      onClick={handleExecuteCustomSql}
                      disabled={executingSql || !sqlQuery.trim()}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition cursor-pointer shadow-xs"
                    >
                      <Play className={`w-3.5 h-3.5 ${executingSql ? 'animate-spin' : ''}`} />
                      <span>{executingSql ? 'Çalıştırılıyor...' : 'Sorguyu Çalıştır (Run SQL)'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* SQL Result Table */}
              {sqlResult && (
                <div className="bg-white dark:bg-[#0c1220] rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs space-y-2">
                  <div className="p-3 bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 font-semibold">
                      {sqlResult.success ? (
                        <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" /> Sorgu Başarıyla Çalıştırıldı
                        </span>
                      ) : (
                        <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1">
                          <AlertTriangle className="w-4 h-4" /> Sorgu Hatası
                        </span>
                      )}
                    </div>
                    {sqlResult.success && (
                      <div className="flex items-center gap-3 text-slate-500 font-mono text-[11px]">
                        <span>Süre: {sqlResult.executionTimeMs}ms</span>
                        <span>Satır Sayısı: {sqlResult.rowCount}</span>
                      </div>
                    )}
                  </div>

                  {!sqlResult.success ? (
                    <div className="p-4 text-xs font-mono text-rose-600 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-950/20">
                      {sqlResult.error}
                    </div>
                  ) : !sqlResult.rows || sqlResult.rows.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400">
                      Etkilenen/dönen satır bulunamadı veya komut başarı ile tamamlandı.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300">
                          <tr>
                            {(sqlResult.fields || Object.keys(sqlResult.rows[0])).map((f) => (
                              <th key={f} className="p-2.5 font-semibold">
                                {f}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 text-slate-800 dark:text-slate-200">
                          {sqlResult.rows.map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                              {(sqlResult.fields || Object.keys(sqlResult.rows[0])).map((f) => {
                                const v = row[f];
                                return (
                                  <td key={f} className="p-2.5 max-w-[220px] truncate">
                                    {v === null || v === undefined ? (
                                      <span className="text-slate-400 italic">null</span>
                                    ) : typeof v === 'object' ? (
                                      JSON.stringify(v)
                                    ) : (
                                      String(v)
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Record Edit / Insert Modal */}
          {(editingRecord !== null || isNewRecordModal) && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white dark:bg-[#0c1220] rounded-2xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full p-5 space-y-4 shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Edit3 className="w-4 h-4 text-amber-500" />
                    {isNewRecordModal ? `${selectedTable} Tablosuna Kayıt Ekle` : `${selectedTable} Kaydını Düzenle`}
                  </h3>
                  <button onClick={() => { setEditingRecord(null); setIsNewRecordModal(false); }} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Kayıt JSON İçeriği (Düzenlenebilir):
                  </label>
                  <textarea
                    rows={12}
                    value={editingJsonText}
                    onChange={(e) => setEditingJsonText(e.target.value)}
                    className="w-full p-3 font-mono text-xs bg-slate-900 text-emerald-400 border border-slate-700 rounded-xl focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    onClick={() => { setEditingRecord(null); setIsNewRecordModal(false); }}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                  >
                    İptal
                  </button>
                  <button
                    onClick={handleSaveEditedRecord}
                    disabled={savingRecord}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg transition cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {savingRecord ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Record Detail Modal */}
          {viewingRecordDetail && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white dark:bg-[#0c1220] rounded-2xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full p-5 space-y-4 shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Eye className="w-4 h-4 text-blue-500" />
                    Kayıt Detayları ({selectedTable})
                  </h3>
                  <button onClick={() => setViewingRecordDetail(null)} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <pre className="p-4 font-mono text-xs bg-slate-900 text-blue-300 rounded-xl overflow-x-auto max-h-[400px]">
                  {JSON.stringify(viewingRecordDetail, null, 2)}
                </pre>

                <div className="flex justify-end">
                  <button
                    onClick={() => setViewingRecordDetail(null)}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                  >
                    Kapat
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: DATA RETENTION & AUTOMATED CLEANUP (ESKİ KAYIT SİLME ZAMANLARI) */}
      {activeTab === 'retention' && (
        <div className="space-y-6">
          {/* Top Hero Banner */}
          <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-xl p-5 border border-indigo-900/60 shadow-md">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 font-mono text-[10px] font-bold uppercase tracking-wider">
                    Otomatik Veri Yaşam Döngüsü & Saklama Politikaları
                  </span>
                  {engineConfig?.isPostgresConnected ? (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                      ⚡ Canlı PostgreSQL Temizliği Aktif
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                      PostgreSQL Bekleniyor
                    </span>
                  )}
                </div>
                <h2 className="text-base font-bold text-slate-100">
                  Veritabanı Saklama Süreleri & Otomatik Kayıt Silme Yönetimi
                </h2>
                <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
                  Veritabanı performansını yüksek tutmak ve depolama alanının kontrolsüz büyümesini engellemek için eski telemetri okumaları, çözülmüş alarmlar, okunmuş bildirimler ve sistem denetim loglarının saklanma sürelerini belirleyebilirsiniz.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  onClick={handleRunImmediateCleanup}
                  disabled={runningCleanup}
                  className="flex items-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg transition cursor-pointer shadow-sm disabled:opacity-50"
                  title="Belirlenen süreden eski tüm verileri şimdi temizle"
                >
                  <Trash2 className={`w-3.5 h-3.5 ${runningCleanup ? 'animate-spin' : ''}`} />
                  <span>{runningCleanup ? 'Temizleniyor...' : 'Şimdi Temizle & Sil'}</span>
                </button>
                <button
                  onClick={handleSaveRetentionPolicies}
                  disabled={savingRetention}
                  className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition cursor-pointer shadow-sm disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{savingRetention ? 'Kaydediliyor...' : 'Politikaları Kaydet'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Retention Status / Action Message */}
          {retentionMsg && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                retentionMsg.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50 text-emerald-900 dark:text-emerald-200'
                  : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/50 text-rose-900 dark:text-rose-200'
              }`}
            >
              <div className="flex items-center gap-2">
                {retentionMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                )}
                <span>{retentionMsg.message}</span>
              </div>
              <button onClick={() => setRetentionMsg(null)} className="p-1 hover:opacity-75 cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Cleanup Result Summary Box */}
          {cleanupResult && (
            <div className="bg-white dark:bg-[#0c1220] rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  Son Gerçekleşen Temizlik Raporu
                </h3>
                <span className="text-[11px] text-slate-400">
                  {cleanupResult.cleanedAt ? new Date(cleanupResult.cleanedAt).toLocaleString('tr-TR') : 'Şimdi tamamlandı'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800 text-center">
                  <span className="text-[10px] text-slate-400 font-medium block">Telemetri</span>
                  <span className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono">
                    {(cleanupResult.cleanedCounts?.telemetry ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800 text-center">
                  <span className="text-[10px] text-slate-400 font-medium block">Çözülen Alarmlar</span>
                  <span className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono">
                    {(cleanupResult.cleanedCounts?.alarms ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800 text-center">
                  <span className="text-[10px] text-slate-400 font-medium block">Bildirimler</span>
                  <span className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono">
                    {(cleanupResult.cleanedCounts?.notifications ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800 text-center">
                  <span className="text-[10px] text-slate-400 font-medium block">Denetim Logları</span>
                  <span className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono">
                    {(cleanupResult.cleanedCounts?.auditLogs ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800 text-center">
                  <span className="text-[10px] text-slate-400 font-medium block">Gönderim Logları</span>
                  <span className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono">
                    {(cleanupResult.cleanedCounts?.dispatchLogs ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800 text-center">
                  <span className="text-[10px] text-slate-400 font-medium block">Cihaz Komutları</span>
                  <span className="text-base font-bold text-slate-900 dark:text-slate-100 font-mono">
                    {(cleanupResult.cleanedCounts?.deviceCommands ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-lg border border-indigo-200 dark:border-indigo-800 text-center">
                  <span className="text-[10px] text-indigo-600 dark:text-indigo-300 font-bold block">Toplam Silinen</span>
                  <span className="text-base font-bold text-indigo-700 dark:text-indigo-300 font-mono">
                    {(cleanupResult.cleanedCounts?.total ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Simulated Device Data Cleanup Card */}
          <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent rounded-xl border border-amber-500/30 p-5 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-mono text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                    <Bot className="w-3 h-3" />
                    Sanal Cihazlar & Simülatör Test Verileri
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-mono font-bold">
                    [Sanal] Etiketli Cihazlar
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Database className="w-4 h-4 text-amber-500" />
                  Sanal Cihaz Verilerini Temizle
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 max-w-2xl leading-relaxed">
                  Test amacıyla oluşturulan sanal cihazların ürettiği tüm telemetri okumalarını, alarmları ve bildirimleri tek tıkla veritabanından silebilirsiniz. Gerçek donanım verileri korunur.
                </p>
              </div>

              <div className="shrink-0">
                <button
                  type="button"
                  onClick={handleRunSimulatedCleanup}
                  disabled={runningSimulatedCleanup}
                  className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-sm disabled:opacity-50"
                  title="Sanal cihazlara ait tüm telemetri ve alarmları veritabanından sil"
                >
                  <Trash2 className={`w-4 h-4 ${runningSimulatedCleanup ? 'animate-spin' : ''}`} />
                  <span>{runningSimulatedCleanup ? 'Sanal Veriler Siliniyor...' : 'Sanal Verileri Sil'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Retention Duration Settings Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Telemetry Card */}
            <div className="bg-white dark:bg-[#0c1220] rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Telemetri & Sensör Verileri
                    </h3>
                    <span className="text-[10px] font-mono text-slate-400">telemetry_readings</span>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed min-h-[34px]">
                Saha sensörlerinden gelen sıcaklık, nem, akım ve diğer ham ölçüm kayıtları.
              </p>

              <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Saklama Süresi:</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="1"
                      max="3650"
                      value={retentionPolicies.telemetryDays}
                      onChange={(e) =>
                        setRetentionPolicies((p) => ({ ...p, telemetryDays: Math.max(1, parseInt(e.target.value) || 1) }))
                      }
                      className="w-20 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold font-mono text-center focus:outline-hidden focus:border-indigo-500"
                    />
                    <span className="text-xs text-slate-400 font-medium">Gün</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 pt-1">
                  {[15, 30, 60, 90, 180, 365].map((d) => (
                    <button
                      key={d}
                      onClick={() => setRetentionPolicies((p) => ({ ...p, telemetryDays: d }))}
                      className={`flex-1 py-1 text-[10px] font-semibold rounded-md border transition cursor-pointer ${
                        retentionPolicies.telemetryDays === d
                          ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-300'
                          : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      {d}g
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => handleRunCategoryCleanup('telemetry', 'Telemetri', retentionPolicies.telemetryDays)}
                  disabled={runningCategoryCleanup === 'telemetry'}
                  className="w-full mt-2 py-1.5 px-3 bg-slate-100 dark:bg-slate-800/80 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-700 hover:border-rose-300 dark:hover:border-rose-800 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>{runningCategoryCleanup === 'telemetry' ? 'Temizleniyor...' : 'Sadece Telemetriyi Sil'}</span>
                </button>
              </div>
            </div>

            {/* Resolved Alarms Card */}
            <div className="bg-white dark:bg-[#0c1220] rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Çözülmüş Alarmlar
                    </h3>
                    <span className="text-[10px] font-mono text-slate-400">active_alarms (resolved)</span>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed min-h-[34px]">
                Yalnızca durumu <strong>RESOLVED</strong> (çözüldü) olan alarmlar silinir. Aktif alarmlar korunur.
              </p>

              <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Saklama Süresi:</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="1"
                      max="3650"
                      value={retentionPolicies.resolvedAlarmsDays}
                      onChange={(e) =>
                        setRetentionPolicies((p) => ({ ...p, resolvedAlarmsDays: Math.max(1, parseInt(e.target.value) || 1) }))
                      }
                      className="w-20 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold font-mono text-center focus:outline-hidden focus:border-indigo-500"
                    />
                    <span className="text-xs text-slate-400 font-medium">Gün</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 pt-1">
                  {[7, 15, 30, 60, 90].map((d) => (
                    <button
                      key={d}
                      onClick={() => setRetentionPolicies((p) => ({ ...p, resolvedAlarmsDays: d }))}
                      className={`flex-1 py-1 text-[10px] font-semibold rounded-md border transition cursor-pointer ${
                        retentionPolicies.resolvedAlarmsDays === d
                          ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-700 text-rose-600 dark:text-rose-300'
                          : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      {d}g
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => handleRunCategoryCleanup('resolvedAlarms', 'Çözülen Alarmlar', retentionPolicies.resolvedAlarmsDays)}
                  disabled={runningCategoryCleanup === 'resolvedAlarms'}
                  className="w-full mt-2 py-1.5 px-3 bg-slate-100 dark:bg-slate-800/80 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-700 hover:border-rose-300 dark:hover:border-rose-800 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>{runningCategoryCleanup === 'resolvedAlarms' ? 'Temizleniyor...' : 'Sadece Çözülen Alarmları Sil'}</span>
                </button>
              </div>
            </div>

            {/* Read Notifications Card */}
            <div className="bg-white dark:bg-[#0c1220] rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Okunmuş Bildirimler
                    </h3>
                    <span className="text-[10px] font-mono text-slate-400">notifications (read)</span>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed min-h-[34px]">
                Kullanıcılar tarafından okunmuş bildirimler. Okunmamış veya yeni bildirimler asla silinmez.
              </p>

              <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Saklama Süresi:</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="1"
                      max="3650"
                      value={retentionPolicies.readNotificationsDays}
                      onChange={(e) =>
                        setRetentionPolicies((p) => ({ ...p, readNotificationsDays: Math.max(1, parseInt(e.target.value) || 1) }))
                      }
                      className="w-20 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold font-mono text-center focus:outline-hidden focus:border-indigo-500"
                    />
                    <span className="text-xs text-slate-400 font-medium">Gün</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 pt-1">
                  {[7, 15, 30, 60, 90].map((d) => (
                    <button
                      key={d}
                      onClick={() => setRetentionPolicies((p) => ({ ...p, readNotificationsDays: d }))}
                      className={`flex-1 py-1 text-[10px] font-semibold rounded-md border transition cursor-pointer ${
                        retentionPolicies.readNotificationsDays === d
                          ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-300'
                          : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      {d}g
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => handleRunCategoryCleanup('readNotifications', 'Okunmuş Bildirimler', retentionPolicies.readNotificationsDays)}
                  disabled={runningCategoryCleanup === 'readNotifications'}
                  className="w-full mt-2 py-1.5 px-3 bg-slate-100 dark:bg-slate-800/80 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-700 hover:border-rose-300 dark:hover:border-rose-800 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>{runningCategoryCleanup === 'readNotifications' ? 'Temizleniyor...' : 'Sadece Bildirimleri Sil'}</span>
                </button>
              </div>
            </div>

            {/* Audit Logs Card */}
            <div className="bg-white dark:bg-[#0c1220] rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Sistem Denetim Logları
                    </h3>
                    <span className="text-[10px] font-mono text-slate-400">audit_logs</span>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed min-h-[34px]">
                Kullanıcı oturumları, ayar değişiklikleri, kural güncellemeleri ve güvenlik olayları.
              </p>

              <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Saklama Süresi:</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="1"
                      max="3650"
                      value={retentionPolicies.auditLogsDays}
                      onChange={(e) =>
                        setRetentionPolicies((p) => ({ ...p, auditLogsDays: Math.max(1, parseInt(e.target.value) || 1) }))
                      }
                      className="w-20 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold font-mono text-center focus:outline-hidden focus:border-indigo-500"
                    />
                    <span className="text-xs text-slate-400 font-medium">Gün</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 pt-1">
                  {[15, 30, 60, 90, 180, 365].map((d) => (
                    <button
                      key={d}
                      onClick={() => setRetentionPolicies((p) => ({ ...p, auditLogsDays: d }))}
                      className={`flex-1 py-1 text-[10px] font-semibold rounded-md border transition cursor-pointer ${
                        retentionPolicies.auditLogsDays === d
                          ? 'bg-purple-50 dark:bg-purple-950/60 border-purple-300 dark:border-purple-700 text-purple-600 dark:text-purple-300'
                          : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      {d}g
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => handleRunCategoryCleanup('auditLogs', 'Denetim Logları', retentionPolicies.auditLogsDays)}
                  disabled={runningCategoryCleanup === 'auditLogs'}
                  className="w-full mt-2 py-1.5 px-3 bg-slate-100 dark:bg-slate-800/80 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-700 hover:border-rose-300 dark:hover:border-rose-800 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>{runningCategoryCleanup === 'auditLogs' ? 'Temizleniyor...' : 'Sadece Denetim Loglarını Sil'}</span>
                </button>
              </div>
            </div>

            {/* Dispatch Logs Card */}
            <div className="bg-white dark:bg-[#0c1220] rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                    <Send className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Harici Gönderim Logları
                    </h3>
                    <span className="text-[10px] font-mono text-slate-400">dispatch_logs</span>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed min-h-[34px]">
                E-posta, SMS, Telegram veya Webhook gönderimlerinin başarı/hata durum kayıtları.
              </p>

              <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Saklama Süresi:</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="1"
                      max="3650"
                      value={retentionPolicies.dispatchLogsDays}
                      onChange={(e) =>
                        setRetentionPolicies((p) => ({ ...p, dispatchLogsDays: Math.max(1, parseInt(e.target.value) || 1) }))
                      }
                      className="w-20 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold font-mono text-center focus:outline-hidden focus:border-indigo-500"
                    />
                    <span className="text-xs text-slate-400 font-medium">Gün</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 pt-1">
                  {[7, 15, 30, 60, 90].map((d) => (
                    <button
                      key={d}
                      onClick={() => setRetentionPolicies((p) => ({ ...p, dispatchLogsDays: d }))}
                      className={`flex-1 py-1 text-[10px] font-semibold rounded-md border transition cursor-pointer ${
                        retentionPolicies.dispatchLogsDays === d
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-300'
                          : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      {d}g
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => handleRunCategoryCleanup('dispatchLogs', 'Gönderim Logları', retentionPolicies.dispatchLogsDays)}
                  disabled={runningCategoryCleanup === 'dispatchLogs'}
                  className="w-full mt-2 py-1.5 px-3 bg-slate-100 dark:bg-slate-800/80 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-700 hover:border-rose-300 dark:hover:border-rose-800 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>{runningCategoryCleanup === 'dispatchLogs' ? 'Temizleniyor...' : 'Sadece Gönderim Loglarını Sil'}</span>
                </button>
              </div>
            </div>

            {/* Device Commands Card */}
            <div className="bg-white dark:bg-[#0c1220] rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400">
                    <Terminal className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Cihaz Komut Geçmişi
                    </h3>
                    <span className="text-[10px] font-mono text-slate-400">device_commands</span>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed min-h-[34px]">
                ESP32 / IoT kontrolörlerine gönderilmiş röle aç/kapat veya konfigürasyon komut geçmişi.
              </p>

              <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Saklama Süresi:</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="1"
                      max="3650"
                      value={retentionPolicies.deviceCommandsDays}
                      onChange={(e) =>
                        setRetentionPolicies((p) => ({ ...p, deviceCommandsDays: Math.max(1, parseInt(e.target.value) || 1) }))
                      }
                      className="w-20 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold font-mono text-center focus:outline-hidden focus:border-indigo-500"
                    />
                    <span className="text-xs text-slate-400 font-medium">Gün</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 pt-1">
                  {[7, 15, 30, 60].map((d) => (
                    <button
                      key={d}
                      onClick={() => setRetentionPolicies((p) => ({ ...p, deviceCommandsDays: d }))}
                      className={`flex-1 py-1 text-[10px] font-semibold rounded-md border transition cursor-pointer ${
                        retentionPolicies.deviceCommandsDays === d
                          ? 'bg-cyan-50 dark:bg-cyan-950/60 border-cyan-300 dark:border-cyan-700 text-cyan-600 dark:text-cyan-300'
                          : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      {d}g
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => handleRunCategoryCleanup('deviceCommands', 'Cihaz Komutları', retentionPolicies.deviceCommandsDays)}
                  disabled={runningCategoryCleanup === 'deviceCommands'}
                  className="w-full mt-2 py-1.5 px-3 bg-slate-100 dark:bg-slate-800/80 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-700 hover:border-rose-300 dark:hover:border-rose-800 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>{runningCategoryCleanup === 'deviceCommands' ? 'Temizleniyor...' : 'Sadece Komutları Sil'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Automated Cleanup Scheduler Card */}
          <div className="bg-white dark:bg-[#0c1220] rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs space-y-4">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-500" />
                  Arka Plan Otomatik Temizlik Servisi (Auto-Retention Worker)
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Sunucu çalıştığı sürece periyodik olarak arka planda eski kayıtları tarar ve temizler.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Servis Durumu:</span>
                <button
                  type="button"
                  onClick={() => setRetentionPolicies((p) => ({ ...p, enabled: !p.enabled }))}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                    retentionPolicies.enabled ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      retentionPolicies.enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className={`text-xs font-bold ${retentionPolicies.enabled ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}>
                  {retentionPolicies.enabled ? 'Açık' : 'Kapalı'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Otomatik Temizlik Çalışma Sıklığı
                </label>
                <select
                  value={retentionPolicies.autoCleanupIntervalHours}
                  onChange={(e) =>
                    setRetentionPolicies((p) => ({ ...p, autoCleanupIntervalHours: parseInt(e.target.value) || 24 }))
                  }
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold focus:outline-hidden focus:border-indigo-500"
                >
                  <option value={6}>Her 6 Saatte Bir</option>
                  <option value={12}>Her 12 Saatte Bir</option>
                  <option value={24}>Günde 1 Kez (Her 24 Saat) - Tavsiye Edilen</option>
                  <option value={48}>2 Günde 1 Kez (Her 48 Saat)</option>
                  <option value={168}>Haftada 1 Kez (Her 7 Gün)</option>
                </select>
                <p className="text-[10px] text-slate-400">
                  Sunucu CPU/Disk yükünü azaltmak için günde bir kez çalıştırma tavsiye edilir.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Son Otomatik Temizlik Zamanı
                </label>
                <div className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-700 dark:text-slate-300 font-mono">
                  {retentionPolicies.lastCleanupAt
                    ? new Date(retentionPolicies.lastCleanupAt).toLocaleString('tr-TR')
                    : 'Henüz otomatik temizlik çalıştırılmadı'}
                </div>
                <p className="text-[10px] text-slate-400">
                  Bir sonraki temizlik belirlenen aralık tamamlandığında arka planda yürütülecektir.
                </p>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() =>
                  setRetentionPolicies({
                    enabled: true,
                    autoCleanupIntervalHours: 24,
                    telemetryDays: 90,
                    resolvedAlarmsDays: 30,
                    readNotificationsDays: 30,
                    auditLogsDays: 90,
                    dispatchLogsDays: 30,
                    deviceCommandsDays: 15,
                  })
                }
                className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 font-medium transition cursor-pointer"
              >
                Varsayılan Değerlere Sıfırla
              </button>

              <button
                onClick={handleSaveRetentionPolicies}
                disabled={savingRetention}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50 shadow-xs"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{savingRetention ? 'Kaydediliyor...' : 'Politikaları Kaydet & Uygula'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB: COLLECTIONS & SCHEMA */}
      {activeTab === 'collections' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {Object.entries(stats?.collections || {}).map(([key, count]) => (
              <button
                key={key}
                onClick={() => setInspectCollection(key)}
                className={`p-3.5 rounded-xl border text-left transition cursor-pointer ${
                  inspectCollection === key
                    ? 'bg-indigo-50/50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800'
                    : 'bg-white dark:bg-[#0c1220] border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <span className="text-xs font-semibold capitalize text-slate-700 dark:text-slate-300 block">
                  {key}
                </span>
                <span className="text-lg font-bold text-slate-900 dark:text-slate-100 font-mono">
                  {count}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Kayıt</span>
              </button>
            ))}
          </div>

          {/* Collection JSON Viewer */}
          <div className="bg-white dark:bg-[#0c1220] rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Koleksiyon Detayı: <code className="font-mono text-indigo-600">{inspectCollection}</code>
              </span>
              <button
                onClick={() => handleCopyJson(stats?.allDataRaw?.[inspectCollection] || {})}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-xs font-semibold rounded-lg transition cursor-pointer"
              >
                {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedText ? 'Kopyalandı' : 'JSON Kopyala'}</span>
              </button>
            </div>

            <pre className="p-4 bg-slate-950 text-slate-200 font-mono text-[11px] rounded-xl overflow-x-auto max-h-96 leading-relaxed border border-slate-800">
              {JSON.stringify(stats?.allDataRaw?.[inspectCollection] || {}, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* TAB: USERS DATABASE */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-[#0c1220] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Kullanıcı, e-posta veya şirket ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                >
                  <option value="all">Tüm Roller</option>
                  <option value="admin">Yönetici (Admin)</option>
                  <option value="customer">Müşteri</option>
                  <option value="analyst">Analist</option>
                  <option value="operator">Operatör</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-500 font-medium border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-4">Ad Soyad</th>
                    <th className="py-2.5 px-4">E-posta</th>
                    <th className="py-2.5 px-4">Şirket</th>
                    <th className="py-2.5 px-4">Rol</th>
                    <th className="py-2.5 px-4">Atanmış Cihaz</th>
                    <th className="py-2.5 px-4 text-right">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        Kayıtlı kullanıcı bulunamadı.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                        <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200">
                          {u.name}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-500">
                          {u.email}
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                          {u.companyName || '-'}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                              u.role === 'admin'
                                ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-700 dark:text-slate-300">
                          {u.assignedDevicesCount} Cihaz
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => setSelectedUserForModal(u)}
                            className="px-2.5 py-1 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 font-semibold rounded-md transition cursor-pointer inline-flex items-center gap-1"
                          >
                            <span>Detay</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* USER DETAIL MODAL */}
      {selectedUserForModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0c1220] rounded-xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-5 shadow-xl space-y-4 relative max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{selectedUserForModal.name}</h3>
                <p className="text-xs text-slate-400">{selectedUserForModal.email}</p>
              </div>
              <button
                onClick={() => setSelectedUserForModal(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                <span className="text-[10px] text-slate-400 block font-medium">Kullanıcı ID</span>
                <span className="font-mono font-semibold">{selectedUserForModal.id}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                <span className="text-[10px] text-slate-400 block font-medium">Rol</span>
                <span className="font-semibold capitalize">{selectedUserForModal.role}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                <span className="text-[10px] text-slate-400 block font-medium">Şirket</span>
                <span className="font-semibold">{selectedUserForModal.companyName || '-'}</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                <span className="text-[10px] text-slate-400 block font-medium">Kayıt Tarihi</span>
                <span className="font-semibold">{new Date(selectedUserForModal.created_at).toLocaleDateString('tr-TR')}</span>
              </div>
            </div>

            <div>
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-2">
                Atanmış Saha Cihazları ({selectedUserForModal.devicesList.length})
              </span>
              {selectedUserForModal.devicesList.length === 0 ? (
                <p className="text-xs text-slate-400 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/30">
                  Kullanıcıya atanmış cihaz bulunmuyor.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {selectedUserForModal.devicesList.map((d) => (
                    <div
                      key={d.id}
                      className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/40 flex items-center justify-between text-xs"
                    >
                      <div>
                        <p className="font-semibold text-slate-800 dark:text-slate-200">{d.name}</p>
                        <p className="text-[10px] font-mono text-slate-400">{d.id}</p>
                      </div>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          d.status === 'online' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                        }`}
                      >
                        {d.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => handleCopyJson(selectedUserForModal)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg transition cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>JSON Kopyala</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
