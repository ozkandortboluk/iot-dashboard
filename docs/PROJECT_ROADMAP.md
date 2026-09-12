# 🧭 NexusNode IoT — Proje Yapılacaklar ve Yol Haritası

> Merkezi backlog + hata düzeltme + mevcut özellik geliştirme + yeni özellik yol haritası.
>
> **Son inceleme:** 2026-09-12  
> **Güncel uygulama sürümü:** `1.9.5`  
> **Güncel HEAD:** `9ee91730f4f301a8e8be1600e8413995d6157834`

## Öncelik
- 🔴 **P0:** production/site erişilebilirliği, veri bütünlüğü, veritabanı mimarisi ve doğrudan çökme riski
- 🟠 **P1:** yüksek öncelik / güvenlik / performans / operasyonel güvenilirlik
- 🟡 **P2:** planlı mevcut özellik geliştirmeleri
- 🟢 **P3:** teknik borç / kalite
- ⭐⭐⭐⭐⭐: stratejik özellik

---

# 1. 🔴 P0 — ÖNCE VERİTABANI VE SITE STABİLİTESİ

## P0.1 — PostgreSQL tek gerçek veri kaynağı haline getirilmeli
**Mevcut durum:** PostgreSQL ana hedef olarak kullanılıyor ancak uygulamada hâlâ `LocalDatabase.data`, `data/db.json`, RAM state ve PostgreSQL birlikte bulunuyor. PostgreSQL bağlantısı başarısız olduğunda uygulama yerel JSON/RAM ile çalışmaya devam edebiliyor. Bu nedenle PostgreSQL bugün kod açısından henüz %100 tek gerçek kaynak değildir.

- [ ] PostgreSQL/TimescaleDB production'da **tek authoritative source of truth** olarak tanımlanmalı.
- [ ] `LocalDatabase.data` kalıcı veri kaynağı olmaktan çıkarılmalı; yalnızca kontrollü cache/state olarak kullanılmalı.
- [ ] PostgreSQL yokken kritik CRUD işlemlerinin başarılıymış gibi devam etmesi engellenmeli.
- [ ] `db.json` yalnızca migration/bootstrap veya açıkça tanımlanmış geçici cache amacıyla tutulmalı.
- [ ] PostgreSQL başarısızlıklarında kullanıcıya `DB unavailable / degraded` durumu gösterilmeli.
- [ ] Firestore gerçek veri kaynağı/senkronizasyon mekanizması olarak tamamen devre dışı tutulmalı.

## P0.2 — PostgreSQL bağlantı katmanı tamamen tekilleştirilmeli
`src/server/database/connection.ts` birleşik pool sağlamaya başlamış durumda; `src/db/index.ts` de bu pool'u kullanıyor. Ancak `src/db/index.ts` içinde hâlâ URL bulunamazsa ayrı bir fallback `pg.Pool` oluşturulabiliyor.

- [ ] Uygulamadaki bütün PostgreSQL erişimleri tek shared pool üzerinden geçmeli.
- [ ] İkinci/fallback pool oluşturma yolu kaldırılmalı veya yalnızca test ortamında açıkça sınırlandırılmalı.
- [ ] `DATABASE_URL` production için zorunlu hale getirilmeli.
- [ ] `SQL_*`, `PG*`, `POSTGRES_*` gibi alternatif bağlantı değişkenlerinin öncelik sırası tek bir yerde tanımlanmalı.
- [ ] Runtime'da farklı DB'ye bağlanabilecek belirsiz fallback zinciri bırakılmamalı.

## P0.3 — DB hataları kesinlikle sessizce yutulmamalı
- [ ] PostgreSQL query/repository katmanındaki `catch → empty result` davranışları incelenmeli.
- [ ] DB okuma hatası ile gerçekten `0 kayıt` sonucu birbirinden ayrılmalı.
- [ ] Kritik yazma hatalarında `.catch(() => {})` kullanılmamalı.
- [ ] Persistence başarısızlığı HTTP/API seviyesine anlamlı hata olarak aktarılmalı.
- [ ] Loglarda hata kodu + sorgu işlemi + tenant/device context + correlation ID bulunmalı.
- [ ] DB hatası olduğunda sistemin sahte `success` üretmesi engellenmeli.

