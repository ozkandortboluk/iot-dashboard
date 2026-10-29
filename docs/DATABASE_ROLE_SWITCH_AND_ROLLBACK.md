# ARŞİV — Kullanımdan Kaldırılan Veritabanı/Rol Geçişi Kılavuzu

> **Bu kılavuz güncel değildir.** Uygulama içinden rol parolası değiştiren `/api/database/rotate-password` ve hedef veritabanı değiştiren `/api/database/switch-target` uç noktaları v1.50.7 itibarıyla devre dışıdır ve `410 Gone` döndürür. Aşağıdaki eski panel ve cURL adımlarını çalıştırmayın.
>
> Aynı host, port ve veritabanına önceden hazırlanmış PostgreSQL kimlik bilgilerini güvenli biçimde kaydetmek için [güncel rotasyon kılavuzunu](database-connection-rotation.md) izleyin. Veritabanı hedefi taşıma işlemi için doğrulanmış yedek, veri sürekliliği doğrulaması ve ayrı bir bakım/geri alma planı gerekir.

Bu belgenin devamı yalnızca geçmiş uygulama tasarımını ve artık kullanılmayan örnekleri kaydeder.

---

## 1. Mimari Prensipler ve Güvenlik Katmanları

Sistem üzerinde veritabanı hedefi veya kullanıcı rolü değişikliği gerçekleştirilirken aşağıdaki güvenlik kuralları katı bir şekilde uygulanır:

1. **Önce Doğrula (Pre-Flight Test-Before-Commit):**
   - Yeni bağlantı bilgileri girildiğinde, ana uygulama havuzuna (`_unifiedPostgresPool`) dokunulmadan izole, geçici ve kısa zaman aşımlı (5000 ms) bir test havuzu açılır.
   - Ağ bağlantısı, PostgreSQL kimlik doğrulaması veya SSL el sıkışması başarısız olursa işlem durdurulur; mevcut veritabanı bağlantısı **%100 korunur**.

2. **Yanlış Veritabanına Geçiş Engeli (Anti-Drift & Table Identity Gate):**
   - Sadece `SELECT 1` ping testi yetersiz kabul edilir.
   - Hedef veritabanında NexusNode IoT Cloud için zorunlu olan çekirdek tablolar (`users`, `devices`, `telemetry_readings`) taranır.
   - Bu tablolardan herhangi biri eksikse sistem işlemi **422 Unprocessable Entity** ile reddeder. Boş, yanlış veya başka bir uygulamaya ait veritabanına geçiş kesin olarak engellenir.

3. **Rol Yetki Denetimi (Least Privilege & Permission Gate):**
   - Yeni kullanıcının NexusNode servisleri için gerekli tüm yetkilere (`schema_usage`, `users_select`, `users_insert`, `users_update`, `devices_select`, `devices_insert`, `devices_update`, `telemetry_select`, `telemetry_insert`, `sequences_usage`) sahip olduğu PostgreSQL iç katalog fonksiyonları ile test edilir.
   - Eksik yetki varsa mevcut ayarlar değiştirilmez.

4. **Atomik Uygulama ve Otomatik Geri Alma (Atomic Switch & Automatic Rollback):**
   - Eski bağlantı ayarları bellekte yedeklenir (In-Memory Snapshot).
   - Yeni ayarlar şifreli **Central Security Vault** (`systemSecretsService`) ve korumalı runtime konfigürasyonuna yazılır.
   - Havuz geri dönüştürülüp ana uygulama havuzu başlatılır (`db.initPostgresRepository(true)`).
   - Eğer ana havuz ayağa kalkamazsa anında **otomatik geri alma** çalışır; önceki bilgiler Vault'a geri yüklenir ve eski veritabanına yeniden bağlanılır.

5. **Sadece Yönetici Erişimi (Admin-Only RBAC):**
   - Geçiş uç noktası (`/api/database/switch-target`) ve test uç noktası (`/api/database/test-target`) yalnızca geçerli oturuma sahip `admin` rolündeki kullanıcılar tarafından çağrılabilir.
   - Servis jetonları (`nxs_srv_`), operatörler, analistler veya müşteriler bu işleme erişemez (**403 Forbidden**).
   - Parolalar loglara, URL geçmişine veya denetim kayıtlarına asla açık (plaintext) yazılmaz.

---

## 2. PostgreSQL Seviyesinde Yeni Rol ve Veritabanı Hazırlama

