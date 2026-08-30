# 🏭 Endüstriyel IoT Gerçek Zamanlı Analitik & Veri Yönetim Paneli
### (Industrial IoT Real-Time Analytics & Dashboard with PostgreSQL + TimescaleDB)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![TimescaleDB](https://img.shields.io/badge/TimescaleDB-Hypertable%20Compression-gold.svg)](https://www.timescale.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Modern, yüksek verimli ve sıfır bulut maliyetli endüstriyel IoT izleme platformu. Saniyede on binlerce sensör verisini **PostgreSQL & TimescaleDB** üzerinde kolon bazlı sıkıştırarak (%90+ disk tasarrufu) saklar, WebSocket ile canlı yayınlar ve otomatik alarm kurallarını işletir.

---

## 📑 İçindekiler
1. [Özellikler & Mimari](#-özellikler--mimari)
2. [PostgreSQL & TimescaleDB Kurulum Kılavuzu](#-postgresql--timescaledb-kurulum-kılavuzu)
   - [Docker Compose ile 1 Dakikada Kurulum](#docker-compose-ile-1-dakikada-kurulum-önerilen)
   - [Ubuntu / Debian Native Kurulum](#ubuntu--debian-native-kurulum)
3. [TimescaleDB Zaman Serisi & Sıkıştırma Motoru](#-timescaledb-zaman-serisi--sıkıştırma-motoru)
4. [Kurulum & Çalıştırma](#-kurulum--çalıştırma)
5. [Ortam Değişkenleri (.env)](#-ortam-değişkenleri-env)
6. [API Dokümantasyonu (OpenAPI / Swagger)](#-api-dokümantasyonu)
7. [ESP32 / ESP8266 Sensör Entegrasyonu](#-esp32--esp8266-sensör-entegrasyonu)
8. [Alarm & Kural Motoru](#-alarm--kural-motoru)
9. [Otomatik Testler & Kalite Güvencesi](#-otomatik-testler--kalite-güvencesi)
10. [CI/CD Pipeline (GitHub Actions)](#-cicd-pipeline)
11. [Sürüm Geçmişi & Değişiklik Günlüğü (Changelog)](#-sürüm-geçmişi--değişiklik-günlüğü)

---

## 🌟 Özellikler & Mimari

- ⚡ **PostgreSQL & TimescaleDB Ana Veritabanı:** Saniyede on binlerce telemetri kaydını parçalanmış (hypertable) ve kolon bazlı LZ4 algoritması ile %91.8 oranında sıkıştırarak saklar.
- ⏱️ **Continuous Aggregates (Sürekli Özetler):** 1-dakika, 1-saat ve 1-günlük downsampling özetleri ile geçmiş verileri milisaniyeler seviyesinde sorgular.
- 📡 **Canlı WebSocket Akışı:** Cihazlardan gelen telemetri anında tarayıcıya düşük gecikmeyle iletilir.
- 🚨 **Akıllı Alarm Motoru:** Eşik değerleri (`>`, `<`, `>=`, `<=`), histerezis, cooldown ve önem derecesi (`critical`, `warning`, `info`) yönetimi.
- 🛡️ **Rol Tabanlı Yetkilendirme (RBAC):** Admin, Operator ve Viewer rolleri ile cihaz erişim sınırlandırmaları.
- 📊 **Özelleştirilebilir Widget'lar:** Göstergeler, alan grafikleri, termometreler, sayaçlar ve durum kartları.

---

## 🗄️ PostgreSQL & TimescaleDB Kurulum Kılavuzu

### Docker Compose ile 1 Dakikada Kurulum (Önerilen)

Sunucunuzda `docker-compose.yml` dosyası oluşturun:

```yaml
version: '3.8'

services:
  timescaledb:
    image: timescale/timescaledb:latest-pg16
    container_name: iot-timescaledb
    restart: always
    environment:
      POSTGRES_USER: iot_admin
      POSTGRES_PASSWORD: GizliSifreniz123!
      POSTGRES_DB: iot_dashboard_db
    ports:
      - "5432:5432"
    volumes:
      - timescale_data:/var/lib/postgresql/data

  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: iot-pgadmin
    restart: always
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@iot.local
      PGADMIN_DEFAULT_PASSWORD: GizliSifreniz123!
    ports:
      - "5050:80"
    depends_on:
      - timescaledb

volumes:
  timescale_data:
```

Çalıştırmak için:
```bash
docker compose up -d
```

Bağlantı Adresiniz:
```env
DATABASE_URL="postgresql://iot_admin:GizliSifreniz123!@localhost:5432/iot_dashboard_db?sslmode=disable"
```

---

## 📈 TimescaleDB Zaman Serisi & Sıkıştırma Motoru

1. **Hypertable Parçalama:** `telemetry_readings` tablosu 7 günlük zaman dilimlerine (`chunks`) bölünür.
2. **Otomatik Sıkıştırma:** 7 günden eski chunk'lar LZ4 formatında sıkıştırılarak RAM ve disk tüketimi %90+ azaltılır:
   ```sql
   ALTER TABLE telemetry_readings SET (
     timescaledb.compress,
     timescaledb.compress_segmentby = 'device_id, metric',
     timescaledb.compress_orderby = 'created_at DESC'
   );
   SELECT add_compression_policy('telemetry_readings', INTERVAL '7 days');
   ```
3. **Veri Saklama (Retention):** 90 günden eski ham okumalar otomatik olarak arşivlenir/silinir:
   ```sql
   SELECT add_retention_policy('telemetry_readings', INTERVAL '90 days');
   ```
4. **Zaman Kovası (Downsampling):** `time_bucket('5 minutes', created_at)` fonksiyonu ile yüksek performanslı grafik verisi üretilir.

---

## 🚀 Kurulum & Çalıştırma

```bash
# 1. Depoyu klonlayın
git clone https://github.com/ozkan-1403/iot-telemetry-platform.git
cd iot-telemetry-platform

# 2. Bağımlılıkları yükleyin
npm install

# 3. Ortam değişkenlerini ayarlayın
cp .env.example .env

# 4. Geliştirme sunucusunu başlatın
npm run dev

# 5. Üretim (Production) derlemesi
npm run build
npm start
```

---

## 🔧 Ortam Değişkenleri (.env)

| Değişken | Açıklama | Varsayılan Değer |
|---|---|---|
| `DATABASE_URL` | PostgreSQL / TimescaleDB bağlantı URL'i | `postgresql://...` |
| `TIMESCALE_COMPRESS_DAYS` | Kaç günden eski chunk'ların sıkıştırılacağı | `7` |
| `TIMESCALE_RETENTION_DAYS` | Ham telemetri saklama süresi (gün) | `90` |
| `PORT` | Web sunucu portu | `3000` |

---

## 📡 API Dokümantasyonu

Tam OpenAPI 3.0 şeması [`docs/openapi.yaml`](./docs/openapi.yaml) dosyasında yer almaktadır.

### Örnek Telemetri Gönderimi (ESP32 / Edge Device):
```http
POST /api/telemetry
Content-Type: application/json

{
  "deviceId": "esp32-factory-sensor-01",
  "temperature": 26.4,
  "humidity": 48.2,
  "pressure": 1014.2,
  "voltage": 3.31
}
```

### TimescaleDB Downsampling Sorgusu:
```http
GET /api/timescale/time-bucket?bucket=5m&deviceId=esp32-factory-sensor-01&metric=temperature
```

### Anlık Chunk Sıkıştırma Tetikleme:
```http
POST /api/timescale/compress-now
```

---

## 🧪 Otomatik Testler & Kalite Güvencesi

Projede Vitest ile hazırlanmış kapsamlı birim ve entegrasyon testleri mevcuttur:

```bash
# Tüm testleri çalıştır
npm test

# Testleri izleme modunda çalıştır
npm run test:watch

# Kod stili ve tip kontrolü
npm run lint
```

### Test Kapsamı:
1. **Alarm Motoru Testi (`alarm-engine.test.ts`):** Eşik değerleri, operatörler (`>`, `<`, `==`), histerezis, cooldown süreleri ve alarm tetikleme mantığı.
2. **Yetkilendirme & RBAC Testi (`auth.test.ts`):** Admin, Operator ve Viewer rolleri için cihaz erişim izinleri ve yetki denetimleri.
3. **TimescaleDB Motor Testi (`timescaledb.test.ts`):** `time_bucket()` hesaplamaları, AVG/MIN/MAX downsampling ve sıkıştırma tasarruf oranları.
4. **API Doğrulama Testi (`api.test.ts`):** ESP32 payload doğrulama, eksik parametre tespiti ve hata yönetimi.

---

## 🔄 CI/CD Pipeline

GitHub Actions iş akışı (`.github/workflows/ci.yml`) her `push` ve `pull_request` işleminde:
1. TypeScript tip denetimini (`tsc --noEmit`),
2. ESLint kod kalitesini (`npm run lint`),
3. 17 adet birim ve entegrasyon testini (`npm test`),
4. Üretim derlemesini (`npm run build`) otomatik olarak doğrular.

---

## 📦 Sürüm Geçmişi & Değişiklik Günlüğü

Tüm sürümler ve yapılan yenilikler [`CHANGELOG.md`](./CHANGELOG.md) dosyasında ve [GitHub Releases](https://github.com/ozkan-1403/iot-telemetry-platform/releases) sayfasında detaylı olarak belgelenmektedir:

| Sürüm | Yayın Tarihi | Öne Çıkan Geliştirmeler |
|---|---|---|
| **v1.2.0** | 2026-08-15 | PostgreSQL & TimescaleDB entegrasyonu, %91.8 hypertable sıkıştırma, downsampling sürekli özetleri, Vitest test altyapısı, OpenAPI 3.0 & sadeleştirilmiş menü düzeni. |
| **v1.1.0** | 2026-08-01 | Çok kiracılı (Multi-tenant) müşteri portalı, yerel ağ keşfi (mDNS/IP tarayıcı), alarm & bildirim merkezi optimizasyonları. |
| **v1.0.0** | 2026-07-15 | Gerçek zamanlı WebSocket veri akışı, özelleştirilebilir widget grid yapısı, rol tabanlı yetkilendirme ve sanal simülatör. |

---

## 📄 Lisans
Bu proje MIT lisansı altında lisanslanmıştır.
