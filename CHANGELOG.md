# 📦 Proje Sürüm Geçmişi & Değişiklik Günlüğü (Changelog)

Bu belgede **Industrial IoT Analytics & Dashboard** platformunun tüm sürümleri, sürüm içerikleri ve yapılan geliştirmeler kronolojik olarak listelenmektedir.

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
