# 🧭 NexusNode IoT — Proje Yapılacaklar ve Yol Haritası

> Merkezi backlog + doğrulanmış P0 durumu + önceliklendirilmiş yol haritası.
>
> **Son inceleme:** 2026-09-12  
> **İncelenen HEAD:** `69fe63a6cb04b546e04d941c6a50b6044f5a2a35`  
> **package.json:** `1.11.5`

## Öncelik
- 🔴 **P0:** production/site erişilebilirliği, veri bütünlüğü, DB mimarisi, migration/readiness ve doğrudan çökme riski
- 🟠 **P1:** güvenlik, performans, operasyonel güvenilirlik
- 🟡 **P2:** mevcut özellik geliştirmeleri
- 🟢 **P3:** teknik borç / kalite
- ⭐⭐⭐⭐⭐: stratejik özellik

> **Kontrol kuralı:** `[x]` yalnızca kaynak kodunda gerçekten uygulandığı ve davranış güvenilir biçimde doğrulandığı zaman kullanılır. Production kanıtı gerekiyorsa kodda bulunması tek başına yeterli değildir.

---

# 1. 🔴 P0 — DATABASE / SITE STABİLİTESİ

## P0.1 — PostgreSQL tek gerçek veri kaynağı
**Durum: 🟠 Kısmi**

- [x] Shared PostgreSQL pool ve production write guard mevcut.
- [x] `/health` ve `/health/ready` PostgreSQL'i esas alıyor.
- [x] Production database config'te `local` engine seçimi engellendi.
- [x] `/system/stats` SQLite raporlamasından çıkarıldı; PostgreSQL/TimescaleDB veya disconnected durumunu raporluyor.
- [ ] `LocalDatabase` / `db.json` legacy katmanının production source-of-truth olamayacağı runtime policy ile kesinleştirilmeli.
- [ ] Firestore legacy/stub/sync yolları production veri akışından tamamen ayrıştırılmalı.
- [ ] Tüm DB write endpoint'lerinde PostgreSQL-only + 503 E2E testi.

## P0.2 — Tek PostgreSQL connection pool
**Durum: 🟢 Kod tarafı tamam; CI kanıtı açık**

- [x] Unified shared PostgreSQL pool.
- [x] Production fallback pool yok.
- [x] Merkezi connection string çözümleme.
- [x] Split-brain local PostgreSQL pool engellenmiş.
- [ ] `verify:schema` release CI gate'inin gerçek release koşulunda zorunlu çalıştığı kanıtlanmalı.

## P0.3 — DB hataları sessizce yutulmamalı
**Durum: 🟠 Kısmi**

- [x] Migration 003 PK/unique hataları throw ediyor.
- [x] Migration 004 tenant ALTER/FK hataları throw ediyor.
- [x] Migration 002 hypertable/compression hataları throw ediyor.
- [x] Kritik API write yollarında 503/error propagation mevcut.
- [x] Migration 002 Timescale extension enable hatası production'da fail ediyor (`NODE_ENV=production || REQUIRE_TIMESCALE=true`).
- [x] `initPostgresRepository()` hydration `saveUser/saveDevice/saveRule` vb. catch'leri `systemLogger.error` ile kaydediliyor.
- [x] `createBackup().catch()` operasyon catch'i `systemLogger.error` ile kaydediliyor.
- [ ] DB read error ile gerçek boş sonuç ayrımı tam taranmalı.

## P0.4 — DB hazır olmadan uygulama hazır olmamalı
**Durum: 🟢 Kod tarafı tamam; operasyon testi açık**

- [x] `isReady()` schema ensure koşulunu dikkate alıyor.
- [x] `/health/ready` DB hazır değilse 503.
- [x] Advisory lock alınamadığında 3 saniye sonra doğrudan `isSchemaEnsured=true` yapılması kaldırıldı (15s poll + verifySchemaContract).
- [x] Startup timeout sonrası readiness yalnız gerçek DB/schema durumuna göre belirleniyor.
- [ ] Nginx → app → DB failure-injection testi.

