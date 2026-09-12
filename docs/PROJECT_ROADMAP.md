# 🧭 NexusNode IoT — Proje Yapılacaklar ve Yol Haritası

> Merkezi backlog + doğrulanmış durum + önceliklendirilmiş yol haritası.
>
> **Son inceleme:** 2026-09-12  
> **Uygulama sürümü:** `1.11.1`  
> **İncelenen HEAD:** `9ed205a8ce68e2acca2704537a11cc45ed4200a7`

## Öncelik
- 🔴 **P0:** production/site erişilebilirliği, veri bütünlüğü, DB mimarisi, build/deploy ve doğrudan çökme riski
- 🟠 **P1:** güvenlik, performans, operasyonel güvenilirlik
- 🟡 **P2:** mevcut özellik geliştirmeleri
- 🟢 **P3:** teknik borç / kalite
- ⭐⭐⭐⭐⭐: stratejik özellik

> **Kontrol kuralı:** `[x]` yalnızca kaynak kodunda gerçekten uygulandığı ve ilgili iddia güvenilir biçimde doğrulandığı zaman kullanılır. Production testi/kanıtı gerekiyorsa kodda bulunması tek başına yeterli değildir.

---

# 1. 🔴 P0 — DATABASE / SITE STABİLİTESİ

## P0.1 — PostgreSQL tek gerçek veri kaynağı
**Durum: 🟠 Kısmi**

- [x] PostgreSQL/TimescaleDB production authoritative source of truth olarak hedeflenmiş.
- [x] Production local PostgreSQL fallback pool kaldırılmış; fallback yalnız testte.
- [x] Kritik CRUD write işlemlerinde DB yokluğuna karşı 503 koruması mevcut.
- [x] `/health` ve `/health/ready` PostgreSQL bağlantısını esas alıyor.
- [ ] `/system/stats` hâlâ `SQLite (Development/Local)` raporluyor.
- [ ] Database config API production'da `local` engine seçimine izin vermemeli.
- [ ] Firestore/JSON/LocalDB legacy yollarının production source-of-truth olamayacağı runtime policy ile garanti edilmeli.
- [ ] DB'ye yazan tüm endpoint'lerin PostgreSQL-only + 503 E2E testi.

## P0.2 — Tek PostgreSQL connection pool
**Durum: 🟢 Kod tarafı tamam; CI kanıtı açık**

- [x] Unified shared PostgreSQL pool mevcut.
- [x] Production fallback pool kaldırılmış.
- [x] DB olmadan normal startup engelleniyor.
- [x] Connection string çözümleme merkezi connection katmanında.
- [x] Split-brain local PostgreSQL pool engellenmiş.
- [x] `DATABASE_URL` production sözleşmesi `verify:schema` ile kontrol ediliyor.
- [ ] CI workflow'un bu gate'i her release'te zorunlu çalıştırdığı kanıtlanmalı.

## P0.3 — DB hataları sessizce yutulmamalı
**Durum: 🟠 Kısmi**

- [x] Kritik write yollarının önemli kısmı düzeltildi.
- [x] Persistence/API hata aktarımı ve 503 guard mevcut.
- [x] Global async error handling mevcut.
- [ ] Migration 002/003/004 kritik DDL hatalarını `catch + warning` ile yutuyor.
- [ ] Tüm `catch → empty result` yolları yeniden taranmalı.
- [ ] DB read error ile gerçek `0 kayıt` ayrımı tamamıyla doğrulanmalı.
- [ ] Hata kodu + operation + tenant/device + correlation ID tüm DB katmanında standardize edilmeli.

## P0.4 — DB hazır olmadan uygulama hazır olmamalı
**Durum: 🟠 Kısmi**

- [x] DB initialization tamamlanmadan HTTP/WS açılmıyor.
- [x] DB yokluğunda 503.
- [x] Liveness/readiness ayrılmış.
- [x] Local JSON split-brain kapatılmış.
- [ ] Migration failure failure-injection ile readiness=503 doğrulanmalı.
- [ ] Compose app healthcheck `/health/live` yerine DB readiness'i değerlendirmeli veya bunun bilinçli ayrım olduğu güvence altına alınmalı.
- [ ] Nginx → app → DB zinciri DB arızasıyla test edilmeli.

## P0.5 — Versioned migration sistemi
**Durum: 🟠 Kısmi**

- [x] `001–004` sıralı migration yapısı mevcut.
- [x] `schema_migrations` mevcut.
- [x] Advisory lock mevcut.
- [x] Transaction modeli mevcut.
- [ ] 002 Timescale/hypertable/compression hatası migration'ı fail ettirmeli.
- [ ] 003 PK/unique constraint hatası fail ettirmeli.
- [ ] 004 tenant ALTER hatası fail ettirmeli.
- [ ] `down` fonksiyonları gerçek rollback veya açık irreversible migration politikası sağlamalı.
- [ ] Migration checksum drift kontrolü.
- [ ] Migration sonrası otomatik schema verification.

