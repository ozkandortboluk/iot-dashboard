# 🧭 NexusNode IoT — Proje Yapılacaklar ve Yol Haritası

> Merkezi backlog + doğrulanmış durum + önceliklendirilmiş yol haritası.
>
> **Son inceleme:** 2026-09-12  
> **Uygulama sürümü:** `1.9.9`  
> **HEAD:** `9ed205a8ce68e2acca2704537a11cc45ed4200a7`

## Öncelik
- 🔴 **P0:** production/site erişilebilirliği, veri bütünlüğü, DB mimarisi, build/deploy ve doğrudan çökme riski
- 🟠 **P1:** güvenlik, performans, operasyonel güvenilirlik
- 🟡 **P2:** mevcut özellik geliştirmeleri
- 🟢 **P3:** teknik borç / kalite
- ⭐⭐⭐⭐⭐: stratejik özellik

---

# 1. 🔴 P0 — DATABASE / SITE STABİLİTESİ

## P0.1 — PostgreSQL tek gerçek veri kaynağı
**Durum:** Büyük ölçüde tamamlandı; health/readiness fallback semantiği kaldı.

- [x] PostgreSQL/TimescaleDB production authoritative source of truth olarak tanımlandı.
- [x] Production local PostgreSQL fallback pool kaldırıldı; fallback yalnızca test ortamında.
- [x] Kritik CRUD write işlemleri PostgreSQL yokken 503 ile korunuyor.
- [x] Local JSON / Firestore production source-of-truth olmaktan çıkarıldı.
- [ ] Health/readiness response'larından `embedded_fallback` / LowDB semantiği kaldırılmalı.
- [ ] DB'ye yazan istisna endpoint'lerinin 503 politikası uçtan uca doğrulanmalı.

## P0.2 — Tek PostgreSQL connection pool
**Durum:** Tamamlanan kod değişiklikleri doğrulandı.

- [x] Unified shared PostgreSQL pool mevcut.
- [x] Production fallback `pg.Pool` kaldırıldı; yalnızca testte izinli.
- [x] Production DB bağlantısı olmadan normal startup engelleniyor.
- [x] Connection string çözümleme merkezi connection katmanında.
- [x] Ayrı local PostgreSQL pool ile split-brain engellendi.
- [ ] `DATABASE_URL` production sözleşmesi CI/deployment gate ile ayrıca zorunlu tutulmalı.

## P0.3 — DB hataları sessizce yutulmamalı
**Durum:** Kritik write yollarında uygulandı; tam repository taraması ve observability standardı kaldı.

- [x] Kritik `.catch(() => {})` write yolları düzeltildi.
- [x] Persistence hataları API seviyesine taşınıyor.
- [x] DB write guard 503 davranışı eklendi.
- [x] Global async error handling eklendi.
- [ ] `catch → empty result` davranışlarının tamamı yeniden taranmalı.
- [ ] DB read error ile gerçek `0 kayıt` sonucu tüm repository'lerde ayrıştırılmalı.
- [ ] Hata kodu + işlem + tenant/device context + correlation ID standardı tamamlanmalı.

## P0.4 — DB hazır olmadan uygulama hazır olmamalı
**Durum:** Startup/readiness kısmı uygulandı; migration determinismi kaldı.

- [x] DB initialization tamamlanmadan HTTP/WS server trafiğe açılmıyor.
- [x] Kritik DB yokluğunda 503 koruması var.
- [x] Liveness/readiness endpoint'leri ayrıldı.
- [x] Production local JSON hydration/split-brain davranışı kapatıldı.
- [ ] Startup schema/migration sırası versioned ve deterministik hale getirilmeli.

## P0.5 — Versioned migration sistemi
**Durum:** Yapılmadı.

- [ ] Runtime `CREATE/ALTER TABLE` mantığı versioned migration sistemine taşınmalı.
- [ ] Forward + rollback stratejisi.
- [ ] Migration/advisory lock.
- [ ] Büyük DDL/backfill startup dışına alınmalı.
- [ ] Migration başarısızsa readiness engellenmeli.

---

# 2. 🔴 P0 — TELEMETRY / TIMESCALEDB

## P0.6 — Telemetry packet idempotency