## P0.5 — Versioned migration sistemi
**Durum: 🟢 Kod tarafı tamam; down rollback açık**

- [x] `001–004` sıralı migration yapısı.
- [x] `schema_migrations`.
- [x] Advisory lock.
- [x] Pending migration transaction/rollback modeli.
- [x] Timescale extension failure fail ediyor (production modda).
- [ ] `down` migration'lar gerçek rollback veya açık irreversible politika sağlamalı.
- [x] Migration checksum (`computeMigrationChecksum`) SHA-256 olarak yazılıyor ve drift kontrol ediliyor.
- [x] Migration sonrası otomatik schema verification (`verifySchemaContract`).
- [ ] Runtime DDL ile migration DDL tek canonical kaynağa indirilmeli.

## P0.6 — Telemetry packet idempotency
**Durum: 🟢 Kod tarafı tamam; yük testi açık**

- [x] `(device_id, boot_id, sequence)` unique constraint tanımlı.
- [x] Dedup modeli mevcut.
- [x] Verification gerçek constraint kolonlarını ordinal sırayla (`device_id, boot_id, sequence`) doğruluyor.
- [x] `ON CONFLICT (device_id, boot_id, sequence)` hedefi gerçek constraint ile birebir eşleşiyor.
- [ ] Duplicate/retry/reboot/out-of-order/concurrent production-benzeri test kanıtı.

## P0.7 — `telemetry_readings` TimescaleDB bütünlüğü
**Durum: 🟠 Büyük ölçüde tamamlandı; load testi açık**

- [x] Verifier `telemetry_readings` hypertable olup olmadığını kontrol ediyor.
- [x] Composite PK verifier `(id, created_at)` sırasını kontrol ediyor.
- [x] 7 günlük chunk interval katalogdan kesin kontrol ediliyor.
- [x] Compression ayarı ve compression policy katalogdan kontrol ediliyor.
- [x] Timescale extension/version production için zorunlu kılındı.
- [x] `simulation_telemetry_readings` hypertable doğrulaması eklendi.
- [ ] 50 müşteri × 5 cihaz × ~5 saniye load/soak kanıtı.

## P0.8 — Telemetry veri kaybı / replay
**Durum: 🟠 Kısmi**

- [x] Durable telemetry WAL/retry altyapısı mevcut.
- [x] `persisted/degraded` durumları için mekanizmalar mevcut.
- [ ] DB down/recovery failure-injection.
- [ ] Partial commit / duplicate replay.
- [ ] Disk full / WAL overflow.
- [ ] DB geri dönüşünde idempotent replay.

## P0.9 — PostgreSQL-only health/readiness
**Durum: 🟢 Kod tarafı tamam; operasyon testi açık**

- [x] `/health/ready` PostgreSQL hazır değilse 503.
- [x] `/health` PostgreSQL hazır değilse 503.
- [x] Health response PostgreSQL/TimescaleDB kullanıyor.
- [ ] Docker healthcheck + Nginx zinciri gerçek DB failure injection ile doğrulanmalı.

## P0.10 — `tenant_id` / schema drift regression gate
**Durum: 🟠 Kısmi**

- [x] Critical column verification mevcut.
- [x] `tenant_id` migration mevcut.
- [x] `DATABASE_URL` CI/production gate mevcut.
- [ ] Tenant backfill gerçek müşteri eşlemesine göre yapılmalı.
- [ ] NULL/yanlış tenant reconciliation.
- [ ] Tenant column type/default/index/FK tam doğrulanmalı.
- [ ] Tenant isolation negatif testleri.

## P0.11 — package/lock dependency drift
**Durum: 🟢 Tamamlandı**

- [x] `npm ci` modeli mevcut.
- [x] `verify:schema` scripti mevcut.
- [x] `package.json` ve `package-lock.json` versiyonları `1.11.5` olarak eşitlendi.
- [ ] CI metadata drift fail etmeli.

