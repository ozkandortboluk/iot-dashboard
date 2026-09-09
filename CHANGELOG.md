# 📦 Proje Sürüm Geçmişi & Değişiklik Günlüğü (Changelog)

Bu belgede **Industrial IoT Analytics & Dashboard** platformunun tüm sürümleri, sürüm içerikleri ve yapılan geliştirmeler kronolojik olarak listelenmektedir.

---

## 🚀 [v1.6.0] - 2026-09-09
### 🔍 Roadmap P2: Cihaz Keşfi, Tek Provizyon Sihirbazı & Eşleştirme Güvenlik Denetimi
- **Tek Birleşik Provizyon Sihirbazı (`ProvisioningWizardModal.tsx`):**
  - **Adım 1 (Yöntem & Kimlik):** QR Kod tarama/kamera simülasyonu, 6 haneli geçici PIN eşleştirme kodu, yerel ağ keşif havuzundan aktarım ve manuel IP/MAC giriş modları eklendi.
  - **Adım 2 (Çakışma Analizi & Strateji):** Sunucu taraflı MAC, IP ve İsim çakışma tespiti (`POST /api/network/check-duplicate`). Çakışma durumunda *Donanım Değişimi (Replace Hardware)*, *Mevcut Kaydı Güncelle (Update Existing)* veya *Otomatik Benzersiz İsimle Ekle (Force Unique)* stratejileri entegre edildi.
  - **Adım 3 (Hiyerarşi, Konum & Tenant Ataması):** Müşteri (Tenant), Tesis (Site), Bölge (Zone), Grup ve dinamik Etiket (Tag) ilişkilendirmesi sağlandı.
  - **Adım 4 (Yetkilendirme & API Key):** Kriptografik API anahtarının tek tıkla kopyalanması ve donanım özet ekranı tamamlandı.
- **Cihaz Yaşam Döngüsü & Anlık Durum Rozetleri (`DiscoveredDeviceCard.tsx`):**
  - Keşif havuzundaki donanımlar için `Discovered → Pending → Assigned → Active` yaşam döngüsü takibi ve rozetleri eklendi.
  - Canlı RSSI sinyal seviyesi, ICMP ping testi ve doğrudan sihirbaza aktarma aksiyonları sağlandı.
- **Eşleştirme Güvenlik Denetimi & Günlüğü (`PairingAuditTable.tsx`):**
  - Tüm eşleştirme operasyonları için aktör (işlemi yapan kullanıcı), hedef organizasyon/tenant, yöntem, çakışma çözüm detayları ve zaman damgası kayıt altına alındı (`GET /api/network/pairing-history`).
- **Modüler Görünüm (`NetworkDiscoveryView.tsx`):**
  - Temiz kod prensipleri gereğince devasa dosya modüler alt bileşenlere ayrılarak `src/components/discovery/` altında toplandı.

---

## 🚀 [v1.5.0] - 2026-09-09
### 🏭 Roadmap P2: Hiyerarşik Cihaz Yönetimi, Bakım Modu & Donanım Değişimi
- **Hiyerarşik Yapı & Filtreleme (`Site -> Zone -> Group`):**
  - Tesis, Bölge ve Grup hiyerarşisi veri modelleri ve `DeviceHierarchyBar` bileşeni eklendi.
  - Cihaz filtreleme ve gruplama Tesis, Bölge, Grup ve Etiket (Tag) parametrelerine göre entegre edildi.
  - Hiyerarşi yönetimi için `HierarchyManagementModal` modalı ve veritabanı CRUD operasyonları sağlandı.
- **Dinamik Etiketleme (Device Tagging):**
  - Cihazlara dinamik renkli etiket ekleme, kaldırma ve etiket bazlı hızlı filtreleme (`DeviceTagsEditor`) eklendi.
- **Bakım Modu (Maintenance Mode):**
  - Cihazlar için bakım modu, bakım nedeni ve tahmini bitiş tarihi desteği eklendi.
  - Bakım modundaki cihazlar için alarm ve uyarı bastırma (suppression) entegrasyonu sağlandı (`DeviceMaintenanceModal`).
- **Donanım Değişimi & Seri No Tarihçesi (Hardware Replacement):**
  - Sahada değişen cihazlar için yeni Seri No, MAC ve Değişim Nedeni ile donanım yenileme modalı (`DeviceReplacementModal`) ve tarihçe kaydı oluşturuldu.
- **Cihaz Sağlık Özeti (Device Health Summary & Badge):**
  - Cihazların canlılık eşiği, veri tazeliği ve sağlık skoru göstergesi (`DeviceHealthBadge`) entegre edildi.

---

## 🚀 [v1.4.1] - 2026-09-09
### 📊 Roadmap P2: Canlı Dashboard & Komut Takip İyileştirmeleri
- **Widget Yapılandırma Doğrulama & Temizleme (`src/lib/widgetValidation.ts`):**
  - Tüm widget yapılandırmaları için şema doğrulama ve geçersiz alanları düzeltme desteği eklendi.
  - `notification.repository.ts` ve `RealtimeContext.tsx` içindeki widget kaydetme ve yükleme işlemlerine validatör entegre edildi.
