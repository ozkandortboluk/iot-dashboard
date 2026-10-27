import React, { useEffect, useState } from 'react';
import type { AuditLog } from '../types';
import { formatDateTime } from '../lib/utils';
import { ShieldCheck, ShieldAlert, Lock, Key, Eye, UserCheck, Activity, Terminal } from 'lucide-react';
import { apiFetch as fetch } from '../lib/apiFetch';
import { useAuth } from '../context/AuthContext';
import { SystemSecretsPanel } from './system/SystemSecretsPanel';

export const SecurityView: React.FC = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    fetch('/api/audit-logs')
      .then((res) => {
        const ct = res.headers.get('content-type');
        if (res.ok && ct && ct.includes('application/json')) {
          return res.json();
        }
        return [];
      })
      .then((data) => setLogs(data))
      .catch(() => {});
  }, [user?.role]);

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center space-y-4">
        <div className="w-16 h-16 bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto border border-rose-500/20">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-white">Yetkisiz Erişim</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          Güvenlik parametreleri ve sistem audit logları yalnızca <strong>Sistem Yöneticisi (Admin)</strong> rolüne açıktır.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white dark:bg-[#0f172a] p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <span>Veri Güvenliği, Şifreleme Katmanı & Erişim Denetimi</span>
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Sistem uçtan uca şifreleme, API token doğrulaması ve detaylı erişim denetim günlüğü ile korunmaktadır.
        </p>
      </div>

      {/* Security Architecture Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white dark:bg-[#0f172a] p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-3">
          <div className="p-2.5 bg-emerald-500/10 text-emerald-400 w-fit rounded-2xl border border-emerald-500/20">
            <Lock className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Veritabanı & Şifreleme</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Kullanıcı parolaları SHA-256 + Salt algoritmaları ile özetlenir. Cihaz verileri AES-256-GCM simetrik şifreleme bloklarında işlenir.
          </p>
        </div>

        <div className="bg-white dark:bg-[#0f172a] p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-3">
          <div className="p-2.5 bg-indigo-500/10 text-indigo-400 w-fit rounded-2xl border border-indigo-500/20">
            <Key className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">API Key & Token Güvenliği</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Her cihaz için benzersiz rastgele <code className="text-indigo-400">dev_key_*</code> anahtarları üretilir. Header tabanlı yetkilendirme zorunludur.
          </p>
        </div>

        <div className="bg-white dark:bg-[#0f172a] p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl space-y-3">
          <div className="p-2.5 bg-purple-500/10 text-purple-400 w-fit rounded-2xl border border-purple-500/20">
            <UserCheck className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Çoklu Kullanıcı & Rol Yetkisi</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Admin, Sistem Analisti ve Operatör rolleri tanımlanmıştır. Her kullanıcı kendi özelleştirilmiş dashboard görünümüne sahiptir.
          </p>
        </div>
      </div>

      {/* AES-256-GCM System Secrets Vault Panel */}
      <SystemSecretsPanel />


      {/* Audit Logs Stream */}
      <div className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span>Sistem Güvenlik Audit Denetim Kayıtları ({logs.length})</span>
          </h3>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800/80 max-h-96 overflow-y-auto text-xs">
          {logs.map((log) => (
            <div key={log.id} className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/40">
              <div className="flex items-center gap-3 min-w-0">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  log.severity === 'high' ? 'bg-rose-500' : log.severity === 'medium' ? 'bg-amber-500' : 'bg-emerald-400'
                }`} />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-white truncate">{log.action}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Kullanıcı: <strong className="text-slate-700 dark:text-slate-300">{log.userName}</strong> • IP: <span className="font-mono">{log.ip}</span>
                  </p>
                </div>
              </div>

              <span className="text-[10px] text-slate-400 font-mono shrink-0">
                {formatDateTime(log.timestamp)}
              </span>
            </div>
          ))}
        </div>
      </div>


    </div>
  );
};