- [x] Kod seviyesinde `(device_id, boot_id, sequence)` unique constraint mevcut.
- [x] Packet deduplication bu kimliklerle tasarlanmış.
- [ ] Production DB constraint doğrulaması.
- [ ] `ON CONFLICT` ↔ gerçek constraint/index birebir doğrulaması.
- [ ] Duplicate/retry tek-kayıt testleri.
- [ ] Reboot / sequence / boot_id testleri.
- [ ] Out-of-order ve concurrent ingest testleri.

## P0.7 — `telemetry_readings` TimescaleDB bütünlüğü

- [ ] Composite PK `(id, created_at)` production DB'de doğrulanmalı.
- [ ] Hypertable/chunk interval production ile doğrulanmalı.
- [ ] Compression/retention migration ile yönetilmeli.
- [ ] Production TimescaleDB sürümü ile migration uyumu doğrulanmalı.
- [ ] 50 müşteri × 5 cihaz × yaklaşık 5 saniye hedefiyle gerçek load testi yapılmalı.

## P0.8 — Telemetry veri kaybı / sahte başarı

- [ ] DB down → RAM/WAL sözleşmesi kesinleştirilmeli.
- [ ] WAL boyutu, retry/replay sınırları belirlenmeli.
- [ ] WAL replay duplicate/partial commit testleri.
- [ ] RAM buffer taşması alarmı.
- [ ] `persisted=false/degraded` görünürlüğü.

## P0.9 — 🔴 YENİ: Health/readiness PostgreSQL-only olmalı
**Bulgu:** `src/server/routes/system.ts` içinde PostgreSQL yapılandırılmamışsa `/health/ready` ve `/health` `embedded_fallback` / `Embedded JSON Database (LowDB)` durumunu hazır gösterebiliyor. Bu, PostgreSQL Single Source of Truth ile çelişiyor.

- [ ] PostgreSQL yoksa health/readiness kesin `503 not_ready` üretmeli.
- [ ] Embedded/LowDB health response'ları production'dan kaldırılmalı.
- [ ] Startup, healthcheck ve readiness aynı DB sözleşmesini kullanmalı.
- [ ] Nginx/Docker/monitoring healthcheck zinciri doğrulanmalı.

## P0.10 — 🔴 YENİ: `tenant_id` / production schema drift regression gate
**Bulgu:** Daha önce production'da `tenant_id` eksikliği site crash zincirine neden oldu. Kodda runtime repair var ancak production schema drift'ini release öncesinde kesin yakalayan gate yok.

- [ ] Kritik kolonlar için startup schema verification.
- [ ] `tenant_id` regression testleri.
- [ ] Repo schema ↔ production DB drift release gate.
- [ ] Runtime repair kontrollü migration sistemine taşınmalı.

## P0.11 — 🔴 YENİ: `package.json` / `package-lock.json` dependency drift
**Bulgu:** `package.json` `express-async-errors` içeriyor; `package-lock.json` root dependency listesinde bu paket görünmüyor. CI `npm ci` kullanıyor. Temiz build/deploy bu nedenle kırılabilir.

- [ ] `package.json` ve `package-lock.json` senkronlanmalı.
- [ ] `npm ci` temiz ortam release gate olmalı.
- [ ] `express-async-errors` lockfile'a dahil edilmeli.
- [ ] Docker build ve CI dependency kurulumu aynı şekilde doğrulanmalı.

---

# 3. 🔴 P0 — PRODUCTION RECOVERY / DOWNTIME

- [ ] PostgreSQL restart → app recovery.
- [ ] App restart → proxy recovery.
- [ ] Proxy restart → HTTP + WebSocket recovery.
- [ ] Host reboot → DB → app → proxy recovery.
- [ ] DB connection exhaustion.
- [ ] Disk full.
- [ ] Network interruption.
- [ ] WebSocket reconnect/backoff.
- [ ] Uzun telemetry soak.
- [ ] Gerçek ESP8266/ESP32 `connect → telemetry → DB → dashboard → command → ACK → UI` testi.

---

# 4. 🟠 P1 — DOCKER / PRODUCTION