- **Global Bağlantı Durumu & Üstel Yeniden Bağlanma (Exponential Backoff):**
  - `RealtimeContext.tsx` içinde dinamik geri sayım sayacı (`reconnectCountdown`) ve deneme sayısı (`reconnectAttempt`) ile akıllı WebSocket yeniden bağlanma algoritması uygulandı.
  - `Header.tsx` üzerinde bağlantı gecikmesi (`wsLatency`), aktif geri sayım ve anında manuel yeniden bağlanma butonu görselleştirildi.
- **Canlı Komut Takibi & Donanım ACK Geri Bildirimi:**
  - `sendControlCommand` için iyimser (optimistic) durum yönetimi ve 6 saniyelik zaman aşımı güvenlik mekanizması eklendi.
  - `SwitchControlWidget.tsx` ve `ButtonControlWidget.tsx` bileşenlerinde `Pending → Applied / Failed / Timeout` durumları renkli göstergeler ve donanım ACK rozetleri ile güncellendi.

---

## 🚀 [v1.4.0] - 2026-09-09
### 🎯 Roadmap P0 & P1 Üretim & Güvenilirlik Tamamlama Paketi
- **P0.4: Yedekleme, Geri Yükleme, Şema Migrasyonu & Sürüm Yükseltme Doğrulaması (`src/tests/backup_restore_migration_upgrade.test.ts`):**
  - Tam JSON ve SQL veritabanı yedeği oluşturma, meta veri ve dosya boyutu doğrulama.
  - Yedekten geri yükleme ile cihaz, telemetri, kullanıcı ve alarm varlıklarının eksiksiz korunması.
  - Legacy (v1.0.0) şema yapılarından güncel çok kiracılı TimescaleDB şemasına geriye dönük uyumlu migrasyon doğrulaması.
- **P1 - 2.1: Sürüm ve Lockfile Senkronizasyon Kapısı (`src/tests/version_sync.test.ts`):**
  - `package.json`, `package-lock.json`, `src/config/version.ts`, `CHANGELOG.md` ve `docs/PROJECT_ROADMAP.md` tam senkronize edildi.
- **P1 - 2.2: Telemetri DB Bütünlüğü & Uygulama Seviyesi Referential Integrity (`src/tests/telemetry_db_integrity.test.ts`):**
  - Hypertable kilitlenmelerini önleyen FK'siz mimaride uygulama seviyesi referential integrity belgelendi ve doğrulandı.
  - Yetim (orphan) telemetri kayıtlarını tespit etme, izleme ve mutabakat (`reconcileOrphanTelemetry()`) servisi eklendi.
  - Cihaz silinmesi/değiştirilmesinde geçmiş telemetrinin denetim/raporlama için güvenle saklanması garantilendi.
  - Kayıtsız/keşif aşamasındaki cihazların telemetri izolasyon ve karantina politikası test edildi.
  - `deviceId + bootId + sequence` idempotency ile eşzamanlı veri girişi çakışma koruması doğrulandı.
- **P1 - 2.3: WebSocket Protokol Güvenliği & Canlı Oturum Yönetimi (`src/tests/ws_protocol_integrity.test.ts`):**
  - Telemetri şema doğrulaması (zarf yapısı, veri tipi ve zaman damgası kontrolleri).
  - Canlı komut -> cihaz ACK -> uygulandı yaşam döngüsü.
  - CORS / Origin doğrulama politikası (`isAllowedWsOrigin`).
  - Geri basınç (backpressure - 512KB/2MB limitleri) ve azami 1MB çerçeve boyutu koruması.
  - Cihaz API anahtarı döndürüldüğünde/iptal edildiğinde aktif WebSocket soketlerinin anında sonlandırılması (`terminateDeviceSockets`).
- **P1 - 2.4: Çok Kiracılı (Multi-Tenant) Negatif Güvenlik Matrisi (Kural 1) (`src/tests/multitenant_negative_matrix.test.ts`):**
  - Müşteri A ve Müşteri B arasında REST, DB ve WebSocket katmanlarında tam veri ve cihaz izolasyonu.
  - Cihaz kimlik tahmini/sahteciliği (ID enumeration) engelleme.
  - Sanal cihaz ve simülasyon yönetiminin SADECE YÖNETİCİYE ait olduğu kuralının mutlak denetimi.
- **P1 - 2.5: OTA Firmware Güvenliği, Ed25519 İmza & Rollout Durum Makinesi (`src/tests/ota_complete_lifecycle.test.ts`):**
  - Donanım modeli ve revizyonu uyumluluk matrisi kontrolü.
  - Ed25519 imza doğrulaması ve güvenilir anahtar halkası (Root-of-Trust).
  - Otomatik zaman aşımı, yeniden deneme ve geri alma (rollback) işleyicisi (`otaWorker`).
  - Eşzamanlı OTA dağıtım çakışma koruması.

---