Veritabanı yöneticisi (DBA) veya sistem operatörü, sistem üzerinden geçiş yapmadan önce PostgreSQL sunucusunda aşağıdaki SQL komutlarını çalıştırarak yeni rolü ve veritabanını hazırlar:

### Adım 1: Yeni Uygulama Rolü Oluşturma
```sql
-- Güçlü, rastgele üretilmiş bir parola ile yeni uygulama rolü oluşturun:
CREATE ROLE iot_prod_app WITH LOGIN PASSWORD 'GUCLU_VE_GECICI_OLMAYAN_PAROLA';
```

### Adım 2: Yeni Hedef Veritabanını Oluşturma (Gerekiyorsa)
```sql
-- Yeni veritabanını UTF-8 kodlamasıyla oluşturun:
CREATE DATABASE iot_production WITH OWNER = iot_prod_app ENCODING = 'UTF8';

-- Genel halka açık (PUBLIC) yetkileri kısıtlayın:
REVOKE ALL ON DATABASE iot_production FROM PUBLIC;
GRANT CONNECT ON DATABASE iot_production TO iot_prod_app;
```

### Adım 3: TimescaleDB Eklentisini Etkinleştirme
```sql
\c iot_production;

-- TimescaleDB uzantısını yükleyin (yüklü değilse standart PostgreSQL olarak da çalışır):
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
```

### Adım 4: En Az Yetki (Least Privilege) İzinlerini Verme
NexusNode IoT Cloud servislerinin okuma, yazma ve ID üretimi yapabilmesi için gerekli izinler:
```sql
\c iot_production;

-- 1. Şema Kullanım ve Tablo Oluşturma İzni
GRANT USAGE, CREATE ON SCHEMA public TO iot_prod_app;

-- 2. Mevcut Tablolarda CRUD İzinleri
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO iot_prod_app;

-- 3. Otomatik Artan ID (Sequence) Kullanım İzinleri
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO iot_prod_app;

-- 4. İleride Oluşturulacak Tablo ve Sequenceler İçin Varsayılan İzinler
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO iot_prod_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO iot_prod_app;
```

---

## 3. Şema ve Verilerin Hedef Veritabanına Aktarılması

Hedef veritabanına geçmeden önce tabloların ve verilerin hazır olması gerekir. İki yöntem kullanılabilir:

### Yöntem A: Mevcut Veritabanından Yedek ve Geri Yükleme (Önerilen)
```bash
# 1. Mevcut veritabanının yedeğini alın
pg_dump -h 127.0.0.1 -p 5432 -U iot_user -d iot_dashboard -F c -b -v -f /tmp/iot_backup.dump

# 2. Yeni hedef veritabanına aktarın
pg_restore -h 127.0.0.1 -p 5432 -U postgres -d iot_production -v /tmp/iot_backup.dump

# 3. İzinleri yeni role devredin/tanımlayın
psql -h 127.0.0.1 -p 5432 -U postgres -d iot_production -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO iot_prod_app;"
psql -h 127.0.0.1 -p 5432 -U postgres -d iot_production -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO iot_prod_app;"
```

### Yöntem B: Sistem Üzerinden Otomatik Şema Kurulumu
Eğer hedef veritabanı sıfırdan oluşturulacaksa:
1. PostgreSQL içinde boş `iot_production` veritabanını oluşturup `iot_prod_app` kullanıcısına `CREATE ON SCHEMA public` izni verin.
2. Web arayüzünde "Otomatik Şema Kur (Migrate)" butonunu veya `/api/database/postgres/migrate` uç noktasını çalıştırarak NexusNode tablolarını otomatik oluşturun.

---

## 4. Sistem Üzerinden Geçiş Yapma (Sadece Admin)

### Yöntem 1: Web Kullanıcı Arayüzü (NexusNode Dashboard)
1. **Yönetici (Admin)** hesabınızla sisteme giriş yapın.
2. Sol menüden **Veritabanı & Sistem Yönetimi** sayfasına gidin.
3. **Kolay Erişim:** Sayfanın sağ üstündeki mor renkli **"Veritabanı & Rol Geçişi"** butonuna tıklayarak doğrudan panele odaklanabilirsiniz.
   *(Alternatif olarak 3. kategori olan **`⚙️ Sunucu & Konfigürasyon`** kartına tıklayıp hemen altındaki **`PostgreSQL & Rol Geçişi`** sekmesini seçebilirsiniz).*