## P0.6 — Telemetry packet idempotency
**Durum: 🟠 Kısmi**

- [x] `(device_id, boot_id, sequence)` unique constraint migration'da tanımlı.
- [x] Dedup tasarımı mevcut.
- [ ] Verification gerçek UNIQUE constraint kolonlarını ve sırasını kesin kontrol etmeli.
- [ ] `ON CONFLICT` hedefi gerçek constraint ile birebir doğrulanmalı.
- [ ] Production-benzeri DB'de duplicate/retry/reboot/out-of-order/concurrent testleri kanıtlanmalı.

## P0.7 — `telemetry_readings` TimescaleDB bütünlüğü
**Durum: 🔴 Açık**

- [ ] Composite PK'nin tek ve doğru sırada `(id, created_at)` olduğu katalogdan kesin doğrulanmalı.
- [ ] Gerçek hypertable metadata kontrolü.
- [ ] 7 günlük chunk interval kontrolü.
- [ ] Compression ve compression policy kontrolü.
- [ ] TimescaleDB extension/version kontrolü.
- [ ] Migration başarısızlığının release'i durdurduğu doğrulanmalı.
- [ ] 50 müşteri × 5 cihaz × ~5 saniye load/soak testi production-benzeri DB'de kanıtlanmalı.

## P0.8 — Telemetry veri kaybı / sahte başarı
**Durum: 🟠 Kısmi**

- [ ] DB down → RAM/durable queue failure injection ile doğrulanmalı.
- [ ] `physical-telemetry.ndjson` replay sınırları ve disk dolması test edilmeli.
- [ ] Partial commit / duplicate replay.
- [ ] Buffer overflow alarmı.
- [ ] `persisted=false/degraded` dashboard görünürlüğü.
- [ ] DB geri geldiğinde replay idempotency.

## P0.9 — PostgreSQL-only health/readiness
**Durum: 🟢 Kod tarafı tamam; operasyon testi açık**

- [x] PostgreSQL yoksa `/health/ready` 503.
- [x] `/health` PostgreSQL hazır değilse 503.
- [x] Health response PostgreSQL/TimescaleDB gösteriyor.
- [ ] Docker app healthcheck + proxy zinciri gerçek DB failure injection ile doğrulanmalı.

## P0.10 — `tenant_id` / schema drift regression gate
**Durum: 🟠 Kısmi**

- [x] Critical column verification scripti mevcut.
- [x] `tenant_id` migration mevcut.
- [x] `DATABASE_URL` CI/production gate mevcut.
- [ ] Migration 004 tenant ALTER hatası fail ettirmeli.
- [ ] Tenant kolon tip/default/index/FK durumu doğrulanmalı.
- [ ] Tenant isolation negatif testleri production-benzeri DB'de çalıştırılmalı.
- [ ] CI gate'in zorunlu çalıştığı kanıtlanmalı.

## P0.11 — package/lock dependency drift
**Durum: 🟢 Büyük ölçüde tamam**

- [x] `express-async-errors` package.json'da mevcut.
- [x] `verify:schema` scripti mevcut.
- [x] Clean install modeli tanımlı.
- [ ] Güncel lockfile + `npm ci` sonucu CI artefact'ı ile kanıtlanmalı.
- [ ] Docker build ve CI dependency modelinin aynı olduğu doğrulanmalı.

## P0.12 — 🔴 YENİ: Production DB-only enforcement

`/system/stats` içinde `SQLite (Development/Local)` raporlaması ve database config API'deki `local` engine seçimi PostgreSQL-only mimariyle çelişiyor.

- [ ] Production `local` engine seçimini reddet.
- [ ] `/system/stats` gerçek active engine'i PostgreSQL/TimescaleDB olarak raporlasın.
- [ ] Legacy Firestore/JSON/LocalDB production source-of-truth'tan kesin ayrıştırılsın.
- [ ] DB config production'da immutable olsun.
- [ ] PostgreSQL-only regression test ekle.

## P0.13 — 🔴 YENİ: Migration false-success / error swallowing

Migration runner exception alırsa fail ediyor; ancak 002/003/004 kritik DDL exception'larını warning'e çeviriyor. Böylece schema eksik kalmasına rağmen migration başarılı kaydedilebilir.

- [ ] Kritik DDL catch blokları `throw` etmeli.
- [ ] Timescale/hypertable/compression hatası → migration fail.
- [ ] PK/unique constraint hatası → migration fail.
- [ ] tenant ALTER hatası → migration fail.
- [ ] Migration sonrası schema gate otomatik çalışmalı.
- [ ] Failure sonrası readiness kesin 503 kalmalı.