## P1.1 — Compose / CI / production parity
**Güncel bulgu:** Repo Compose `timescale/timescaledb:latest-pg15`, default PostgreSQL/JWT secret'ları ve host `5432` publish kullanıyor. CI `latest-pg16`; gerçek production PostgreSQL 17 + TimescaleDB 2.29.1 ile çalıştırılmıştı.

- [ ] DB image sürümü pinlenmeli; `latest` kaldırılmalı.
- [ ] Compose + CI + gerçek production DB sürümü eşleştirilmeli.
- [ ] Image digest pinleme.
- [ ] Gereksiz host `5432` publish kaldırılmalı.
- [ ] DB yalnız private Docker network'te olmalı.
- [ ] Firewall/allowlist doğrulanmalı.

## P1.2 — Default secret'lar
- [ ] Default PostgreSQL password production'da engellenmeli.
- [ ] Default JWT/session secret production'da engellenmeli.
- [ ] Secret rotation.
- [ ] Secret scanning CI.

## P1.3 — Healthcheck / readiness zinciri
- [ ] DB healthcheck runtime DB/user ile aynı kaynağı kontrol etmeli.
- [ ] App healthcheck DB readiness'i doğrulamalı.
- [ ] Proxy HTTP + gerekiyorsa WS healthcheck.
- [ ] DB restart sonrası `depends_on` recovery testi.

## P1.4 — Duplicate schema kaynakları
- [ ] Tek canonical schema/migration kaynağı.
- [ ] Aynı tablo/kolon için farklı tanımlar kaldırılmalı.
- [ ] Runtime DDL ↔ migration DDL çakışması kaldırılmalı.
- [ ] Schema drift CI testi.

## P1.5 — Foreign key / referans bütünlüğü
- [ ] Kaldırılan FK'ler belgelenmeli.
- [ ] Orphan device/telemetry reconciliation job.
- [ ] Tenant/device referans bütünlüğü uygulama seviyesinde garanti edilmeli.
- [ ] `DROP CONSTRAINT ... CASCADE` yalnız migration içinde çalışmalı.

## P1.6 — Auto-Healer sınırları
- [ ] Bakım sorguları normal query trafiğinden ayrılmalı.
- [ ] `pg_terminate_backend` güvenli koşullara bağlanmalı.
- [ ] Connection recycle loop engellenmeli.
- [ ] Terminate/recycle audit log.
- [ ] Auto-Healer kapalı normal çalışma testi.

## P1.7 — Gerçek PostgreSQL backup
- [ ] Production `pg_dump` uyumluluğu garanti edilmeli.
- [ ] Gerçek restore edilebilir PostgreSQL/TimescaleDB dump doğrulanmalı.
- [ ] JSON fallback açıkça `metadata-only`.
- [ ] Backup retention + harici hedef.
- [ ] Periyodik restore drill.

## P1.8 — Yeni: Release/version metadata parity
- [ ] `package.json`, `package-lock.json`, version source, CHANGELOG ve roadmap aynı release bilgisini göstermeli.
- [ ] CI metadata drift'i fail ettirmeli.
- [ ] Deployment öncesi commit SHA + uygulama sürümü görünür olmalı.

## P1.9 — WebSocket / Command / Device
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

# 5. 🟡 P2 — MEVCUT ÖZELLİKLER

## Live Dashboard
- [ ] Render/memory optimizasyonu.
- [ ] Stale/offline operasyon mesajları.
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

# 6. 🟢 P3 — KALİTE / TEKNİK BORÇ

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

# 7. ⭐ STRATEJİK ÖZELLİKLER

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

# 8. 🏗️ UYGULAMA SIRASI

### Faz 0 — Siteyi ve veriyi koru
1. PostgreSQL Single Source of Truth — **kod mimarisi uygulandı; health/readiness temizliği kaldı**.
2. Tek shared PostgreSQL pool — **uygulandı**.
3. Sessiz DB write error'larını düzelt — **kritik yollar uygulandı; tam tarama kaldı**.
4. Startup DB readiness — **uygulandı**.
5. Versioned migration.
6. Telemetry idempotency/integrity testleri.
7. Health/readiness PostgreSQL-only.
8. `package-lock` dependency parity.
9. Production schema drift / `tenant_id` regression gate.
10. Compose/CI/production DB parity.
11. Gerçek PostgreSQL backup/restore.
12. DB/app/proxy outage ve recovery testleri.