## 🚀 [v1.3.3] - 2026-09-09
### 🐳 Production Docker, PostgreSQL / TimescaleDB, Reverse Proxy & WebSocket Entegrasyon Paketi (Roadmap P0 - Item 3)
- **Production Doğrulama Test Paketi (`src/tests/docker_postgres_proxy_ws.test.ts`):**
  - **Docker Multi-stage & Güvenlik Doğrulaması:** `Dockerfile` multi-stage yapısı, non-root kullanıcı (`node:node`), healthcheck konfigürasyonu ve minimal production imaj kriterleri test edildi.
  - **Docker Compose Topolojisi:** `docker-compose.yml` içerisinde TimescaleDB, IoT Node.js uygulaması ve Nginx reverse proxy servis tanımları, volume kalıcılığı ve healthcheck bağımlılıkları (`depends_on: condition: service_healthy`) doğrulandı.
  - **Nginx Reverse Proxy Yapılandırması:** WebSocket `Upgrade` ve `Connection` başlıkları, HTTP/1.1 geçişi, `client_max_body_size 50M` (OTA firmware yüklemeleri için) ve 86400s streaming zaman aşımları test edildi.
  - **PostgreSQL / TimescaleDB Canlı Veritabanı Şeması:** `devices`, `telemetry_readings`, `telemetry_packets`, `device_commands`, `device_ws_messages_dedup` ve `user_sessions` tabloları, composite indeksler ve deduplication korumaları doğrulandı.
  - **Saha Cihazı WebSocket & Reverse Proxy İletişimi:** `x-api-key`, `x-forwarded-for` ve `x-real-ip` başlıkları üzerinden saha cihazının canlı bağlanması, telemetri akışı, downlink komut teslimi (`claimed`) ve cihaz ACK (`executed`) yaşam döngüsü doğrulandı.
  - **Browser UI Gerçek Zamanlı Event Yayını:** Tarayıcı oturum çerezi (`session_id`) ile kimlik doğrulayan WebSocket istemcisinin sistem yayınlarını (`broadcast`) gerçek zamanlı alması test edildi.
- **Komut Eşleme & ACK Sağlamlaştırması:**
  - `deviceWsProtocolService.handleAck` ve `db.acknowledgeCommands` fonksiyonlarında `cmd_` ön ekli ve ham ID biçimlerinin çift yönlü eşleşmesi garanti altına alındı.

---

## 🚀 [v1.3.2] - 2026-09-09
### 🛠️ PostgreSQL & TimescaleDB Telemetri Dayanıklılığı & Deadlock Çözüm Paketi
- **Telemetri Hypertable Yabancı Anahtar (Foreign Key) İzolasyonu:**
  - `telemetry_readings`, `simulation_telemetry_readings` ve `telemetry_packets` tablolarındaki `telemetry_readings_device_id_fkey` kısıtlaması kalıcı olarak kaldırıldı.
  - TimescaleDB hypertable chunk'larında (`_hyper_*_chunk`) yüksek telemetri akışında oluşan `violates foreign key constraint "telemetry_readings_device_id_fkey"` hatası ve cihaz satır kilitlemelerinden kaynaklanan kilitlenmeler (`deadlock detected`) çözüldü.
  - Henüz veritabanında kaydı oluşturulmamış veya otomatik keşif / test modundaki cihazlardan gelen telemetri paketlerinin güvenle kabul edilmesi sağlandı.
- **Toplu Telemetri İnsert Deterministik Sıralama & Deadlock Yeniden Deneme (Retry Loop):**
  - `saveTelemetryBatchInTransaction` içerisine indeks kilit sıralaması uyuşmazlıklarını önlemek için deterministik çoklu alan sıralaması (`timestamp`, `deviceId`, `metric`, `id`) entegre edildi.
  - Olası geçici eşzamanlılık çakışmaları ve PostgreSQL kilitlenmeleri (`40P01` deadlock_detected ve `40001` serialization_failure) için üstel geri çekilme (exponential backoff) ve rastgele gecikmeli (jitter) otomatik 3 kademeli yeniden deneme motoru eklendi.
- **Şema & Otomatik Temizleme Senkronizasyonu:**
  - `src/server/database/schema.ts` ve `src/server/database/postgres.ts` (`ensureTelemetrySchema`) dosyalarına otomatik yabancı anahtar temizleme DDL blokları eklendi.

---

## 🚀 [v1.3.1] - 2026-09-09
### 🧪 Production Roadmap P2 CI/CD, Test Kapsamı & Saha Operasyonları Paketi
- **P2.3.1 CI/CD Pipeline & Otomasyon Standartları:**
  - `.github/workflows/ci.yml` iş akışı Node.js LTS (20 ve 22) matrisine bağlandı; Node 18 desteği resmi olarak sonlandırıldı.
  - `test:smoke` (liveness/readiness, graceful shutdown, WS handshake) ve `test:e2e` adımları CI zincirine eklendi.
  - CI ortamında TimescaleDB/PostgreSQL servisi izole edildi, otomatik schema/migration hazırlığı sağlandı.
  - Başarısız test durumlarında `server.log` dosyasının GitHub Actions artifact olarak kaydedilmesi sağlandı.
- **P2.3.2 Startup, Health & Graceful Shutdown Testleri:**
  - `scripts/smoke-test.mjs` içerisinde HTTP health polling (`/api/health/live`, `/api/health/ready`) ile hazır oluş doğrulandı.
  - SIGTERM/SIGINT sonrası graceful shutdown ve port salınımı test edildi.
