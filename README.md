# 🌐 NexusNode IoT Cloud

> **Endüstriyel Gerçek Zamanlı Telemetri, Çift Yönlü Cihaz Kontrolü, Kademeli Veri Depolama (TimescaleDB) ve Güvenli Kasa (Vault) Platformu**

![Sürüm](https://img.shields.io/badge/Sürüm-v1.47.0-blue.svg)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg?logo=docker&logoColor=white)
![TimescaleDB](https://img.shields.io/badge/TimescaleDB-PostgreSQL_16-FDB515.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg?logo=typescript&logoColor=white)
![Lisans](https://img.shields.io/badge/Lisans-Proprietary-red.svg)

---

## 📑 İçindekiler

1. [Platform Genel Bakış](#-platform-genel-bakış)
2. [⚡ Tek Komutla Sıfır Sunucu Kurulumu (Zero-Touch All-in-One Installer)](#-tek-komutla-sıfır-sunucu-kurulumu-zero-touch-all-in-one-installer)
3. [🛠️ CLI Seçenekleri ve Parametreler](#️-cli-seçenekleri-ve-parametreler)
4. [🔒 Güvenlik Mimarisi & Kasa (Vault) İzolasyonu](#-güvenlik-mimarisi--kasa-vault-izolasyonu)
5. [📦 Konteyner Topolojisi (Docker Compose)](#-konteyner-topolojisi-docker-compose)
6. [🔌 Genişletilebilir Eklenti Mimarisi (Plugins & Hooks)](#-genişletilebilir-eklenti-mimarisi-plugins--hooks)
7. [💾 Afet Kurtarma, Yedekleme & Geri Yükleme (Disaster Recovery)](#-afet-kurtarma-yedekleme--geri-yükleme-disaster-recovery)
8. [📖 Adım Adım Manuel Kurulum (Alternatif)](#-adım-adım-manuel-kurulum-alternatif)
9. [💻 Yerel Geliştirici Modu (Local Development)](#-yerel-geliştirici-modu-local-development)
10. [👤 İlk Giriş ve SuperAdmin Oluşturma (Onboarding)](#-ilk-giriş-ve-superadmin-oluşturma-onboarding)

---

## 🌟 Platform Genel Bakış

NexusNode IoT Cloud; donanım saha cihazlarından (ESP32, ESP8266 NodeMCU, Raspberry Pi, endüstriyel gateway'ler) gelen yüksek frekanslı telemetri verilerini milisaniyelik gecikmeyle toplayan, analiz eden ve çift yönlü komut ileten kurumsal bir IoT yönetim platformudur:

- **Çift Yönlü İletişim**: REST API, Persistent WebSocket duplex kanalları ve Piggybacking komut iletimi.
- **Kademeli Depolama (3-Tier Storage)**: TimescaleDB üzerinde sıcak ham veri (0-14 gün), ılık sıkıştırılmış veri (14-365 gün) ve soğuk özetler (1-5 yıl).
- **Dayanıklı Veri Güvenliği**: Sıfır veri kaybı için disk tabanlı Physical WAL kuyruğu ve otomatik veritabanı onarım motoru.
- **Güvenli OTA Studio**: Ed25519 eliptik eğri imza doğrulamalı donanım yazılımı güncelleme sistemi.
- **Sıfır-Plaintext Kasa**: Tüm hassas anahtarlar AES-256-GCM ile diskte şifrelenir; ortam değişkenlerine düz metin şifre sızdırılmaz.

---

## ⚡ Tek Komutla Sıfır Sunucu Kurulumu (Zero-Touch All-in-One Installer)

Yeni kiralanmış veya sıfır bir Linux sunucuya (Ubuntu 20.04/22.04/24.04, Debian 11/12, CentOS, AlmaLinux, Rocky Linux) SSH ile bağlandıktan sonra sistemi **tek komutla** kurabilirsiniz.

### 1. Hızlı Kurulum (Tam Otomatik Sessiz Mod)

```bash
# 1. Depoyu sunucunuza çekin ve klasöre girin:
git clone https://github.com/ozkandortboluk/iot-dashboard.git && cd iot-dashboard

# 2. Tek komutla kurulumu başlatın:
chmod +x install.sh && ./install.sh --quick
```

Bu tek komut arka planda şu işlemleri sırasıyla kendi kendine tamamlar:
1. Donanım ve mimari analizi yapar (CPU x86_64/arm64, RAM, disk alanı, 80/443/3000/5432 port kontrolleri).
2. Sistemde Docker ve Docker Compose kurulu değilse resmi depodan otomatik kurar ve servisi başlatır.
3. 256-bit AES Vault root anahtarını (`secrets/encryption_key`) `chmod 600` izinleriyle oluşturur.
4. Kriptografik JWT secret ve Ed25519 OTA imzalama anahtarını üretir.
5. TimescaleDB için rastgele yüksek entropili parola belirleyip izole ağını kurar.
6. `.env` üretim dosyasını yapılandırır.
7. Nginx için Subject Alternative Name (SAN) destekli güvenli TLS sertifikalarını (`docker/certs/`) hazırlar.
8. `docker compose up -d --build` ile servisleri ayağa kaldırıp sağlık kontrollerini (healthcheck) doğrular.

---

### 2. Canlı Alan Adı ve SSL Sertifikası İle Kurulum

Eğer sunucunuzun IP adresine yönlendirilmiş bir alan adınız (domain) varsa:

```bash
./install.sh --domain iot.sirketim.com --email admin@sirketim.com
```

Kurulum tamamlandığında web arayüzünüze doğrudan **`https://iot.sirketim.com`** üzerinden erişebilirsiniz.

---

## 🛠️ CLI Seçenekleri ve Parametreler

`./install.sh` betiği gelişmiş operasyonel bayrakları (flags) destekler:

| Parametre | Açıklama |
|---|---|
| `-q`, `--quick` | Etkileşimsiz sessiz kurulum. Tüm soruları varsayılan güvenli ayarlarla geçer. |
| `-d`, `--domain <alan_adi>` | Web arayüzü ve SSL için alan adı tanımlar (örn: `iot.sirketim.com`). |
| `-e`, `--email <eposta>` | Sistem bildirimleri ve Let's Encrypt SSL sertifikası için e-posta adresi. |
| `--http-only` | SSL (443) yerine yalnızca HTTP (80) portunu yapılandırır (Ters proxy arkasındaysa). |
| `--check` | Kurulum yapmadan yalnızca sistem donanımını ve port çakışmalarını denetler (Dry-run). |
| `--init-only` | Yalnızca `secrets/`, `.env` ve sertifikaları hazırlar; Docker konteynerlerini başlatmaz. |
| `--status` | Çalışan tüm servislerin, portların ve Kasa (Vault) root anahtarının sağlık durumunu gösterir. |
| `--backup` | TimescaleDB veritabanı yedeğini (`pg_dump`), Kasa sırlarını ve ayarları zaman damgalı arşivler. |
| `--restore <arsiv.tar.gz>` | Alınan afet yedeğini sisteme geri yükler. |
| `--update` | Git güncellemelerini çeker (mevcutsa), secret migration ve docker compose doğrulamasını tamamlayıp konteynerleri günceller. |
| `-h`, `--help` | Yardım menüsünü ve parametre listesini görüntüler. |

---

## 🔒 Güvenlik Mimarisi & Kasa (Vault) İzolasyonu

NexusNode IoT platformu kurumsal düzeyde **Zero-Plaintext** güvenlik politikasını benimser:

```
[VPS Host Ortamı (Root)]
  └── /secrets/encryption_key (POSIX 0600 - Yalnızca root erişebilir)
            │
            ▼ Docker Secret Mount (/run/secrets/encryption_key)
[NexusNode App Konteyneri (İzole)]
  ├── AES-256-GCM Master Key Unlocks Central Vault
  ├── PostgreSQL Veritabanı Parolası (db.password)
  ├── JWT & Oturum İmzası (jwt.secret)
  ├── Ed25519 OTA Firmware Özel Anahtarı (ota.signing_key)
  └── E-posta & Webhook API Tokenları
```

1. **Hiçbir Plaintext Parola Sızmaz**: `docker-compose.yml` içinde `DB_PASSWORD` veya `JWT_SECRET` gibi düz metin değişkenler bulunmaz.
2. **Kasa (Vault)**: Tüm sırlar disk üzerinde `data/.system_secrets.json` veya PostgreSQL `system_settings` tablosunda AES-256-GCM ile şifrelenir.
3. **Fail-Closed İlkesi**: Üretim VPS modunda `/run/secrets/encryption_key` bulunamazsa sistem güvenlik ihlali riskine karşı kendini anında durdurur (fail-closed).

---

## 📦 Konteyner Topolojisi (Docker Compose)

Platform `docker-compose.yml` üzerinde 4 ana servisle mikro-servis mimarisinde koşar:

```
                       [ İnternet / Cihazlar ]
                                  │
                                  ▼ (Port 80 / 443)
                      ┌───────────────────────┐
                      │   nexus_proxy (Nginx) │
                      └───────────┬───────────┘
                                  │ (Reverse Proxy & WebSocket Upgrade)
                                  ▼ (İç Ağ: nexus_net)
                      ┌───────────────────────┐
                      │    nexus_app (Node)   │
                      └───────────┬───────────┘
                                  │ (TimescaleDB Client / Port 5432)
                                  ▼
                      ┌───────────────────────┐
                      │   nexus_timescaledb   │
                      └───────────────────────┘
```

1. **`proxy` (Nginx:Alpine)**:
   - Dış dünyaya açık portlar: `80` (HTTP) ve `443` (HTTPS).
   - Uzun ömürlü IoT WebSocket bağlantıları için 86400s timeout ve buffer disable ayarları.
   - Büyük OTA binary yüklemeleri için 50M payload limiti.
   - Let's Encrypt ACME doğrulaması (`/.well-known/acme-challenge/`).
2. **`app` (Node.js & Express)**:
   - Port 3000 (yalnızca yerel loopback veya iç Docker ağında dinler, dışarıya kapalıdır).
   - Docker Secret (`encryption_key`) ile kilitlenen AES Kasa.
   - Canlılık (`/health/live`) ve hazırlık (`/health/ready`) kontrolleri.
3. **`timescaledb` (Timescale/TimescaleDB 2.30.1-pg16)**:
   - Zaman serisi hiper-tabloları (`telemetry_readings`).
   - Sıkıştırma (columnar compression) ve sürekli özet (continuous aggregate) motoru.
   - Otomatik `pg_isready` sağlık denetimi.
4. **`adminer` (Veritabanı Yönetim Konsolu)**:
   - Güvenlik gerekçesiyle yalnızca `127.0.0.1:8080` yerel döngüsünde dinler; internete açık değildir.

---

## 🔌 Genişletilebilir Eklenti Mimarisi (Plugins & Hooks)

Sisteme gelecekte çekirdek koda dokunmadan yeni servisler veya altyapı araçları (örneğin **Mosquitto MQTT Broker**, **Prometheus/Grafana**, **Cloudflare Tunnel**, **Telegram Botu**) eklemek mümkündür.

`scripts/setup/plugins.d/` klasörüne ekleyeceğiniz herhangi bir `.sh` betiği yaşam döngüsünde otomatik çağrılır:

```bash
#!/usr/bin/env bash
# scripts/setup/plugins.d/20-benim-servisim.sh
STAGE="$1"

case "$STAGE" in
  "pre-install")
    echo "Sistem kontrolleri öncesi hazırlık..."
    ;;
  "pre-start")
    echo "Konteynerler kalkmadan önceki özel ayarlar..."
    ;;
  "post-start")
    echo "Tüm servisler başarıyla ayağa kalktığında yapılacak işlem..."
    ;;
esac
```

---

## 💾 Afet Kurtarma, Yedekleme & Geri Yükleme (Disaster Recovery)

### Tam Sistem Yedeği Alma

Tek bir komutla çalışan PostgreSQL veritabanı dökümünü (`pg_dump`), AES Kasa anahtarlarını, disk verilerini ve `.env` yapılandırmasını zaman damgalı tek bir arşivde toplar:

```bash
./install.sh --backup
# VEYA npm ile:
npm run backup
```

*Oluşturulan arşiv*: `./backups/nexus_backup_20261003_120000.tar.gz`

### Yedekten Geri Yükleme

Yeni veya arızadan kurtarılmış bir sunucuda arşivi geri yüklemek için:

```bash
./install.sh --restore ./backups/nexus_backup_20261003_120000.tar.gz
```

---

## 📖 Adım Adım Manuel Kurulum (Alternatif)

Otomasyon betiği yerine tüm adımları tek tek elle yapmak isterseniz:

```bash
# 1. Projeyi indirin:
git clone https://github.com/ozkandortboluk/iot-dashboard.git && cd iot-dashboard

# 2. Gerekli dizinleri oluşturun ve izinleri sıkılaştırın:
mkdir -p secrets data logs docker/certs
chmod 700 secrets

# 3. Kriptografik anahtarları oluşturun:
openssl rand -hex 32 > secrets/encryption_key
openssl rand -hex 32 > secrets/jwt_secret
openssl rand -hex 24 > secrets/postgres_password
chmod 600 secrets/*

# 4. Ortam değişkenlerini hazırlayın:
cp .env.example .env
# .env dosyasını düzenleyerek APP_ENV=vps ve VPS_PRODUCTION=true yapın

# 5. Self-signed SSL sertifikası üretin:
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout docker/certs/server.key \
  -out docker/certs/server.crt \
  -subj "/CN=localhost"

# 6. Konteynerleri başlatın:
docker compose up -d --build

# 7. Servis durumunu kontrol edin:
docker compose ps
```

---

## 💻 Yerel Geliştirici Modu (Local Development)

Sunucu kiralamadan kendi bilgisayarınızda yerel geliştirme veya test yapmak için:

```bash
# 1. Bağımlılıkları yükleyin:
npm install

# 2. Geliştirici sunucusunu başlatın (Vite + Express):
npm run dev

# 3. Kod kalitesi ve testleri çalıştırın:
npm run type-check   # TypeScript tip denetimi
npm run lint         # ESLint kontrolü
npm test             # Vitest test paketi
npm run build        # Üretim paketini derleme
```

---

## 👤 İlk Giriş ve SuperAdmin Oluşturma (Onboarding)

1. Tarayıcınızdan sunucu adresinize gidin (`http://SUNUCU_IP` veya `https://domain.com`).
2. Sıfır kurulumda sistem veritabanında kullanıcı olmadığını algılar ve doğrudan **İlk Yönetici Kurulum Ekranını** açar.
3. Oluşturacağınız ilk kullanıcı hesabı otomatik olarak **Root / SuperAdmin** rolüyle yetkilendirilir.
4. İlk kayıt tamamlandıktan sonra halka açık kayıt ekranı güvenlik amacıyla otomatik olarak kilitlenir; sonraki kullanıcılar yalnızca Yönetici Paneli üzerinden davet edilebilir.

---

## 📄 Lisans & Destek

Bu yazılım NexusNode IoT bünyesinde geliştirilmiştir. Kurumsal destek, donanım entegrasyonu ve özel IoT gateway çözümleri için `ozkan.1403@gmail.com` ile iletişime geçebilirsiniz.