## P0.12 — Production DB-only enforcement
**Durum: 🟢 Kod tarafı tamam; regression testi açık**

- [x] Production `local` engine seçimi 403 ile engellendi.
- [x] `/system/stats` SQLite raporlamasından çıkarıldı.
- [x] `LocalDatabase.getActiveEngine()` production ortamında doğrudan `'postgres'` zorunlu kılıyor.
- [ ] PostgreSQL-only regression test.

## P0.13 — Migration false-success
**Durum: 🟢 Kod tarafı tamam**

- [x] 002 hypertable/compression errors throw ediyor.
- [x] 003 PK/unique errors throw ediyor.
- [x] 004 tenant ALTER/FK errors throw ediyor.
- [x] Timescale extension oluşturulamaması migration'ı fail ettiriyor (`NODE_ENV=production || REQUIRE_TIMESCALE=true`); standard PostgreSQL fallback production'da engellendi.
- [x] Migration başarılı kaydedilmeden önce ve sonra zorunlu schema contract gate (`verifySchemaContract`) çalışıyor.

## P0.14 — Schema verification false-positive
**Durum: 🟢 Tamamlandı**

- [x] Composite PK `(id, created_at)` sıkı kontrol ediliyor.
- [x] Unique constraint kolonları ordinal sıra ile (`device_id, boot_id, sequence`) kontrol ediliyor.
- [x] Hypertable dimension/chunk interval (7 gün) kontrolü eklendi.
- [x] Compression + policy kontrolü eklendi.
- [x] Timescale extension version kontrolü eklendi.
- [x] Migration checksum kontrolü eklendi.

## P0.15 — Multitenant migration safety
**Durum: 🟢 Kod tarafı tamam; negatif testler açık**

- [x] Yeni tenant kolonlarında kalıcı default eklenmiyor.
- [x] ALTER/FK hataları throw ediyor.
- [x] NULL tenant backfill `usr_admin` varsayımına körü körüne bağlanmıyor; `devices`, `telemetry_readings`, `active_alarms` vb. tablolar ilişkisel olarak gerçek kullanıcı/cihaz sahipliğine göre güncelleniyor.
- [ ] Yanlış tenant reconciliation.
- [ ] Tenant isolation negatif testleri.

## P0.16 — 🔴 YENİ: Schema readiness bypass
**Durum: 🟢 Tamamlandı**

`PostgresRepository.ensureTelemetrySchema()` advisory lock alınamadığında 3 saniye bekleyip `isSchemaEnsured=true` yapıyordu. Artık diğer instance'ın kilidi bırakması 15 saniyeye kadar izleniyor ve ardından `verifySchemaContract()` ile şemanın eksiksiz olduğu doğrulanıyor. Doğrulanamazsa `isSchemaEnsured=false` kalıyor.

- [x] Lock alınamadığında diğer instance'ın migration sonucunu gerçekten bekle (15s polling).
- [x] Başarı kanıtı olmadan `isSchemaEnsured=true` yapılmıyor (`verifySchemaContract()` zorunlu).
- [x] Timeout veya şema hatası durumunda readiness 503 kalıyor.
- [ ] Multi-instance migration/readiness testi.

## P0.17 — 🔴 YENİ: Migration bypass configuration
**Durum: 🟢 Tamamlandı**

`DISABLE_AUTO_MIGRATION=true` olduğunda `isSchemaEnsured=true` doğrudan atanıyordu. Artık üretim modunda (`NODE_ENV=production`) şema sözleşmesi (`verifySchemaContract()`) zorunlu koşuluyor ve doğrulanmayan şemalarda readiness 503 kalıyor.

- [x] Production'da `DISABLE_AUTO_MIGRATION=true` yalnızca doğrulanmış schema contract ile çalışıyor.
- [x] Bu flag readiness'i otomatik true yapmıyor.
- [ ] CI'da production environment policy testi.