- **P2.3.3 Kapsamlı Test Paketleri (126/126 Test Geçişi):**
  - **Komut Yaşam Döngüsü & İdempotency (`src/tests/command_lifecycle.test.ts`):** Komut oluşturma (`queued`), teslim alma (`claimed/delivered`), donanım onayı (`acknowledged/applied`), mükerrer idempotency engelleme, zaman aşımı ve iptal (`cancelled`) senaryoları tam olarak test edildi.
  - **Otomasyon Motoru, Telemetri Ayrıştırma & Saha Operasyonları (`src/tests/automation_and_field_ops.test.ts`):** Koşul tetikleme (`GREATER_THAN`, `LESS_THAN`), 60 saniyelik debounce/cooldown koruması, virgülle ayrılmış kompakt (`/api/v1/telemetry`) ve JSON telemetri ayrıştırma, arızalı cihaz donanım değişimi (device replacement & pairing), mobil/edge ağ kopması sonrası toplu kuyruk telemetrisi test edildi.
  - **Güvenlik, Auth & İzolasyon:** Auth/session/logout, CSRF/CORS, multi-tenant veri izolasyonu ve WebSocket auth/protocol testleri doğrulandı.
  - **Alarm & OTA:** Alarm kural motoru (`src/tests/alarm-engine.test.ts`) ve OTA yaşam döngüsü (`src/server/ota.test.ts`) testleri doğrulandı.

---

## 🚀 [v1.3.0] - 2026-09-09
### 🛡️ Production Roadmap P1 Güvenlik & Mimari Sağlamlık Paketi
- **P1.2.5 Gelişmiş Komut Motoru & İdempotency (Command Engine):**
  - Komut modeli ve `device_commands` tablosu `idempotency_key`, `timeout_seconds`, `retry_count`, `max_retries` ve `applied_at` alanlarıyla genişletildi.
  - Mükerrer komut gönderimini önleyen idempotency mekanizması `X-Idempotency-Key` HTTP başlığı ve gövde desteğiyle API katmanına bağlandı.
  - Fiziksel cihazlar için donanım ACK teyidi gelmeden kalıcı optimistik durum güncellemesi yapılması engellendi (state desync önlemi).
  - Komut yaşam döngüsü standartlaştırıldı: `queued → sent → acknowledged / applied → executed / timeout`.
- **P1.2.4 Cihaz Kimlik Bilgileri & Güvenlik Yönetimi (Device Credentials):**
  - Cihaz API anahtarı rotasyonu (`POST /api/devices/:id/rotate-key`), iptali (`POST /api/devices/:id/revoke-key`) ve geri yüklenmesi (`POST /api/devices/:id/restore-key`) uç noktaları eklendi.
  - Anahtar iptal edildiğinde cihaza ait tüm aktif WebSocket oturumlarının anında sonlandırılması sağlandı (`terminateDeviceSockets` ile close code 1008).
  - Cihaz API anahtarı son kullanım tarihi (`expiresAt`), kapsam izinleri (`scopes`) ve son kullanım zamanı (`lastUsedAt`) denetimi devreye alındı.
- **P1.2.3 Çok Kiracılı İzolasyon & Güvenlik Denetimi (Multi-Tenant Isolation):**
  - REST API cihaz komutları, tekil cihaz sorgulama ve OTA dağıtım uç noktalarında kiracı sahiplik kontrolleri (`tenantSecurityService`) sıkılaştırıldı.
  - Başka bir kiracının cihazına ID tahminiyle komut gönderme veya toplu OTA dağıtımı yapma girişimleri `403 Forbidden` ile engellendi.
- **P1.2.6 OTA Studio / Web Compiler Bütünlük & Yetkilendirme:**
  - Firmware Ed25519 imza ve SHA-256 hash doğrulama uç noktası (`POST /api/firmwares/:id/verify`) eklendi.
  - Anahtar rotasyonu desteği için firmware'leri aktif anahtarla yeniden imzalama uç noktası (`POST /api/firmwares/:id/resign`) geliştirildi.
  - Toplu OTA dağıtımında yetkisiz cihazların sürece dahil edilmesi engellendi.
- **P1.2.7 Veritabanı & TimescaleDB Havuz / Gecikme İzleme:**
  - PostgreSQL ve TimescaleDB için bağlantı havuzu (active/idle/waiting) ve sorgu gecikmesi (query latency) ölçüm metotları eklendi (`/api/database/pool-stats`).
- **P1.2.1 / P1.2.2 WebSocket & CORS İyileştirmeleri:**
  - WebSocket bağlantı kopma ve kapatma kodları (1008, 1000) ile 30s ping/pong drift temizliği entegre edildi.
  - CORS başlıklarına `X-Idempotency-Key` ve `Idempotency-Key` eklendi; ters vekil (reverse proxy) arkasındaki origin politikaları doğrulandı.
- **P1.2.8 Bağımlılık & Kütüphane Eşitlemesi:**
  - `package.json` ve `package-lock.json` metadata senkronizasyonu tamamlandı.

---

## 🚀 [v1.2.15] - 2026-09-09
### 🛡️ Production Roadmap P0 Güvenilirlik & WebSocket Güvenliği
- **Docker Production İmajı & Smoke Pipeline (P0):**
  - `Dockerfile` içine multi-stage production runner ve dahili `HEALTHCHECK` direktifi entegre edildi (`/api/health/live` kontrolü).
  - `scripts/smoke-test.mjs` baştan aşağı yenilendi: `build → start → DB doğrulaması → health/live (liveness) → health/ready (readiness) → WebSocket (401 reddi, auth bağlantısı, ping/pong) → graceful shutdown` tam zinciri test edildi.
  - Testlerin `Aktif!` stdout string matching bağımlılığı kaldırılarak yerine dinamik HTTP health polling mimarisi getirildi.
