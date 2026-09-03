import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronDown,
  Layers,
  Sliders,
  Play,
  Pause,
  HelpCircle,
  Sparkles,
} from 'lucide-react';

interface HeaderOverflowMenuProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenAddWidgetModal: () => void;
  editMode: boolean;
  onToggleEditMode?: () => void;
  isAdmin: boolean;
  simulatorActive: boolean;
  toggleSimulator: () => void;
  className?: string;
}

export const HeaderOverflowMenu: React.FC<HeaderOverflowMenuProps> = ({
  activeTab,
  setActiveTab,
  onOpenAddWidgetModal,
  editMode,
  onToggleEditMode,
  isAdmin,
  simulatorActive,
  toggleSimulator,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // xl ekranlarda (>=1280px) tüm butonlar doğrudan üst barda gösterilir (taşma yok).
  // lg ekranlarda (1024-1279px) sadece Admin Simülatörü taşabilir (admin değilse taşma yok).
  // md ekranlarda (768-1023px) sadece Dashboard Düzenleme veya Admin Simülatörü taşabilir.
  // < md ekranlarda ise Yardım ve diğerleri taşar, buton daima görünür.
  const hasOverflowOnLg = isAdmin;
  const hasOverflowOnMd = activeTab === 'dashboard' || isAdmin;

  // Eğer o ekran genişliğinde taşan hiçbir buton yoksa menü butonunu tamamen gizle
  const responsiveVisibility = `xl:hidden ${
    !hasOverflowOnLg ? 'lg:hidden' : ''
  } ${!hasOverflowOnMd ? 'md:hidden' : ''}`;

  return (
    <div
      ref={menuRef}
      className={`relative inline-block text-left shrink-0 ${responsiveVisibility} ${className}`}
    >
      {/* Sığmayan Butonlar İçin Aşağı Açılır Menü Butonu */}
      <button
        type="button"
        id="header-overflow-dropdown-btn"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Üst bara sığmayan butonlar menüsü"
        aria-expanded={isOpen}
        title="Daha Fazla Araç (Sığmayan Butonlar)"
        className={`flex items-center justify-center gap-1 p-1.5 xs:p-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer shadow-sm active:scale-95 ${
          isOpen
            ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-400 dark:border-indigo-500 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-500/20'
            : 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700'
        }`}
      >
        <span className="sr-only">Sığmayan Butonlar</span>
        <ChevronDown
          className={`w-4 h-4 transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-180 text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-300'
          }`}
        />
      </button>

      {/* Sadece O Anki Ekran Boyutunda Üst Bara Sığmayan Butonların Listelendiği Açılır Panel */}
      {isOpen && (
        <div
          id="header-overflow-dropdown-panel"
          className="absolute right-0 mt-2 w-72 sm:w-80 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-[#0f172a] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 py-2.5 z-50 overflow-hidden animate-fadeIn"
        >
          {/* Menü Başlığı */}
          <div className="px-3.5 pb-2 mb-1.5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              Sığmayan Butonlar
            </span>
            <span className="text-[10px] text-slate-400 font-mono">Hızlı Erişim</span>
          </div>

          <div className="space-y-1 px-1.5">
            {/* 1. Dashboard: Yeni Widget Ekle (sm+ ekranlarda barda açık olduğu için sm:hidden) */}
            {activeTab === 'dashboard' && (
              <div className="sm:hidden">
                <button
                  type="button"
                  id="overflow-add-widget-btn"
                  onClick={() => {
                    onOpenAddWidgetModal();
                    setIsOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors flex items-center justify-between shadow-sm cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Layers className="w-4 h-4 shrink-0" />
                    <span>Yeni Widget Ekle</span>
                  </div>
                  <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-mono">+ Ekle</span>
                </button>
              </div>
            )}

            {/* 2. Dashboard: Düzenleme Modu (lg+ ekranlarda barda açık olduğu için lg:hidden) */}
            {activeTab === 'dashboard' && onToggleEditMode && (
              <div className="lg:hidden">
                <button
                  type="button"
                  id="overflow-toggle-edit-mode-btn"
                  onClick={() => {
                    onToggleEditMode();
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-colors flex items-center justify-between cursor-pointer border ${
                    editMode
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70 border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Sliders className={`w-4 h-4 shrink-0 ${editMode ? 'text-amber-500' : 'text-slate-500'}`} />
                    <div>
                      <p className="font-semibold">Dashboard Düzenleme</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        {editMode ? 'Düzenleme modu açık' : 'Yerleşim ve boyutları değiştir'}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      editMode
                        ? 'bg-amber-500 text-white'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {editMode ? 'Aktif' : 'Kapalı'}
                  </span>
                </button>
              </div>
            )}

            {/* 3. Yardım & SSS: md+ ekranlarda barda açık olduğu için md:hidden */}
            <div className="md:hidden">
              <button
                type="button"
                id="overflow-open-help-btn"
                onClick={() => {
                  setActiveTab('help');
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-colors flex items-center justify-between cursor-pointer ${
                  activeTab === 'help'
                    ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 font-semibold'
                    : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <HelpCircle className="w-4 h-4 text-indigo-500 shrink-0" />
                  <div>
                    <p className="font-semibold">Yardım, SSS & Kodlar</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">ESP32, Python, API dokümantasyonu</p>
                  </div>
                </div>
                <span className="text-[10px] text-slate-400">Aç →</span>
              </button>
            </div>

            {/* 4. Sadece Yönetici (Admin): Sanal Veri Simülatörü (xl+ ekranlarda barda açık olduğu için xl:hidden) */}
            {isAdmin && (
              <div className="xl:hidden">
                <button
                  type="button"
                  id="overflow-toggle-simulator-btn"
                  onClick={() => {
                    toggleSimulator();
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-colors flex items-center justify-between cursor-pointer border ${
                    simulatorActive
                      ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/30'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70 border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {simulatorActive ? (
                      <Pause className="w-4 h-4 text-indigo-500 shrink-0" />
                    ) : (
                      <Play className="w-4 h-4 text-slate-500 shrink-0" />
                    )}
                    <div>
                      <p className="font-semibold">Sanal Cihaz Simülatörü</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        {simulatorActive ? 'Otomatik veri üretiliyor' : 'Test verisi akışını başlat'}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      simulatorActive
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {simulatorActive ? 'Açık' : 'Kapalı'}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