## P0.18 — 🔴 YENİ: Process crash handling
**Durum: 🟢 Tamamlandı**

`server.ts` `uncaughtException` ve `unhandledRejection` olaylarında `gracefulCrashExit` mekanizması devreye alındı. Kritik loglar kaydedildikten sonra process'in bozuk bellek durumuyla yaşamasını önlemek adına 1 saniye içinde `process.exit(1)` yapılarak container supervisor'ının temiz bir container başlatması sağlandı.

- [x] `uncaughtException` sonrası kontrollü shutdown + supervisor/container restart politikası.
- [x] `unhandledRejection` için kontrollü crash exit politikası.
- [x] Graceful shutdown sırasında logların kaydedilmesi sağlandı.
- [ ] Docker restart policy ile E2E doğrulama.

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
- [ ] Uzun telemetry soak/load.
- [ ] Gerçek ESP8266/ESP32 `connect → telemetry → DB → dashboard → command → ACK → UI` E2E.
- [ ] Multi-instance schema migration/readiness testi.

---

# 3. 🟠 P1 — DOCKER / PRODUCTION / GÜVENİLİRLİK

## P1.1 — Compose / CI / production parity
- [ ] `timescale/timescaledb:latest-pg15` kaldırılmalı.
- [ ] CI `latest-pg16` ile production PostgreSQL 17 / TimescaleDB sürümleri eşleştirilmeli.
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
- [ ] DB healthcheck gerçek DB/user ile aynı kaynağı kontrol etmeli.
- [ ] App healthcheck readiness'i kontrol etmeli; yalnız liveness olmamalı.
- [ ] Proxy upstream healthcheck.
- [ ] DB restart recovery testi.

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
1. **P0.16** schema readiness bypass
2. **P0.17** migration bypass configuration
3. **P0.13** Timescale extension failure / migration false-success
4. **P0.14** schema verification false-positive
5. **P0.15** tenant backfill/isolation safety
6. **P0.3** sessiz DB write/hydration hataları
7. **P0.7** Timescale integrity
8. **P0.6** telemetry idempotency
9. **P0.8** telemetry loss/replay
10. **P0.18 + P0 Recovery** process/restart/ESP E2E
11. **P0.11** package/lock parity

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

Bir P0 maddesi ancak aşağıdaki şartlar sağlandığında `[x]` olabilir:

- Kod değişikliği uygulanmış.
- Temiz `npm ci` başarılı.
- Lint/type-check/test/build başarılı.
- Production schema ile uyum doğrulanmış.
- Migration başarısızlığı release'i gerçekten durduruyor.
- Schema verification gerçek DB metadata'sını kontrol ediyor.
- DB down / restart / recovery senaryosu test edilmiş.
- Telemetry idempotency ve Timescale integrity testleri yapılmış.
- Health/readiness doğru HTTP durum kodunu veriyor.
- Gerçek ESP cihazı ile kritik uçtan uca akış doğrulanmış.
- Roadmap ve Issue #1 aynı durumu gösteriyor.

**Kritik prensip:** Production'da PostgreSQL/TimescaleDB tek gerçek veri kaynağıdır. Local JSON/LowDB/Firestore production source-of-truth olamaz.

---

# 🎯 2026-09-12 SONRAKİ EN KRİTİK SIRA

**1. P0.16 → Yanlış schema readiness**  
**2. P0.17 → Migration bypass**  
**3. P0.13 → Timescale extension / migration false-success**  
**4. P0.14 → Schema verification false-positive**  
**5. P0.15 → Tenant backfill/isolation**  
**6. P0.3 → Sessiz DB hataları**  
**7. P0.7 → Timescale integrity**  
**8. P0.6 → Telemetry idempotency**  
**9. P0.8 → Telemetry loss/replay**  
**10. P0.18 + Recovery → process/restart/load/ESP E2E**