### Faz 1 — IoT çekirdeği
13. Gerçek cihaz telemetry soak/load.
14. Command ACK/state doğruluğu.
15. Alarm lifecycle.
16. Device Health.

### Faz 2 — Saha operasyonu
17. OTA Deployment Manager.
18. Canary/rollback.
19. Maintenance + Sites/Groups.

### Faz 3 — Kurumsal
20. Audit & Security.
21. Device Credential Center.
22. Tenant Management 2.0.
23. Reporting.

### Faz 4 — Ölçek
24. Observability.
25. Backup/DR.
26. Integrations.
27. Load/soak/capacity planning.

---

# 9. ✅ DATABASE DEFINITION OF DONE

- [x] PostgreSQL/TimescaleDB authoritative source mimarisi.
- [x] Tek shared PostgreSQL pool.
- [x] Production DB yoksa fail-fast.
- [x] Local JSON production source-of-truth değil.
- [x] Firestore source-of-truth değil.
- [x] Kritik DB write hataları sessizce yutulmuyor.
- [x] DB down write guard / 503.
- [x] Startup DB readiness.
- [x] Liveness/readiness ayrımı.
- [x] Telemetry dedup constraint kod seviyesinde.
- [ ] Canonical versioned migration.
- [ ] Production constraint / `ON CONFLICT` doğrulaması.
- [ ] Hypertable/chunk/compression/retention production testleri.
- [ ] Tenant isolation tam test.
- [ ] Connection exhaustion.
- [ ] Gerçek PostgreSQL backup restore.
- [ ] DB restart/recovery.
- [ ] Gerçek cihaz telemetry soak.
- [ ] Production schema drift gate.
- [ ] PostgreSQL-only health/readiness.
- [ ] Clean `npm ci` build/deploy gate.

---

# 10. 🔍 VERİTABANI İNCELEME CHECKLIST

1. PostgreSQL bağlantı kaynağı ve tek pool.
2. `DATABASE_URL` / environment precedence.
3. Local JSON/RAM fallback.
4. Firestore/harici DB bağlantısı.
5. Repository → DB çağrı zincirleri.
6. Swallowed DB errors.
7. Transaction sınırları.
8. Retry/idempotency.
9. Pool exhaustion.
10. Runtime DDL/migration.
11. Schema drift.
12. Tenant isolation/RLS.
13. Timescale hypertable/chunk/compression/retention.
14. Telemetry dedup.
15. WAL/replay/data-loss riski.
16. Backup/restore.
17. Auto-Healer.
18. DB health/readiness.
19. Docker/PostgreSQL parity.
20. Restart/recovery.
21. `package.json` ↔ `package-lock.json` parity.
22. `tenant_id` ve kritik kolon regression.

---

# 11. 📌 GÜNCEL İNCELEME NOTU — 2026-09-12

- Son HEAD: `9ed205a8ce68e2acca2704537a11cc45ed4200a7`; package sürümü: `1.9.9`.
- PostgreSQL Single Source of Truth, unified pool, production fail-fast, write guard ve startup DB readiness kod seviyesinde uygulanmış durumda.
- `src/server/routes/system.ts` hâlâ `embedded_fallback` / LowDB health semantiği taşıyor: **P0.9**.
- `src/server/database/schema.ts` hâlâ runtime DDL/repair mantığı taşıyor: **P0.5**.
- Telemetry packet dedup constraint kodda var; production doğrulama ve kapsamlı testler eksik: **P0.6**.
- Önceki `tenant_id` crash'i nedeniyle schema drift regression gate eklendi: **P0.10**.
- `package.json` `express-async-errors` içeriyor; `package-lock.json` root dependency listesinde görünmüyor ve CI `npm ci` çalıştırıyor: **P0.11**.
- Repo Compose `latest-pg15` + default secret + host `5432`; CI `latest-pg16`; gerçek production PostgreSQL 17/TimescaleDB 2.29.1: **P1.1**.

> **Kritik karar:** Yeni özellik geliştirmelerine geçmeden önce P0 tamamlanmalıdır. İlk sıradaki işler: **P0.11 → P0.9 → P0.10 → P0.5 → telemetry integrity → gerçek outage/recovery testleri.**