## P0.4 — Başlangıç sırası DB hazır olmadan uygulamayı hazır göstermemeli
Mevcut kod constructor içinde local data'yı yükleyip PostgreSQL initialization'ı asenkron başlatıyor; hydration sonrasında PostgreSQL'e yazmalar yapılıyor. Bu yapı startup sırasında iki kaynağın yarışmasına yol açabilir.

- [ ] Production readiness PostgreSQL bağlantısı + schema/migration doğrulaması tamamlanmadan `healthy/ready` olmamalı.
- [ ] Startup hydration ve migration sırası deterministik olmalı.
- [ ] İlk açılışta Local JSON'dan PostgreSQL'e otomatik ve kontrolsüz veri karıştırılması engellenmeli.
- [ ] DB hazır değilse API'nin kritik endpoint'leri kontrollü olarak `503` dönebilmeli.
- [ ] Health endpoint'leri `liveness` ve `readiness` olarak net ayrılmalı.

## P0.5 — Runtime schema repair yerine versioned migration düzeni
`src/server/database/schema.ts` içinde çok sayıda `CREATE TABLE`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, constraint silme ve Timescale işlemi runtime'da yürütülüyor.

- [ ] Schema değişiklikleri versioned migration sistemi altında toplanmalı.
- [ ] Her production migration için forward + rollback stratejisi tanımlanmalı.
- [ ] Uygulama açılışında büyük DDL/backfill çalıştırılması engellenmeli.
- [ ] Migration lock/advisory lock kullanılmalı; iki instance aynı migration'ı aynı anda çalıştırmamalı.
- [ ] Migration başarısızsa uygulama `ready` olmamalı.

---

# 2. 🔴 P0 — TELEMETRY / TIMESCALEDB VERİ BÜTÜNLÜĞÜ

## P0.6 — Telemetry packet idempotency kesin olarak doğrulanmalı
`telemetry_packets` için `(device_id, boot_id, sequence)` unique constraint mevcut ve ingest tarafında bu alanlarla conflict/dedup mantığı kullanılıyor.

- [ ] Production DB'de constraint'in gerçekten mevcut olduğu startup/test ile doğrulanmalı.
- [ ] `ON CONFLICT` hedefi ile gerçek DB constraint/index birebir eşleştirilmeli.
- [ ] Duplicate packet testleri.
- [ ] Aynı packet'in retry sonrası tek kayıt kalması.
- [ ] Device reboot sonrası sequence/boot_id davranışı.
- [ ] Out-of-order packet davranışı.
- [ ] Concurrent ingest testleri.

## P0.7 — `telemetry_readings` TimescaleDB modeli korunmalı
- [ ] Composite primary key `(id, created_at)` korunmalı.
- [ ] Hypertable yalnızca `created_at` üzerinden ve kontrollü chunk interval ile yönetilmeli.
- [ ] Compression/retention policy migration ile yönetilmeli.
- [ ] Production TimescaleDB sürümü ile migration uyumluluğu doğrulanmalı.
- [ ] 5 saniyelik cihaz gönderim sıklığı ve yaklaşık 50 müşteri / 5 cihaz hedefi ile gerçek load testi yapılmalı.

## P0.8 — Telemetry ingest sırasında veri kaybı / sahte başarı engellenmeli
- [ ] DB down → RAM/WAL davranışı net bir sözleşmeye bağlanmalı.
- [ ] WAL maksimum boyut, retry ve replay sınırları belirlenmeli.
- [ ] WAL replay sırasında duplicate/partial commit test edilmeli.
- [ ] RAM buffer taşması alarmı eklenmeli.
- [ ] DB'ye yazılamayan paketlerin dashboard'da `persisted=false/degraded` durumu ayırt edilebilmeli.

---

# 3. 🔴 P0 — PRODUCTION RECOVERY / DOWNTIME

- [ ] PostgreSQL restart → app recovery.
- [ ] App restart → proxy recovery.
- [ ] Proxy restart → HTTP + WebSocket recovery.
- [ ] Host reboot → DB → app → proxy sıralı recovery.
- [ ] DB connection exhaustion testi.
- [ ] Disk full testi.
- [ ] Network interruption testi.
- [ ] WebSocket reconnect/backoff testi.
- [ ] Uzun süreli telemetry soak testi.
- [ ] Gerçek ESP8266/ESP32 ile `connect → telemetry → DB → dashboard → command → ACK → UI` zinciri.

---

# 4. 🟠 P1 — DOCKER / PRODUCTION CONFIGURATION