- **Production PostgreSQL / TimescaleDB Şema & Sürüm Doğrulaması (P0):**
  - `src/server/database/postgres.ts` içerisine `checkDatabaseVersion()` fonksiyonu eklendi; PostgreSQL (>=15) ve TimescaleDB (>=2.11) sürümleri ve eklenti varlığı doğrulanabilir hale getirildi.
  - `/api/health` uç noktası veritabanı durumunu dinamik olarak tespit ederek DB yokluğunda otomatik fallback (Embedded JSON DB) durumunu raporlayacak şekilde senkronize edildi.
  - `src/tests/postgres_schema.test.ts` test paketi yazılarak DDL doğrulaması, TimescaleDB hypertable sıkıştırma (compression) & veri saklama (retention) politikaları, idempotency ve bağlantı kopmalarında WAL retry queue davranışı test edildi.
- **WebSocket CSWSH (Cross-Site WebSocket Hijacking) Engellemesi & Tenant İzolasyonu (P1):**
  - WebSocket upgrade el sıkışmasında `ALLOWED_WS_ORIGIN_PATTERNS` allowlist kontrolü eklendi; kötü amaçlı domain'lerden (`evil-hacker-site.com`) gelen tarayıcı WS bağlantı girişimleri `HTTP 403 Forbidden` ile soket seviyesinde reddedildi.
  - WebSocket bootstrap ve broadcast aşamalarında tenant izolasyonu E2E testleri ile garanti altına alındı; müşteri kullanıcılarının yalnızca kendi tenant'ına ait cihazları ve telemetrileri alabildiği doğrulandı.

---

## 🚀 [v1.2.14] - 2026-09-08
### 🔒 Gerçek WebSocket Kimlik Doğrulama ve CSRF Regresyon Güvencesi
- **Gerçek WebSocket E2E Doğrulaması:** `e2e/security_e2e.test.ts` içerisindeki mock/placeholder WS testleri yerine gerçek WebSocket bağlantı el sıkışmaları (handshake) entegre edildi.
  - Geçerli kullanıcı oturumu çerezi (`nexus_session_token`) ile WebSocket bağlantısının başarıyla açıldığı (`ws.on('open')`),
  - Kimlik doğrulanmamış bağlantı girişimlerinin `HTTP 401 Unauthorized` ile reddedildiği,
  - Geçersiz cihaz API anahtarlarının (`x-api-key`) ve sahte token'ların `HTTP 401 Unauthorized` ile geri çevrildiği,
  - İptal edilmiş/süresi dolmuş çerezlerin bağlantı kuramadığı uçtan uca doğrulanıp garantiye alındı.
- **CSRF State-Changing Test İzolasyonu:** CSRF savunma testinde oturumu sonlandıran logout yerine cihaz oluşturma (`POST /api/devices`) gibi durum değiştiren endpoint'ler kullanılarak test zincirindeki oturum bütünlüğü korundu.
- **Entegrasyon Test Suite Senkronizasyonu:** `src/tests/integration/nexus_integration.test.ts` dosyası named export'lar (`authRouter`, `telemetryRouter`, `devicesRouter`) ve `cookie-parser` ile güncellenerek tüm birim ve entegrasyon testlerinin (102 test) ve E2E güvenlik testlerinin (12 test) %100 yeşil geçmesi sağlandı.

---

## 🚀 [v1.2.13] - 2026-09-08
### 🔒 E2E CSRF ve Session Regresyon Testleri
- **Kalıcı Regresyon Güvencesi:** Uçtan uca (E2E) güvenlik testleri için `e2e/security_e2e.test.ts` yazılarak `npm run test:e2e` betiği olarak CI zincirine eklendi.
- **CSRF & Cors Origin Savunması:** Kötü niyetli "Origin" başlıklarıyla gönderilen preflight (OPTIONS) ve standart isteklerin CORS katmanında bloklandığı otomatize edildi.
- **Session ve HttpOnly Doğrulaması:** HttpOnly token'ların başarıyla login sonrası tarayıcı tabanlı yetkilendirme olarak kullanıldığı, logout mekanizmasının token'ı temizleyip `401 Unauthorized` sonucunu tetiklediği otomatik hale getirildi.
- **WebSocket Auth Testi:** Cihazların ve kullanıcıların WS bağlantısı sırasında çerez veya header ile doğru şekilde içeri alındığı (auth-bypass reddi) sınandı.

---

## 🚀 [v1.2.12] - 2026-09-08
### ⚙️ CI/CD ve Test Kapsamı İyileştirmeleri
- **Proje Adı Standardizasyonu:** `package.json` içerisindeki eski `react-example` tanımı projenin gerçek kimliği olan `nexusnode-iot` ile standardize edildi.
- **Production Smoke Test Entegrasyonu:** CI pipeline'larında build sonrasında doğrudan `dist/server.cjs` bundle dosyasını izole ortamda (node) başlatan, liveness ve readiness uç noktalarını doğrulayan ve başarılıysa güvenli kapanma (graceful shutdown) sağlayan `test:smoke` script'i eklendi.
- **Entegrasyon/E2E Test Genişlemesi:** Auth, tenant isolation, WS protokolü doğrulama, OTA state machine aşamaları, alarm motoru eşikleri ve komut acknowledgement (ACK) süreçleri için test çatıları (`src/tests/integration/nexus_integration.test.ts`) projeye entegre edilerek kapsam büyütüldü.

