import React, { useState } from 'react';
import type { Site, Zone, DeviceGroup } from '../../types';
import { Building2, MapPin, FolderTree, Plus, Trash2, X, Check, AlertTriangle } from 'lucide-react';
import { apiFetch as fetch } from '../../lib/apiFetch';

interface HierarchyManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  sites: Site[];
  zones: Zone[];
  groups: DeviceGroup[];
  onRefreshHierarchy: () => Promise<void> | void;
}

export const HierarchyManagementModal: React.FC<HierarchyManagementModalProps> = ({
  isOpen,
  onClose,
  sites,
  zones,
  groups,
  onRefreshHierarchy,
}) => {
  const [activeTab, setActiveTab] = useState<'sites' | 'zones' | 'groups'>('sites');

  // New site form
  const [siteName, setSiteName] = useState('');
  const [siteAddress, setSiteAddress] = useState('');

  // New zone form
  const [zoneName, setZoneName] = useState('');
  const [zoneDescription, setZoneDescription] = useState('');
  const [zoneSiteId, setZoneSiteId] = useState<string>('');

  // New group form
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [groupColor, setGroupColor] = useState('#3b82f6');
  const [groupSiteId, setGroupSiteId] = useState<string>('');
  const [groupZoneId, setGroupZoneId] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreateSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!siteName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/devices/hierarchy/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: siteName, address: siteAddress }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Tesis eklenemedi.');
      }
      setSiteName('');
      setSiteAddress('');
      await onRefreshHierarchy();
    } catch (err: any) {
      setError(err?.message || 'Hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSite = async (siteId: string) => {
    if (!confirm('Bu tesisi silmek istediğinize emin misiniz?')) return;
    try {
      const res = await fetch(`/api/devices/hierarchy/sites/${siteId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Tesis silinemedi.');
      await onRefreshHierarchy();
    } catch (err: any) {
      setError(err?.message || 'Hata oluştu.');
    }
  };

  const handleCreateZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zoneName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/devices/hierarchy/zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: zoneName,
          description: zoneDescription,
          siteId: zoneSiteId || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Bölge eklenemedi.');
      }
      setZoneName('');
      setZoneDescription('');
      await onRefreshHierarchy();
    } catch (err: any) {
      setError(err?.message || 'Hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteZone = async (zoneId: string) => {
    if (!confirm('Bu bölgeyi silmek istediğinize emin misiniz?')) return;
    try {
      const res = await fetch(`/api/devices/hierarchy/zones/${zoneId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Bölge silinemedi.');
      await onRefreshHierarchy();
    } catch (err: any) {
      setError(err?.message || 'Hata oluştu.');
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/devices/hierarchy/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: groupName,
          description: groupDescription,
          color: groupColor,
          siteId: groupSiteId || undefined,
          zoneId: groupZoneId || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Grup eklenemedi.');
      }
      setGroupName('');
      setGroupDescription('');
      await onRefreshHierarchy();
    } catch (err: any) {
      setError(err?.message || 'Hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm('Bu grubu silmek istediğinize emin misiniz?')) return;
    try {
      const res = await fetch(`/api/devices/hierarchy/groups/${groupId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Grup silinemedi.');
      await onRefreshHierarchy();
    } catch (err: any) {
      setError(err?.message || 'Hata oluştu.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        id="modal-hierarchy-management"
        className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <FolderTree className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100">Hiyerarşik Yapı & Lokasyon Yönetimi</h3>
              <p className="text-xs text-slate-400">Tesis (Site) → Bölge (Zone) → Cihaz Grubu Yapılandırması</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Header */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-6">
          <button
            type="button"
            id="tab-btn-sites"
            onClick={() => setActiveTab('sites')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'sites'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Tesisler & Lokasyonlar ({sites.length})</span>
          </button>
          <button
            type="button"
            id="tab-btn-zones"
            onClick={() => setActiveTab('zones')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'zones'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Bölgeler / Alanlar ({zones.length})</span>
          </button>
          <button
            type="button"
            id="tab-btn-groups"
            onClick={() => setActiveTab('groups')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'groups'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FolderTree className="w-3.5 h-3.5" />
            <span>Cihaz Grupları ({groups.length})</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {error && (
            <div className="p-3 text-xs bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-lg flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {activeTab === 'sites' && (
            <div className="space-y-4">
              <form onSubmit={handleCreateSite} className="p-4 bg-slate-950/60 border border-slate-800 rounded-lg space-y-3">
                <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Yeni Tesis / Fabrika Ekle</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Tesis / Kampüs Adı</label>
                    <input
                      id="input-site-name"
                      type="text"
                      value={siteName}
                      onChange={(e) => setSiteName(e.target.value)}
                      placeholder="Örn: Gebze Üretim Tesisi"
                      required
                      className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Adres / Lokasyon</label>
                    <input
                      id="input-site-address"
                      type="text"
                      value={siteAddress}
                      onChange={(e) => setSiteAddress(e.target.value)}
                      placeholder="Örn: Kocaeli OSB"
                      className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  id="btn-add-site"
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tesis Ekle</span>
                </button>
              </form>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-400">Mevcut Tesisler ({sites.length})</h4>
                {sites.length === 0 ? (
                  <p className="text-xs text-slate-500">Henüz tanımlı tesis bulunmuyor.</p>
                ) : (
                  sites.map((s) => (
                    <div
                      key={s.id}
                      id={`site-row-${s.id}`}
                      className="flex items-center justify-between p-3 bg-slate-800/40 border border-slate-800 rounded-lg text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-indigo-400" />
                        <div>
                          <span className="font-semibold text-slate-200">{s.name}</span>
                          {s.address && <p className="text-slate-400 text-[11px]">{s.address}</p>}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteSite(s.id)}
                        className="p-1 text-slate-400 hover:text-rose-400 rounded"
                        title="Tesisi sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'zones' && (
            <div className="space-y-4">
              <form onSubmit={handleCreateZone} className="p-4 bg-slate-950/60 border border-slate-800 rounded-lg space-y-3">
                <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Yeni Bölge / Alan Ekle</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Bağlı Olduğu Tesis</label>
                    <select
                      id="select-zone-site"
                      value={zoneSiteId}
                      onChange={(e) => setZoneSiteId(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">Tesis Yok (Genel)</option>
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Bölge Adı</label>
                    <input
                      id="input-zone-name"
                      type="text"
                      value={zoneName}
                      onChange={(e) => setZoneName(e.target.value)}
                      placeholder="Örn: Hat 1 Montaj Bölümü"
                      required
                      className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Açıklama</label>
                    <input
                      id="input-zone-desc"
                      type="text"
                      value={zoneDescription}
                      onChange={(e) => setZoneDescription(e.target.value)}
                      placeholder="Örn: 2. Kat Ana Salon"
                      className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  id="btn-add-zone"
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Bölge Ekle</span>
                </button>
              </form>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-400">Mevcut Bölgeler ({zones.length})</h4>
                {zones.length === 0 ? (
                  <p className="text-xs text-slate-500">Henüz tanımlı bölge bulunmuyor.</p>
                ) : (
                  zones.map((z) => {
                    const matchedSite = sites.find((s) => s.id === z.siteId);
                    return (
                      <div
                        key={z.id}
                        id={`zone-row-${z.id}`}
                        className="flex items-center justify-between p-3 bg-slate-800/40 border border-slate-800 rounded-lg text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-teal-400" />
                          <div>
                            <span className="font-semibold text-slate-200">{z.name}</span>
                            {matchedSite && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">{matchedSite.name}</span>}
                            {z.description && <p className="text-slate-400 text-[11px]">{z.description}</p>}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteZone(z.id)}
                          className="p-1 text-slate-400 hover:text-rose-400 rounded"
                          title="Bölgeyi sil"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {activeTab === 'groups' && (
            <div className="space-y-4">
              <form onSubmit={handleCreateGroup} className="p-4 bg-slate-950/60 border border-slate-800 rounded-lg space-y-3">
                <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Yeni Cihaz Grubu Ekle</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Grup Adı</label>
                    <input
                      id="input-group-name"
                      type="text"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      placeholder="Örn: Enerji Analizörleri"
                      required
                      className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Bağlı Tesis (Opsiyonel)</label>
                    <select
                      id="select-group-site"
                      value={groupSiteId}
                      onChange={(e) => setGroupSiteId(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">Tesis Yok</option>
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Grup Rengi</label>
                    <input
                      id="input-group-color"
                      type="color"
                      value={groupColor}
                      onChange={(e) => setGroupColor(e.target.value)}
                      className="w-full h-8 px-1 py-0.5 bg-slate-900 border border-slate-700 rounded cursor-pointer"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  id="btn-add-group"
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Grup Ekle</span>
                </button>
              </form>

              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-400">Mevcut Gruplar ({groups.length})</h4>
                {groups.length === 0 ? (
                  <p className="text-xs text-slate-500">Henüz tanımlı grup bulunmuyor.</p>
                ) : (
                  groups.map((g) => (
                    <div
                      key={g.id}
                      id={`group-row-${g.id}`}
                      className="flex items-center justify-between p-3 bg-slate-800/40 border border-slate-800 rounded-lg text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: g.color || '#3b82f6' }} />
                        <div>
                          <span className="font-semibold text-slate-200">{g.name}</span>
                          {g.description && <p className="text-slate-400 text-[11px]">{g.description}</p>}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteGroup(g.id)}
                        className="p-1 text-slate-400 hover:text-rose-400 rounded"
                        title="Grubu sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
