# NexusNode IoT Dashboard — Proje Haritası & Bağımlılık Referansı

> **Amaç**: Bu dosya AI asistanının her oturumda projeyi yeniden keşfetmesini önlemek için  
> hızlı referans noktası görevi görür. Token tüketimini azaltır, işleri hızlandırır.  
> Güncelleme: Her büyük yapısal değişiklikte bu dosyayı da güncelleyin.

---

## Kök Dizin Yapısı

```
c:/iot-dashboard/
├── server.ts              # Express ana sunucu - tüm router'ları bağlar
├── package.json           # Proje metadata, scripts, deps (v ile senkron tutulacak)
├── package-lock.json      # Lock dosyası (package.json ile senkron)
├── vite.config.ts         # Vite frontend build yapılandırması
├── tsconfig.json          # TypeScript config
├── CHANGELOG.md           # Sürüm geçmişi (her değişiklikte güncellenecek)
├── PROJECT_MAP.md         # Bu dosya
├── AGENTS.md / GEMINI.md  # AI asistan kuralları
├── ddl.sql                # PostgreSQL şema tanımı
├── openapi.yaml/json      # API dokümantasyonu
├── docker-compose.yml     # Docker konfigürasyonu
└── src/
    ├── main.tsx           # React entry point
    ├── App.tsx            # Ana uygulama bileşeni - tab yönlendirmesi
    ├── types.ts           # Global TypeScript tip tanımları
    ├── index.css          # Global CSS stilleri
    ├── config/
    │   └── version.ts     # TEK SÜRÜM KAYNAĞI - buradan import edilecek
    ├── components/        # React UI bileşenleri
    ├── context/           # React context provider'ları
    ├── hooks/             # Custom React hook'ları
    ├── lib/               # Frontend yardımcı kütüphaneler
    ├── server/            # Backend Express rotaları ve iş mantığı
    ├── db/                # Veritabanı tip tanımları (frontend tarafı)
    ├── utils/             # Frontend utility fonksiyonları
    └── tests/             # Test dosyaları
```

---

## Kritik Dosyalar

### Sürüm Yönetimi
- **`src/config/version.ts`** — TEK SÜRÜM KAYNAĞI
  - APP_VERSION, APP_RELEASE_TAG, RELEASE_DATE
  - GITHUB_VERSION, GITHUB_RELEASE_TAG, GITHUB_RELEASES_URL
  - Her değişiklikte burayı, package.json, package-lock.json ve CHANGELOG.md güncelle

### Ana Giriş Noktaları
- **`server.ts`** — Backend Express sunucusu, tüm route'lar buradan yönetilir
- **`src/App.tsx`** — Frontend tab yönlendirmesi ve view'lar
- **`src/main.tsx`** — React uygulama başlangıcı

---

## Frontend Bileşenleri (src/components/)

### Ana View'lar
| Dosya | Açıklama |
|-------|----------|
| Sidebar.tsx | Sol sidebar navigasyon + çift sürüm kartı (üst=sistem, alt=GitHub) |
| Header.tsx | Üst başlık çubuğu |
| LoginView.tsx | Giriş ekranı |
| NotificationsView.tsx | Bildirim & alarm yönetimi tabları |
| DevicesView.tsx | Cihaz yönetimi |
| AnalyticsView.tsx | Veri analizi |
| HelpView.tsx | Yardım & Bilgi Merkezi (canlı kod örnekleri) |
| AccountSettingsView.tsx | Hesap ayarları |
| DatabaseDataView.tsx | PostgreSQL veri görünümü |
| DeploymentView.tsx | Deployment yönetimi |
| DataGeneratorView.tsx | Sanal veri üreteci |
| AutomationsView.tsx | Otomasyon senaryoları |
| DeviceHealthView.tsx | Cihaz sağlığı |
| FirmwareView.tsx | Firmware & OTA |
| SecurityView.tsx | Güvenlik & audit logları |
| NetworkDiscoveryView.tsx | Ağ keşif & eşleştirme |
| CustomerManagement.tsx | Müşteri yönetimi |