## P0.14 — 🔴 YENİ: Schema verification false-positive

Telemetry unique constraint kontrolü gerçek `(device_id, boot_id, sequence)` kolon kombinasyonunu kesin doğrulamıyor; PK/Timescale metadata kontrolleri de yeterince sıkı değil.

- [ ] Unique constraint kolonları + ordinal sıra kontrolü.
- [ ] PK tek constraint + doğru sıra kontrolü.
- [ ] Hypertable metadata kontrolü.
- [ ] Chunk interval kontrolü.
- [ ] Compression/policy kontrolü.
- [ ] Migration checksum kontrolü.

## P0.15 — 🔴 YENİ: Multitenant migration safety

`004_multitenant_columns.ts` tenant kolonlarını `DEFAULT 'usr_admin'` ile ekliyor ve ALTER hatalarını warning ile geçiyor. Bu, mevcut verinin yanlış tenant'a bağlanması riskini doğurabilir.

- [ ] Tablo bazında güvenli tenant backfill.
- [ ] `usr_admin` default'un production verilerinde kullanılmasının kaldırılması/kanıtlanması.
- [ ] Null/yanlış tenant reconciliation.
- [ ] Tenant isolation testleri.
- [ ] Tenant ID için NOT NULL/index/FK politikasının belirlenmesi.

---

# 2. 🔴 P0 — PRODUCTION RECOVERY / DOWNTIME

- [ ] PostgreSQL restart → app recovery.
- [ ] App restart → proxy recovery.
- [ ] Proxy restart → HTTP + WebSocket recovery.
- [ ] Host reboot → DB → app → proxy recovery.
- [ ] DB connection exhaustion.
- [ ] Disk full.
- [ ] Network interruption.
- [ ] WebSocket reconnect/backoff.
- [ ] Uzun telemetry soak.
- [ ] Gerçek ESP8266/ESP32 `connect → telemetry → DB → dashboard → command → ACK → UI` E2E.

---

# 3. 🟠 P1 — DOCKER / PRODUCTION / GÜVENİLİRLİK

## P1.1 — Compose / CI / production parity
- [ ] `timescale/timescaledb:latest-pg15` gibi `latest` tag'ler kaldırılmalı.
- [ ] Compose + CI + production aynı PostgreSQL/TimescaleDB sürümünde pinlenmeli.
- [ ] Image digest pinleme.
- [ ] Gereksiz host `5432` publish kaldırılmalı.
- [ ] DB private Docker network'te olmalı.
- [ ] Firewall/allowlist doğrulanmalı.

## P1.2 — Default secret'lar
- [ ] Default PostgreSQL password production'da engellenmeli.
- [ ] Default JWT/session secret production'da engellenmeli.
- [ ] Secret rotation.
- [ ] Secret scanning CI.

## P1.3 — Healthcheck / readiness zinciri
- [ ] DB healthcheck runtime DB/user ile aynı kaynağı kontrol etmeli.
- [ ] App healthcheck readiness'i kontrol etmeli.
- [ ] Proxy upstream healthcheck.
- [ ] DB restart sonrası recovery testi.

## P1.4 — Duplicate schema kaynakları
- [ ] Tek canonical schema/migration kaynağı.
- [ ] Runtime DDL ↔ migration DDL çakışması kaldırılmalı.
- [ ] Schema drift CI testi.

## P1.5 — Foreign key / referans bütünlüğü
- [ ] Orphan device/telemetry reconciliation.
- [ ] Tenant/device referans bütünlüğü.
- [ ] `DROP CONSTRAINT ... CASCADE` yalnız migration içinde.

## P1.6 — Auto-Healer sınırları
- [ ] Bakım sorguları normal query trafiğinden ayrılmalı.
- [ ] `pg_terminate_backend` güvenli koşullara bağlanmalı.
- [ ] Connection recycle loop engellenmeli.
- [ ] Audit log.

## P1.7 — Gerçek PostgreSQL backup / restore
- [ ] Production `pg_dump` uyumluluğu.
- [ ] Gerçek restore testi.
- [ ] Backup retention + harici hedef.
- [ ] Periyodik restore drill.

## P1.8 — Release/version metadata parity
- [ ] `package.json`, `package-lock.json`, version source, CHANGELOG ve roadmap aynı release bilgisini göstermeli.
- [ ] CI metadata drift'i fail ettirmeli.
- [ ] Deployment öncesi commit SHA + uygulama sürümü görünür olmalı.