4. Sayfada mor çerçeveli **"Güvenli Veritabanı & Rol Geçiş Paneli (Target & Role Switcher)"** kartını göreceksiniz:
   - **Sunucu Adresi (Host):** Örn. `timescaledb` veya `127.0.0.1`
   - **Port:** `5432`
   - **Veritabanı Adı:** `iot_production`
   - **Kullanıcı Adı / Rol:** `iot_prod_app`
   - **Parola:** Belirlediğiniz güçlü parola
   - **SSL Modu:** `disable`, `prefer` veya `require`
5. **"1. Hedefi Önce Doğrula (Test)"** butonuna tıklayın:
   - Sistem gecikme süresini, PostgreSQL sürümünü, zorunlu tabloların ve rol yetkilerinin varlığını yeşil rozetlerle doğrular.
6. **"Bu veritabanına ve role geçiş yapılmasını onaylıyorum"** kutucuğunu işaretleyin.
7. **"2. Doğrula & Güvenle Geçiş Yap"** butonuna basıp onay verin.
8. Geçiş başarıyla tamamlandığında yeşil bildirim gösterilir ve aktif bağlantı anında yeni veritabanına aktarılır.

---

### Yöntem 2: REST API (cURL / Otomasyon)

#### Adım 1: Aday Bağlantıyı Önce Doğrulama (Dry-Run Test)
```bash
curl -X POST https://your-iot-domain.com/api/database/test-target \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "host": "timescaledb",
    "port": 5432,
    "database": "iot_production",
    "user": "iot_prod_app",
    "password": "GUCLU_PAROLA",
    "sslMode": "prefer"
  }'
```
*Yanıt örneği:*
```json
{
  "success": true,
  "message": "PostgreSQL bağlantısı başarılı.",
  "pgVersion": "PostgreSQL 16",
  "timescaleAvailable": true,
  "latencyMs": 8,
  "tablesStatus": {
    "users": true,
    "devices": true,
    "telemetry_readings": true,
    "threshold_rules": true,
    "audit_logs": true
  },
  "permissionsStatus": {
    "schema_usage": true,
    "users_select": true,
    "users_insert": true,
    "users_update": true,
    "devices_select": true,
    "devices_insert": true,
    "devices_update": true,
    "telemetry_select": true,
    "telemetry_insert": true,
    "sequences_usage": true
  }
}
```

#### Adım 2: Geçişi Gerçekleştirme
```bash
curl -X POST https://your-iot-domain.com/api/database/switch-target \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "host": "timescaledb",
    "port": 5432,
    "database": "iot_production",
    "user": "iot_prod_app",
    "password": "GUCLU_PAROLA",
    "sslMode": "prefer",
    "confirmDatabaseSwitch": true
  }'
```
*Başarılı Yanıt (200 OK):*
```json
{
  "success": true,
  "message": "Veritabanı ve rol geçişi başarıyla tamamlandı (iot_prod_app@iot_production).",
  "config": {
    "activeEngine": "postgres",
    "isPostgresConnected": true
  }
}
```

### 4.3 Sistem Üzerinden Veritabanı Parolasını Değiştirme (In-Place Password Rotation)

Mevcut veritabanı hedefini ve sunucusunu değiştirmeden, yalnızca aktif veritabanı kullanıcısının parolasını değiştirmek için sistem üzerinde **"🔐 Veritabanı Parolası Değiştirme (Rotate Password)"** paneli kullanılır:

#### İşlem Akışı:
1. **Mevcut Parola Doğrulaması:** Admin kullanıcısı önce geçerli mevcut veritabanı parolasını girer. Sistem, bu parola ile PostgreSQL sunucusuna izole bir test sorgusu atar. Parola hatalıysa işlem hemen durdurulur (`422 Unprocessable Entity`).
2. **PostgreSQL ALTER ROLE:** Doğrulanan bağlantı oturumu üzerinden PostgreSQL sunucusuna `ALTER ROLE "<username>" WITH PASSWORD '<new_password>';` komutu gönderilir.
3. **Yeni Parola Doğrulaması:** Yeni parolanın geçerliliği izole test bağlantısıyla derhal doğrulanır. Eğer doğrulanamazsa acil kurtarma prosedürü eski parolayı PostgreSQL üzerinde yeniden etkinleştirir.
4. **Central Vault & Havuz Yenileme:** Yeni parola AES-256-GCM ile şifrelenmiş Central Security Vault (`systemSecretsService`) ve runtime sırlarına kaydedilir. Bağlantı havuzu kesintisiz olarak geri dönüştürülür ve uygulama kesintisiz çalışmaya devam eder.