## P1.1 — Compose production ile gerçek sunucu aynı tanımı kullanmalı
Mevcut `docker-compose.yml` hâlâ `timescale/timescaledb:latest-pg15`, `iot_admin` / `iot_dashboard_db` varsayılanları ve host'a açık `5432` portu kullanıyor. Gerçek üretim ortamı PostgreSQL 17 + TimescaleDB 2.29.1 ve farklı DB/user değerleriyle çalıştırıldı.

- [ ] Production DB image sürümü pinlenmeli; `latest` kullanılmamalı.
- [ ] Repo Compose ile gerçek VPS/home-server DB sürümü ve isimleri eşleştirilmeli.
- [ ] Image digest pinleme prosedürü belirlenmeli.
- [ ] PostgreSQL host portu dış erişim gerekmiyorsa publish edilmemeli.
- [ ] DB yalnızca private Docker network üzerinden erişilebilir olmalı.
- [ ] Firewall/allowlist doğrulanmalı.

## P1.2 — Default secret'lar production'da kabul edilmemeli
- [ ] Default PostgreSQL password engellenmeli.
- [ ] Default JWT/session secret engellenmeli.
- [ ] Secret rotation prosedürü.
- [ ] Secret scanning CI kontrolü.

## P1.3 — Compose healthcheck / readiness zinciri
- [ ] DB healthcheck gerçek runtime DB adı/user ile aynı kaynağı kontrol etmeli.
- [ ] App healthcheck yalnızca process'in açık olduğunu değil kritik DB readiness durumunu da göstermeli.
- [ ] Proxy healthcheck HTTP + gerekiyorsa WS yolu ile doğrulanmalı.
- [ ] DB restart sonrası `depends_on` davranışı gerçek ortamda test edilmeli.

---

# 5. 🟠 P1 — DATABASE KOD TEMİZLİĞİ

## P1.4 — Duplicate schema kaynakları azaltılmalı
Projede `src/server/database/schema.ts`, `src/db/schema.ts`, `src/db/timescaledb.sql`, Drizzle schema/config ve repository tarafında schema/DDL mantığı bulunuyor.

- [ ] Tek canonical schema/migration kaynağı belirlenmeli.
- [ ] Aynı tablo/kolon için farklı tanımlar bırakılmamalı.
- [ ] Runtime DDL ile migration DDL çakışması kaldırılmalı.
- [ ] Schema drift CI testi eklenmeli.

## P1.5 — Foreign key'lerin kaldırılması kontrollü hale getirilmeli
- [ ] Ingest performansı için kaldırılan FK'lerin hangi tablolarda zorunlu olmadığı belgelenmeli.
- [ ] Orphan device/telemetry kayıtlarını tespit eden reconciliation job eklenmeli.
- [ ] Tenant/device referans bütünlüğü uygulama seviyesinde garanti edilmeli.
- [ ] `DROP CONSTRAINT ... CASCADE` işlemleri migration dışında otomatik çalıştırılmamalı.

## P1.6 — Auto-Healer güvenlik sınırları
- [ ] Uzun süren Timescale bakım sorgularını normal uygulama sorgusundan ayırmalı.
- [ ] `pg_terminate_backend` yalnızca güvenli koşullarda kullanılmalı.
- [ ] Auto-Healer'ın connection recycle döngüsüne girmesi engellenmeli.
- [ ] Her terminate/recycle işlemi audit log'a yazılmalı.
- [ ] Auto-Healer kapalıyken sistemin normal çalışması test edilmeli.

## P1.7 — Backup gerçek PostgreSQL backup olmalı
v1.9.5 ile `pg_dump` yoksa JSON metadata fallback'i eklenmiş durumda. Bu çökme riskini azaltıyor ancak JSON metadata backup **veritabanı yedeği değildir**.

- [ ] Production container'da uyumlu `pg_dump` bulunması garanti edilmeli.
- [ ] Backup'ın gerçekten PostgreSQL/TimescaleDB restore edilebilir dump olduğu doğrulanmalı.
- [ ] JSON fallback açıkça `metadata-only` olarak etiketlenmeli.
- [ ] Otomatik backup retention.
- [ ] Harici backup hedefi.
- [ ] Periyodik gerçek restore drill.

---

# 6. 🟠 P1 — WEBSOCKET / COMMAND / DEVICE

