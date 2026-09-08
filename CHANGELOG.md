# 📦 Proje Sürüm Geçmişi & Değişiklik Günlüğü (Changelog)

Bu belgede **Industrial IoT Analytics & Dashboard** platformunun tüm sürümleri, sürüm içerikleri ve yapılan geliştirmeler kronolojik olarak listelenmektedir.

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