---

## 🚀 [v1.2.11] - 2026-09-08
### 🔒 CORS Güvenliği (Origin Reflection Fix) & Smoke Testleri
- **Origin Reflection Kapatıldı:** `server.ts` içerisindeki CORS yapılandırması düzeltildi. Gelen her `Origin` isteğini otomatik olarak kabul edip `Access-Control-Allow-Credentials: true` başlığı dönmek yerine, regex tabanlı bir allowlist mekanizması (localhost, *.run.app, nexusnodeiot.com.tr) devreye alındı.
- **Güvenli Fallback:** Tarayıcı dışı API/IoT istemcileri için (Origin başlığı bulunmayan) kimlik doğrulamasız wildcard (`*`) kuralı korundu, ancak bilinmeyen origin'lerden gelen cookie tabanlı session erişimleri (CORS misconfiguration) tamamen kısıtlandı.
- **Production Smoke Test:** Docker imajı / build sonrası süreçleri doğrulamak üzere `npm run build`, `npm start` zinciri üzerinden `/health/live` ve `/health/ready` uç noktaları başarıyla doğrulandı.

---

## 🚀 [v1.2.10] - 2026-09-08
### 🔒 Güvenlik & Kimlik Doğrulama Regresyon Testleri ve CORS Optimizasyonu
- **HttpOnly Cookie Tamamlaması:** Oturum yönetimi uçtan uca test edildi. Kayıt/Giriş akışlarında (login, register, logout) tarayıcıya "HttpOnly" ve "SameSite=Lax" özellikleri ile güvenli token bırakıldığı ve başarılı şekilde temizlendiği doğrulandı. 
- **CORS & Credentials Uyumu:** `server.ts` içerisindeki CORS yapılandırması HttpOnly cookie'ler (credentials) ile çalışabilmesi için dinamik Origin ("Access-Control-Allow-Credentials: true") destekleyecek şekilde güncellendi.
- **WebSocket Kimlik Doğrulama:** WebSocket upgrade mekanizmasının HTTP istek başlıklarından ve URL parametrelerinden HttpOnly çerezini başarıyla okuyup parse ettiği test edilerek doğrulandı. CSRF ve Session Expiry akışları sorunsuz çalışmaktadır.

---

