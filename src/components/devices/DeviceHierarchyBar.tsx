import React from 'react';
import type { Site, Zone, DeviceGroup } from '../../types';
import { Building2, MapPin, FolderTree, Tag, Filter, Settings, X } from 'lucide-react';

interface DeviceHierarchyBarProps {
  sites: Site[];
  zones: Zone[];
  groups: DeviceGroup[];
  allTags: string[];
  selectedSiteId: string;
  onSelectSiteId: (siteId: string) => void;
  selectedZoneId: string;
  onSelectZoneId: (zoneId: string) => void;
  selectedGroupId: string;
  onSelectGroupId: (groupId: string) => void;
  selectedTag: string;
  onSelectTag: (tag: string) => void;
  onOpenHierarchyModal: () => void;
}

export const DeviceHierarchyBar: React.FC<DeviceHierarchyBarProps> = ({
  sites,
  zones,
  groups,
  allTags,
  selectedSiteId,
  onSelectSiteId,
  selectedZoneId,
  onSelectZoneId,
  selectedGroupId,
  onSelectGroupId,
  selectedTag,
  onSelectTag,
  onOpenHierarchyModal,
}) => {
  const filteredZones = selectedSiteId && selectedSiteId !== 'all'
    ? zones.filter((z) => !z.siteId || z.siteId === selectedSiteId)
    : zones;

  const hasActiveFilters = selectedSiteId !== 'all' || selectedZoneId !== 'all' || selectedGroupId !== 'all' || selectedTag !== 'all';

  const resetFilters = () => {
    onSelectSiteId('all');
    onSelectZoneId('all');
    onSelectGroupId('all');
    onSelectTag('all');
  };

  return (
    <div
      id="device-hierarchy-filter-bar"
      className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl space-y-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Site Filter */}
          <div className="flex items-center gap-1.5 bg-slate-950/80 border border-slate-800 px-2.5 py-1 rounded-lg">
            <Building2 className="w-3.5 h-3.5 text-indigo-400" />
            <select
              id="filter-site-select"
              value={selectedSiteId}
              onChange={(e) => {
                onSelectSiteId(e.target.value);
                onSelectZoneId('all');
              }}
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="all">Tüm Tesisler ({sites.length})</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Zone Filter */}
          <div className="flex items-center gap-1.5 bg-slate-950/80 border border-slate-800 px-2.5 py-1 rounded-lg">
            <MapPin className="w-3.5 h-3.5 text-teal-400" />
            <select
              id="filter-zone-select"
              value={selectedZoneId}
              onChange={(e) => onSelectZoneId(e.target.value)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="all">Tüm Bölgeler ({filteredZones.length})</option>
              {filteredZones.map((z) => (
                <option key={z.id} value={z.id}>{z.name}</option>
              ))}
            </select>
          </div>

          {/* Group Filter */}
          <div className="flex items-center gap-1.5 bg-slate-950/80 border border-slate-800 px-2.5 py-1 rounded-lg">
            <FolderTree className="w-3.5 h-3.5 text-amber-400" />
            <select
              id="filter-group-select"
              value={selectedGroupId}
              onChange={(e) => onSelectGroupId(e.target.value)}
              className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="all">Tüm Gruplar ({groups.length})</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          {/* Tag Filter */}
          {allTags.length > 0 && (
            <div className="flex items-center gap-1.5 bg-slate-950/80 border border-slate-800 px-2.5 py-1 rounded-lg">
              <Tag className="w-3.5 h-3.5 text-sky-400" />
              <select
                id="filter-tag-select"
                value={selectedTag}
                onChange={(e) => onSelectTag(e.target.value)}
                className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="all">Tüm Etiketler ({allTags.length})</option>
                {allTags.map((t) => (
                  <option key={t} value={t}>#{t}</option>
                ))}
              </select>
            </div>
          )}

          {hasActiveFilters && (
            <button
              type="button"
              id="btn-clear-hierarchy-filters"
              onClick={resetFilters}
              className="flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-3 h-3" />
              <span>Filtreleri Temizle</span>
            </button>
          )}
        </div>

        {/* Hierarchy Management Button */}
        <button
          type="button"
          id="btn-open-hierarchy-management"
          onClick={onOpenHierarchyModal}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-indigo-400 hover:text-indigo-300 hover:bg-indigo-950/40 border border-indigo-900/60 rounded-lg transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>Lokasyon & Grup Yapılandır</span>
        </button>
      </div>
    </div>
  );
};