- [ ] Credential revoke → aktif socket termination.
- [ ] Reconnect/backoff.
- [ ] Duplicate command/event koruması.
- [ ] Backpressure / max payload soak testi.
- [ ] Query-string credential kullanımının tamamen kaldırılması.
- [ ] Command ID → ACK → final state zincirinin DB ile tutarlı olması.
- [ ] Relay/digital/PWM/analog için tek command schema.
- [ ] Manual/automation command ayrımı.
- [ ] Fail-safe/default state.

---

# 7. 🟡 P2 — MEVCUT ÖZELLİKLERİN GELİŞTİRİLMESİ

## Live Dashboard
- [ ] Büyük dashboardlarda render/memory optimizasyonu.
- [ ] Stale/offline için net operasyon mesajı.
- [ ] Persisted vs live data görünürlüğü.

## Device Management
- [ ] Toplu operasyonlar.
- [ ] Bakım planlama.
- [ ] Health timeline.
- [ ] Device replacement sonrası veri bütünlüğü.

## Telemetry
- [ ] Metric catalog + unit normalization.
- [ ] Aggregation/downsampling.
- [ ] Duplicate/delayed/out-of-order kalite göstergeleri.
- [ ] Clock drift.
- [ ] Ingest latency/retry/drop metrikleri.
- [ ] Retention/compression yönetimi.

## Alarm & Notification
- [ ] Triggered → Acknowledged → Resolved lifecycle.
- [ ] Severity/hysteresis/debounce/cooldown.
- [ ] Escalation/flood protection.
- [ ] Offline alarm.
- [ ] Quiet hours / maintenance suppression.

## Automation
- [ ] Visual builder.
- [ ] Schedule/time windows.
- [ ] Retry/fallback.
- [ ] Dry-run.
- [ ] Execution trace.
- [ ] Circular trigger/max-depth protection.

## OTA
- [ ] Firmware registry.
- [ ] Deployment groups.
- [ ] Canary/staged rollout.
- [ ] Schedule/progress.
- [ ] Rollback/report.

## Customer/Tenant
- [ ] Tenant overview.
- [ ] User/role management.
- [ ] Device online ratio.
- [ ] Usage quota.
- [ ] Credential management.
- [ ] Audit history.

## Mobile UX
- [ ] Touch target standardı.
- [ ] Alarm quick access.
- [ ] Connection visibility.
- [ ] QR pairing optimization.
- [ ] Accessibility.

---

# 8. 🟢 P3 — KALİTE / TEKNİK BORÇ

- [ ] `package.json` / `package-lock.json` / version / CHANGELOG / README / roadmap senkronizasyonu.
- [ ] OpenAPI ↔ gerçek API parity.
- [ ] Versioned WebSocket protocol.
- [ ] CSP/HSTS/security headers.
- [ ] Dependency vulnerability scanning.
- [ ] Secret scanning.
- [ ] Structured audit logging.
- [ ] Backup restore drill otomasyonu.
- [ ] Production load/soak/capacity plan.
- [ ] DB schema drift CI kontrolü.

---

# 9. ⭐ STRATEJİK YENİ ÖZELLİKLER

Yeni özelliklere geçmeden önce P0/P1 tamamlanmalıdır.

1. ⭐⭐⭐⭐⭐ Command Center
2. ⭐⭐⭐⭐⭐ Device Health Center 2.0
3. ⭐⭐⭐⭐⭐ Alarm Management Center
4. ⭐⭐⭐⭐⭐ OTA Deployment Manager
5. ⭐⭐⭐⭐⭐ Device Credential Center
6. ⭐⭐⭐⭐⭐ Audit & Security Center
7. ⭐⭐⭐⭐ Telemetry Explorer
8. ⭐⭐⭐⭐ Sites / Groups / Locations
9. ⭐⭐⭐⭐ Dashboard Templates
10. ⭐⭐⭐⭐ System Observability Center
11. ⭐⭐⭐⭐ Backup & Disaster Recovery Center
12. ⭐⭐⭐⭐ Reporting & Integration Center

---

# 10. 🏗️ UYGULAMA SIRASI

### Faz 0 — Siteyi ve veriyi koru
1. **PostgreSQL'i tek gerçek kaynak yap.**
2. DB fallback / split-brain davranışını kaldır.
3. Tek shared PostgreSQL pool.
4. Sessiz DB hata yutmalarını düzelt.
5. Startup readiness + migration sırasını düzelt.
6. Runtime DDL'yi versioned migration yapısına taşı.
7. Telemetry idempotency/integrity testleri.
8. Production DB image/version/secret/network ayarlarını sabitle.
9. Backup/restore testini gerçek PostgreSQL dump ile doğrula.
10. DB/app/proxy restart ve outage testleri.