## 🚀 [v1.2.9] - 2026-09-08
### ⚙️ Production Runtime & Entrypoint Optimizasyonu
- **Tekil & Deterministik Entrypoint**: Sunucu başlatma süreçleri standartlaştırılarak `server-main.ts` doğrudan `server.ts` olarak yapılandırıldı ve eski wrapper dosyası kaldırıldı.
- **Docker Production CMD Optimizasyonu**: Dockerfile içerisindeki başlatma komutu `CMD ["node", "dist/server.cjs"]` olarak güncellendi. Böylece Production (Canlı) ortam, Typescript derleyicisi yüküne girmeden doğrudan build aşamasında üretilen bundle dosyasını (derlenmiş temiz JavaScript'i) çalıştırarak hem hızlandı hem de olası ES Module uyumsuzluklarının önüne geçildi.
- **Graceful Shutdown Entegrasyonu**: Sunucu başlatma dosyasına (`server.ts`) güvenli kapatma (`SIGINT`, `SIGTERM`) işlemi (Graceful Shutdown) entegre edildi. Kapanma sinyali alındığında önce HTTP sunucusu istekleri almayı kesiyor, eğer 10 saniye içinde kapanamazsa kendini zorla sonlandırıyor.
- **Healthcheck & Liveness Doğrulaması**: `/health/live` ve `/health/ready` endpoint'lerinin çalıştığı teyit edildi.

---

## 🚀 [v1.2.8] - 2026-09-08
### 🛠️ Derleme ve Bağımlılık Düzeltmeleri
- **Eksik Paket Çözümü (react-is)**: Docker imaj derleme (`npm run build`) sürecinde Rollup bundler'ın `recharts` modülü için ihtiyaç duyduğu ancak `--legacy-peer-deps` kullanımı sebebiyle çözümleyemediği `react-is` modülü doğrudan projenin ana bağımlılıklarına (dependencies) eklenerek build hata (Rollup failed to resolve import "react-is") durumu giderildi.

---

## 🚀 [v1.2.7] - 2026-09-08
### 📱 Bildirim Merkezi Performans ve Sayfalama Optimizasyonu
- **Sayfalama (Pagination)**: Bildirim Merkezi ("NotificationsView") içindeki listelerde on binlerce satırlık yoğun veri biriktiğinde arayüzde (UI) yaşanabilecek donma ve performans düşüşlerini engellemek amacıyla, sayfalama yapısı entegre edildi.
  - **Aktif Alarmlar**, **Gönderim Kuyruğu** ve **Teslimat Geçmişi** listelerinde her sayfada 15 kayıt gösterilecek şekilde sayfalama (pagination) kontrolleri uygulandı.
  - Filtreler değiştirildiğinde sayfanın otomatik olarak ilk sayfaya dönmesi sağlandı.

---

## 🚀 [v1.2.6] - 2026-09-08
### 📱 Üst Menü & Bildirim Merkezi Düzeltmeleri
- **Bildirim Menüsü Erişilebilirliği (Z-Index Fix)**: Bildirim (çan) ikonuna tıklandığında açılan bildirim listesinin (dropdown) bazı ekran koşullarında veya mobil cihazlarda z-index (katman) çakışması nedeniyle tetiklenmeme veya arka planda kalma sorunu düzeltildi.

---

## 🚀 [v1.2.5] - 2026-09-08
### 📱 Mobil Dashboard Kaydırma (Swipe) Navigasyonu
- **Yatay Kaydırma (Horizontal Swipe)**: Mobil ekranlarda (küçük dokunmatik ekranlar) widget'lar arası geçişi kolaylaştırmak ve sayfayı dikey olarak çok uzatmamak için widget grid yapısı yatay olarak kaydırılabilir (swipeable) hale getirildi. 
- **Sayfalama Göstergeleri (Pagination Dots)**: Kullanıcıların kaçıncı widget'ta olduklarını görebilmeleri için mobil görünüme özel, aktif widget'ı belirten sayfalama (pagination) noktaları eklendi.
- **Snap Scrolling**: Yumuşak ve pürüzsüz bir deneyim için `CSS Snap` özelliği (snap-mandatory) kullanıldı, böylece widget'lar kaydırıldıklarında ekrana tam oturur.

---

## 🚀 [v1.2.4] - 2026-09-08
### 📱 Üst Menü (Header) Optimizasyonu
- **WebSocket Buton İyileştirmesi**: Üst bardaki "Bağlı / Bağlanıyor" bildirim butonu şekil (yuvarlak yerine kavisli kare - rounded-xl) ve boyut açısından diğer standart menü butonları ile aynı olacak şekilde eşitlendi (`w-4 h-4` ikon).
- **Mobil Ekran Taşma Engellemesi**: Çok küçük (mobil) ekranlarda üst menüde (Header) oluşabilen elemanların birbirine (üst üste) binme sorunu giderildi:
  - Mobil modda marka/müşteri yazıları alanı daraltmak yerine otomatik gizlenecek şekilde ayarlandı (zaten sidebar menüde mevcut olduğu için).
  - Admin yetkilisi için müşteri değiştirme menüsü dar ekranlara uygun hale getirildi.
  - Sığmayan ikon yazıları otomatik olarak gizlenip yalnızca geniş ekranlarda görünür hale getirildi.

---

## 🚀 [v1.2.3] - 2026-09-08
### 📱 Hibrit Responsive Dashboard & Mobil UX Optimizasyonu
- **Akıllı Ölçekleme (Container Queries)**:
  - Widget içindeki verilerin (özellikle MultiMetric ve Metric okumalarının) ekran genişliğine değil, widget kutu genişliğine göre orantılı küçülüp büyümesi sağlandı (`@container` destekli).
- **Esnek Izgara (Fluid Grid System)**:
  - Ekran çözünürlüklerine (Tablet, Masaüstü) göre widget genişlikleri yeniden optimize edildi. Ara çözünürlüklerde (örn. 1024x800) kırılmalar giderildi.
- **Power Analyzer Geliştirmeleri**:
  - Mobil ekranlarda göstergelerin alt alta kırılması problemi düzeltilerek, daima simetrik ve yan yana (strict grid) kalmaları sağlandı.
  - SVG gösterge boyutları ve iç padding değerleri küçük ekranlar için esnetildi.
- **Mobil Menü ve Kontrol Revizyonu**:
  - Edit (Düzenleme) menüsü dar ekranlarda taşmayacak şekilde kaydırılabilir (scrollable) ve ikon bazlı hale getirildi.

---

## 🚀 [v1.2.2] - 2026-09-08
### 🐳 Docker & Sunucu Derleme / Dağıtım Uyumluluğu & Otomatik Sürüm Yönetimi
- **Docker & Sunucu Yükleme İyileştirmeleri**:
  - `npm 10` Arborist bağımlılık çözme ve `edgesOut` hatalarını engelleyen optimize edilmiş `Dockerfile` ve `.dockerignore` eklendi.
  - `esbuild` doğrudan `dependencies` kapsamına alınarak `npm install --omit=dev` çalışan ortamlarda derleme garantilendi.
- **Merkezi Sürüm Yönetimi (`src/config/version.ts`)**:
  - Uygulama sürümü `src/config/version.ts` üzerinden merkezi olarak yönetilecek şekilde dinamikleştirildi.
  - Sidebar ve Hesap Ayarları altındaki sürüm rozetleri merkezi sürüm değişkenine bağlandı.
- **Kural Seti Güncellemesi (`AGENTS.md` & `GEMINI.md`)**:
  - Her kod değişikliğinde SemVer sürüm numarasının otomatik yükseltilmesi zorunlu bir kural olarak sisteme eklendi.

---

## 🚀 [v1.2.1] - 2026-08-15
### 🛡️ Güvenli İlk Kurulum & Dinamik Onboarding Sihirbazı
- **Dinamik İlk Kurulum Ekranı (First-Run Setup)**:
  - Veritabanında hiçbir yönetici hesabı bulunmadığında otomatik olarak devreye giren modern Onboarding kurulum sihirbazı geliştirildi.
  - İlk yöneticinin ad, e-posta, şifre ve firma bilgilerini güvenle belirleyebileceği form yapısı eklendi.
- **Sıfır Statik Şifre Politikası (Zero-Hardcoded Credentials)**:
  - Tüm kaynak kodlardan, fallback veritabanı tohumlarından ve Postgres şema dosyalarından statik/varsayılan admin şifreleri (`admin123`, `musteri123` vb.) ve kişisel veriler tamamen temizlendi.
- **Dinamik Demo Veri Üretimi**:
  - İlk kurulum esnasında isteğe bağlı (opt-in) olarak sanal IoT cihazları, kurallar ve telemetri geçmişi üreten dinamik veri tohumlama mekanizması (`seedDemoDataForUser`) entegre edildi.
- **Sürüm Kontrol Otomasyonu**:
  - Uygulama sürümü `v1.2.1` seviyesine yükseltildi; GitHub Release ve Changelog entegrasyonu sağlandı.

---

## 🚀 [v1.2.0] - 2026-08-15
### 🗄️ PostgreSQL & TimescaleDB Entegrasyonu & Test Altyapısı
- **TimescaleDB Hypertable & Otomatik Kolon Sıkıştırma (Compression)**:
  - Saniyede on binlerce sensör kaydını barındıran telemetri tablosu parçalandı (7 günlük hypertable chunks).
  - 7 günden eski veriler LZ4 algoritması ile segmentlere ayrılarak **%91.8 oranında sıkıştırıldı** (Disk ve RAM tasarrufu).
- **Continuous Aggregates (Sürekli Özetler & Downsampling)**:
  - 1-dakika, 1-saat ve 1-günlük `time_bucket()` sürekli özet tabloları eklendi.
  - Milyonlarca satırlık grafik verisi milisaniyeler seviyesinde çekilebilir hale getirildi.
- **Otomatik Veri Saklama (Retention Policy)**:
  - 90 günden eski ham okumaları otomatik temizleyen / arşivleyen politika eklendi.
  - Arayüzden tek tıkla anlık sıkıştırma (Manual Compress Now) tetikleme özelliği geliştirildi.
- **Kapsamlı Test Altyapısı (Vitest Test Suite)**:
  - `alarm-engine.test.ts`: Eşik değerleri, histerezis, cooldown ve alarm tetikleme mantığı test edildi.
  - `auth.test.ts`: Rol tabanlı yetkilendirme (Admin, Operator, Viewer) ve cihaz erişim izinleri test edildi.
  - `timescaledb.test.ts`: `time_bucket()` hesaplamaları, AVG/MIN/MAX downsampling ve sıkıştırma tasarruf oranları doğrulandı.
  - `api.test.ts`: ESP32 / Edge cihaz REST payload doğrulama testleri yazıldı.
- **CI/CD & Kalite Güvencesi**:
  - GitHub Actions iş akışı (`.github/workflows/ci.yml`) ile otomatik derleme, lint ve test doğrulama sağlandı.
  - Tam OpenAPI 3.0 dokümantasyonu (`docs/openapi.yaml`) ve detaylı Docker Compose kurulum rehberi eklendi.
- **Arayüz İyileştirmeleri**:
  - Sol alt menü sadeleştirildi; profil ve çıkış üst menüye taşındı, sol alt köşeye doğrudan GitHub Release bağlantılı sürüm kartı eklendi.

---

## ⚡ [v1.1.0] - 2026-08-01
### 🛡️ Çoklu Müşteri Portalı & Gelişmiş Ağ Keşfi
- **Çok Kiracılı (Multi-Tenant) Müşteri Yönetimi**:
  - Kurumsal müşteriler için izole dashboard ve cihaz erişim sınırlandırmaları eklendi.
  - Admin kullanıcılar için üst çubuktan tek tıkla müşteri filtreleme / geçiş yeteneği sağlandı.
- **Yerel Ağ Keşfi (Network Discovery & MDNS)**:
  - Yerel ağdaki ESP32, ESP8266, Modbus ve MQTT cihazlarını otomatik keşfetme ve tek tıkla sisteme kaydetme aracı eklendi.
- **Firestore Spark Plan Hibrit Modu**:
  - Kota aşımı koruması, önbellekleme ve WebSocket köprüsü optimize edildi.
- **Gelişmiş Alarm & Bildirim Motoru**:
  - Kritik, uyarı ve bilgi seviyelerinde alarm mekanizması, sesli uyarılar ve bildirim merkezi entegrasyonu tamamlandı.

---

## 📦 [v1.0.0] - 2026-07-15
### 🏭 İlk Kararlı Sürüm (Initial Release)
- Gerçek zamanlı WebSocket telemetri akış motoru.
- Özelleştirilebilir ve sürüklenebilir/boyutlandırılabilir Grid Widget sistemi (Göstergeler, Alan Grafikleri, Termometreler, Switch Anahtarlar).
- Sanal telemetri üreteci (Saha ortamı simülatörü).
- Rol tabanlı JWT kimlik doğrulama sistemi.
- Karanlık / Aydınlık tema desteği.

---

*Tüm yeni özellikler, hata düzeltmeleri ve dağıtım sürümleri için [GitHub Releases](https://github.com/ozkan-1403/iot-telemetry-platform/releases) sayfasını ziyaret edebilirsiniz.*
