const fs = require('fs');

let content = fs.readFileSync('src/components/SetupGuideView.tsx', 'utf8');

// Replace imports
content = content.replace(
  "import React from 'react';",
  "import React, { useState, useEffect } from 'react';"
);
content = content.replace(
  "import { Database, Server, Settings, Zap, ArrowRight, ServerCrash, Shield, Cloud, HardDrive, CheckCircle2 } from 'lucide-react';",
  "import { Database, Server, Settings, Zap, ArrowRight, ServerCrash, Shield, Cloud, HardDrive, CheckCircle2, Save, RefreshCw } from 'lucide-react';"
);

// Inject state inside the component
const stateLogic = `
  const [inputPostgresUrl, setInputPostgresUrl] = useState('');
  const [testingPostgres, setTestingPostgres] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  useEffect(() => {
    // Load current config
    fetch('/api/database/config')
      .then(res => res.json())
      .then(data => {
        if (data && data.postgresUrl) {
          setInputPostgresUrl(data.postgresUrl);
        }
      })
      .catch(err => console.error(err));
  }, []);

  const handleTestPostgres = async () => {
    setTestingPostgres(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/database/postgres/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postgresUrl: inputPostgresUrl }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Bağlantı testi başarısız oldu.' });
    } finally {
      setTestingPostgres(false);
    }
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      const res = await fetch('/api/database/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engine: 'postgres', postgresUrl: inputPostgresUrl }),
      });
      const data = await res.json();
      
      if (data.success) {
        // Automatically sync and migrate after saving URL
        await fetch('/api/database/postgres/migrate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ postgresUrl: inputPostgresUrl }),
        });
        await fetch('/api/database/postgres/sync-all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        
        setTestResult({ success: true, message: 'Veritabanı bilgileri kaydedildi ve tablolar başarıyla oluşturuldu.' });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Ayarlar kaydedilemedi.' });
    } finally {
      setSavingConfig(false);
    }
  };
`;

content = content.replace("export const SetupGuideView: React.FC = () => {", "export const SetupGuideView: React.FC = () => {" + stateLogic);

const uiBlock = `
      {/* Database Connection Form */}
      <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-6 md:p-8 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
        <div className="flex items-center gap-3 mb-6">
          <Database className="w-8 h-8 text-blue-500" />
          <div>
            <h3 className="font-bold text-2xl text-slate-800 dark:text-slate-100">PostgreSQL Veritabanı Bağlantısı</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Halihazırda var olan PostgreSQL veritabanınızın URL adresini girerek kalıcı veri kaydını aktif edin.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              DATABASE_URL (PostgreSQL Connection String)
            </label>
            <input
              type="text"
              value={inputPostgresUrl}
              onChange={(e) => setInputPostgresUrl(e.target.value)}
              placeholder="postgresql://kullanici_adi:sifre@sunucu_adresi:5432/veritabani_adi?sslmode=disable"
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              Örnek: <code>postgresql://postgres:sifreniz@db.exapmle.com:5432/iot_db</code>
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 pt-2">
            <button
              onClick={handleTestPostgres}
              disabled={testingPostgres || !inputPostgresUrl}
              className="w-full sm:w-auto px-6 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={\`w-4 h-4 \${testingPostgres ? 'animate-spin text-blue-500' : ''}\`} />
              Bağlantıyı Test Et
            </button>
            <button
              onClick={handleSaveConfig}
              disabled={savingConfig || !inputPostgresUrl}
              className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm"
            >
              <Save className={\`w-4 h-4 \${savingConfig ? 'animate-pulse' : ''}\`} />
              Kaydet ve Tabloları Oluştur
            </button>
          </div>

          {testResult && (
            <div className={\`mt-4 p-4 rounded-xl border \${testResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-400' : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-400'}\`}>
              <div className="flex items-start gap-3">
                {testResult.success ? <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" /> : <ServerCrash className="w-5 h-5 mt-0.5 shrink-0" />}
                <div>
                  <h4 className="font-bold text-sm mb-1">{testResult.success ? 'İşlem Başarılı' : 'Bağlantı Hatası'}</h4>
                  <p className="text-xs whitespace-pre-wrap">{testResult.message}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
`;

content = content.replace('<div className="grid grid-cols-1 md:grid-cols-2 gap-6">', uiBlock + '\n\n      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">');

fs.writeFileSync('src/components/SetupGuideView.tsx', content);