### Faz 1 — IoT çekirdeği
11. Gerçek cihaz telemetry soak/load testi.
12. Command Center ve command ACK/state doğruluğu.
13. Alarm lifecycle.
14. Device Health.

### Faz 2 — Saha operasyonu
15. OTA Deployment Manager.
16. Canary/rollback.
17. Maintenance + Sites/Groups.

### Faz 3 — Kurumsal
18. Audit & Security.
19. Device Credential Center.
20. Tenant Management 2.0.
21. Reporting.

### Faz 4 — Ölçek
22. Observability.
23. Backup/DR.
24. Integrations.
25. Load/soak/capacity planning.

---

# 11. ✅ DATABASE DEFINITION OF DONE

PostgreSQL/TimescaleDB için aşağıdakilerin tamamı sağlanmadan production stabil kabul edilmemeli:

- [ ] Tek authoritative PostgreSQL/TimescaleDB.
- [ ] Tek shared connection pool.
- [ ] `DATABASE_URL` production zorunlu.
- [ ] Local JSON kalıcı source değil.
- [ ] Firestore source değil.
- [ ] DB hataları sessizce yutulmuyor.
- [ ] DB down durumunda sahte başarı yok.
- [ ] Startup DB/migration readiness tamamlanmadan ready değil.
- [ ] Tek canonical migration/schema kaynağı.
- [ ] Telemetry dedup constraint + `ON CONFLICT` birebir uyumlu.
- [ ] Hypertable/chunk/compression/retention production testli.
- [ ] Tenant isolation DB + application katmanında testli.
- [ ] Connection exhaustion testi.
- [ ] Backup restore testi.
- [ ] DB restart/recovery testi.
- [ ] Gerçek cihaz telemetry soak testi.

---

# 12. 🔍 VERİTABANI İNCELEME CHECKLIST

Her incelemede özellikle şu noktalar tekrar kontrol edilir:

1. PostgreSQL bağlantı kaynağı ve tek pool.
2. `DATABASE_URL` ve environment precedence.
3. Local JSON/RAM fallback.
4. Firestore/harici DB bağlantısı.
5. Repository → DB çağrı zincirleri.
6. Sessiz `catch` / swallowed DB errors.
7. Transaction sınırları.
8. Retry/idempotency.
9. Connection pool exhaustion.
10. Runtime DDL/migration.
11. Schema drift.
12. Tenant isolation/RLS.
13. Timescale hypertable/chunk/compression/retention.
14. Telemetry packet deduplication.
15. WAL/replay/data-loss riski.
16. Backup/restore.
17. Auto-Healer ve connection recycle.
18. DB health/readiness.
19. Docker/PostgreSQL version parity.
20. Production restart/recovery.

---

# 13. 📌 GÜNCEL İNCELEME NOTU — 2026-09-12

- v1.9.5 ile `pg_dump` bulunamadığında uygulamanın backup fonksiyonunun çökmesini önleyen fallback eklendi. Bu **uygulama çökmesini azaltan** bir düzeltmedir; JSON metadata dosyası PostgreSQL verisinin tam yedeği değildir.
- Birleşik PostgreSQL pool katmanı oluşturulmuş ve Drizzle bu shared pool'u kullanıyor; ancak `src/db/index.ts` içinde URL bulunamazsa ayrı fallback pool yolu hâlâ mevcut.
- `LocalDatabase` hâlâ merkezi RAM/local state tutuyor ve PostgreSQL bağlantısı başarısız olduğunda Local JSON ile çalışmaya devam ediyor. Bu nedenle **PostgreSQL henüz kod seviyesinde tek gerçek veri kaynağı olarak tamamlanmış değildir.**
- `src/server/database/schema.ts` hâlâ geniş runtime DDL/migration mantığı içeriyor.
- `docker-compose.yml` repo tanımı ile gerçek production PostgreSQL/TimescaleDB sürümünün birebir aynı olduğu henüz garanti edilmemeli.

> **Kritik karar:** Yeni özellik geliştirmelerine hız vermeden önce Faz 0 tamamlanmalıdır. Özellikle PostgreSQL source-of-truth, DB hata yönetimi, startup readiness, schema/migration ve telemetry integrity tamamlanmadan production yükü artırılmamalıdır.