### Alt Dizin Bileşenleri
| Dizin | İçerik |
|-------|--------|
| notifications/ | ActiveAlarmTable, AlarmRuleList, AlarmRuleWizard, NotificationHistoryList, DeliveryHistory, DeliveryQueue, ChannelConfiguration, ContactPreferences |
| devices/ | Cihaz alt bileşenleri |
| widgets/ | Dashboard widget bileşenleri |
| common/ | Paylaşımlı UI bileşenleri |
| admin/ | Admin paneli bileşenleri |
| database/ | Veritabanı görünüm bileşenleri |
| system/ | Sistem durumu bileşenleri |

---

## Backend (src/server/)

### Route Dosyaları (src/server/routes/)
| Dosya | Açıklama |
|-------|----------|
| alarms.ts | Alarm ve bildirim rotaları |
| system.ts | Sistem durumu, sürüm, runtime bilgisi |
| auth.ts | Kimlik doğrulama |
| devices.ts | Cihaz CRUD |
| telemetry.ts | Telemetri veri alımı |
| users.ts | Kullanıcı yönetimi |

### Önemli API Endpoint'leri
| Endpoint | Yöntem | Açıklama |
|----------|--------|----------|
| /api/runtime | GET | Çalışma ortamı bilgisi (VPS/Local/AiStudio) |
| /api/system/version | GET | Sistem & GitHub sürüm bilgisi |
| /api/notifications/bulk-delete | POST | Toplu bildirim silme |
| /api/notifications/clear | POST | Tüm bildirimleri temizle |
| /api/notifications/:id | DELETE | Tekil bildirim silme |
| /api/telemetry | POST | JSON telemetri yükleme |
| /api/v1/telemetry | POST | Kompakt CSV telemetri |
| /api/telemetry/ping | POST | Heartbeat/ping |
| /api/devices/:id/control | POST | Cihaz çıkış kontrolü |

### Repositories (src/server/repositories/)
| Dosya | Açıklama |
|-------|----------|
| alarm.repository.ts | Alarm & bildirim CRUD operasyonları |
| notification.repository.ts | Bildirim depo katmanı |
| device.repository.ts | Cihaz depo katmanı |
| user.repository.ts | Kullanıcı depo katmanı |

---

## Context & State (src/context/)

| Dosya | Açıklama |
|-------|----------|
| RealtimeContext.tsx | WebSocket gerçek zamanlı veri, bildirimler |
| AuthContext.tsx | Kullanıcı oturum durumu |

### RealtimeContext'te Önemli Metodlar
- notifications — bildirim listesi state
- fetchNotifications() — bildirimleri yenile
- deleteNotification(id) — tekil silme
- bulkDeleteNotifications(ids) — toplu silme (optimistik UI)
- clearAllNotifications() — tümünü temizle

---

## Kütüphaneler (src/lib/)

| Dosya | Açıklama |
|-------|----------|
| apiFetch.ts | HTTP istek yardımcısı (auth header, hata yönetimi) |
| permissions.ts | Rol tabanlı yetki kontrolleri |
| sshRuntimePolicy.ts | SSH tüneli çalışma zamanı politikası |
| utils.ts | Genel yardımcı fonksiyonlar |
| widgetFreshness.ts | Widget veri tazelik kontrolleri |

---

## Sürüm Güncelleme Adımları

1. src/config/version.ts -> APP_VERSION, APP_RELEASE_TAG güncelle
2. package.json -> version alanını güncelle
3. package-lock.json -> version ve packages[""].version güncelle
4. CHANGELOG.md -> Yeni sürüm başlığı ve değişiklik listesi ekle

---

## Rol Sistemi

| Rol | Yetkiler |
|-----|---------|
| admin | Tam yetki |
| operator | Saha operasyon |
| analyst | Veri okuma/analiz |
| customer | Kendi cihazları |
| superadmin | Süper admin |
| usr_admin | Kullanıcı admin |

---

## Çalışma Ortamları

| Ortam | runtimeEnv | Renk Teması |
|-------|------------|-------------|
| Yerel Geliştirme | local | Sky/Mavi |
| VPS Sunucu | vps | Purple/Mor |
| AI Studio | aistudio | Amber/Sarı |

---

## WebSocket Events

| Event | Açıklama |
|-------|----------|
| notifications:updated | Bildirim listesi güncellendi |
| device:telemetry | Cihaz telemetri verisi geldi |
| alarm:triggered | Alarm tetiklendi |
| nexus_open_ssh_drawer | SSH drawer aç (CustomEvent) |

---

Son güncelleme: v1.49.21 — 2026-10-24