## P1.9 — WebSocket / Command / Device reliability
- [ ] Credential revoke → aktif socket termination.
- [ ] Reconnect/backoff.
- [ ] Duplicate command/event koruması.
- [ ] Backpressure/max payload soak.
- [ ] Query-string credential kullanımının kaldırılması.
- [ ] Command ID → ACK → final state DB tutarlılığı.
- [ ] Tek command schema.
- [ ] Manual/automation ayrımı.
- [ ] Fail-safe/default state.

---

# 4. 🟡 P2 — MEVCUT ÖZELLİKLER

## Live Dashboard
- [ ] Render/memory optimizasyonu.
- [ ] Stale/offline mesajları.
- [ ] Persisted vs live data görünürlüğü.

## Device Management
- [ ] Toplu operasyonlar.
- [ ] Bakım planlama.
- [ ] Health timeline.
- [ ] Device replacement veri bütünlüğü.

## Telemetry
- [ ] Metric catalog + unit normalization.
- [ ] Aggregation/downsampling.
- [ ] Data quality indicators.
- [ ] Clock drift.
- [ ] Ingest latency/retry/drop metrikleri.
- [ ] Retention/compression yönetimi.

## Alarm & Notification
- [ ] Triggered → Acknowledged → Resolved.
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
- [ ] QR pairing.
- [ ] Accessibility.

---

# 5. 🟢 P3 — KALİTE / TEKNİK BORÇ

- [ ] package/version/CHANGELOG/README/roadmap parity.
- [ ] OpenAPI ↔ gerçek API parity.
- [ ] Versioned WebSocket protocol.
- [ ] CSP/HSTS/security headers.
- [ ] Dependency vulnerability scanning.
- [ ] Secret scanning.
- [ ] Structured audit logging.
- [ ] Backup restore drill otomasyonu.
- [ ] Load/soak/capacity plan.
- [ ] DB schema drift CI.

---

# 6. ⭐ STRATEJİK ÖZELLİKLER

**P0/P1 tamamlanmadan öncelik verilmemeli.**

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

# 7. 🏗️ UYGULAMA SIRASI

### Faz 0 — Production güvenliğini kesinleştir
1. **P0.13** migration false-success / error swallowing
2. **P0.14** schema verification false-positive
3. **P0.15** tenant migration/isolation safety
4. **P0.12** production DB-only enforcement
5. **P0.6/P0.7** telemetry/Timescale production integrity
6. **P0.8** telemetry loss/replay
7. **P0 Recovery** failure/restart/load/ESP E2E
8. **P1.1/P1.2/P1.3** production parity, secrets, healthcheck

### Faz 1 — Telemetry + cihaz güvenilirliği
- Telemetry soak/load
- Command ID → ACK → final state
- Device health
- Alarm lifecycle

### Faz 2 — Operasyon merkezi
- Command Center
- Alarm Management Center
- Device Health Center 2.0

### Faz 3 — OTA
- Firmware registry
- Deployment groups
- Canary/staged rollout
- Progress + rollback

### Faz 4 — Güvenlik / tenant
- Device Credential Center
- Audit & Security Center
- Tenant management

### Faz 5 — Observability / DR / entegrasyon
- System Observability Center
- Backup & Disaster Recovery
- Reporting & Integration
- Load/soak/capacity planning

---

# 8. ✅ DEFINITION OF DONE

Bir P0 maddesi ancak aşağıdaki şartlar sağlandığında tamamlanmış sayılır:

- Kod değişikliği uygulanmış.
- Temiz `npm ci` başarılı.
- Lint/type-check/test/build başarılı.
- Production schema ile uyum doğrulanmış.
- Migration başarısızlığı release'i gerçekten durduruyor.
- DB down / restart / recovery senaryosu test edilmiş.
- Telemetry idempotency ve Timescale integrity testleri yapılmış.
- Health/readiness doğru HTTP durum kodunu veriyor.
- Gerçek ESP cihazı ile kritik uçtan uca akış doğrulanmış.
- Roadmap ve Issue #1 aynı durumu gösteriyor.

**Kritik prensip:** Production'da PostgreSQL/TimescaleDB tek gerçek veri kaynağıdır. Local JSON/LowDB/Firestore production source-of-truth olamaz.

---

# 🎯 2026-09-12 SONRAKİ EN KRİTİK SIRA

**1. P0.13 → Migration error swallowing**  
**2. P0.14 → Schema verification false-positive**  
**3. P0.15 → Tenant migration/isolation**  
**4. P0.12 → Production DB-only enforcement**  
**5. P0.6/P0.7 → Telemetry/Timescale production integrity**  
**6. P0.8 → Telemetry loss/replay**  
**7. P0 Recovery → gerçek failure/restart/load/ESP testleri**  
**8. P1.1 → Compose/CI/production parity**  
**9. P1.2 → secrets**  
**10. P1.7 → backup/restore drill**