#### API Çağrısı:
```bash
curl -X POST https://your-iot-domain.com/api/database/rotate-password \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "<MEVCUT_GECERLI_PAROLA>",
    "newPassword": "<YENI_GUCLU_PAROLA_MIN_8>",
    "confirmPassword": "<YENI_GUCLU_PAROLA_MIN_8>"
  }'
```

---

## 5. Acil Durum Geri Alma (Rollback) Prosedürü

Eğer geçiş sonrasında beklenmedik bir durum tespit edilirse sistem hemen eski veritabanına ve role döndürülebilir:

### 1. Sistem Üzerinden Geri Alma (Otomatik & Sıfır Kesinti)
Admin kullanıcısı, geçiş panelinden veya API üzerinden eski veritabanı bilgilerini girip onaylar:
```bash
curl -X POST https://your-iot-domain.com/api/database/switch-target \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "host": "timescaledb",
    "port": 5432,
    "database": "iot_dashboard",
    "user": "iot_user",
    "password": "<ESKI_PAROLA>",
    "sslMode": "disable",
    "confirmDatabaseSwitch": true
  }'
```
Uygulama, eski veritabanındaki tabloları ve yetkileri doğrulayıp Vault'a geri yazar; eski bağlantı anında devreye girer.

### 2. PostgreSQL Tarafında Yeni Rolü Dondurma (İsteğe Bağlı)
Sorunlu yeni rolün sisteme tekrar erişmesini engellemek için PostgreSQL sunucusunda:
```sql
\c iot_production;

-- 1. Rolün bağlantı yetkisini kesin
REVOKE CONNECT ON DATABASE iot_production FROM iot_prod_app;

-- 2. Aktif açık bağlantıları sonlandırın
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE usename = 'iot_prod_app';

-- 3. Rolü dondurun (kilitli duruma getirin)
ALTER ROLE iot_prod_app NOLOGIN;
```

---

## 6. Sık Karşılaşılan Hata Durumları ve Açıklamaları

| HTTP Kodu | Hata Mesajı | Sebep ve Çözüm |
|---|---|---|
| **401 Unauthorized** | Kimlik doğrulama jetonu eksik | İstekte geçerli bir Admin Bearer token veya oturum çerezi bulunmuyor. |
| **403 Forbidden** | Bu işlem için Yönetici (Admin) yetkisi gerekir | İstek yapan kullanıcı admin değil (operatör veya analist). Yalnızca admin yapabilir. |
| **400 Bad Request** | confirmDatabaseSwitch onay kutusu işaretlenmelidir | Kazara geçişi önlemek için onay bayrağı eksik bırakılmış. |
| **422 Unprocessable** | Zorunlu NexusNode tabloları bulunamadı | Hedef veritabanında `users`, `devices` veya `telemetry_readings` tabloları yok. Yanlış/boş veritabanı koruması devrede. Mevcut bağlantı korunmuştur. |
| **422 Unprocessable** | Gerekli veritabanı yetkileri doğrulanamadı | Yeni kullanıcının tablolarda `SELECT`, `INSERT`, `UPDATE` veya Sequence yetkisi eksik. `GRANT` komutlarını çalıştırın. Mevcut bağlantı korunmuştur. |
| **503 Service Unavailable** | Uygulama havuzu başlatılamadı; ayarlar geri yüklendi | Test bağlantısı geçse de ana havuz bağlantı limitlerine veya ağ kısıtına takıldı. Sistem otomatik olarak eski veritabanına geri dönmüştür. |

---

## 7. Denetim ve Güvenlik Özeti
- **Kayıtlı Veriler:** Şifreler yalnızca AES-256-GCM ile şifrelenmiş Central Security Vault dosyasında tutulur.
- **Log Hijyeni:** Şifreler hata mesajlarında, sistem loglarında ve bildirimlerde `••••••••` olarak maskelenir.
- **Bağlantı Sürekliliği:** Başarısız doğrulama esnasında aktif veritabanı bağlantısı hiçbir şekilde kesilmez veya geçici olarak dahi olsa devre dışı kalmaz.
