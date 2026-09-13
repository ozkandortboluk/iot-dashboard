# 🧭 NexusNode IoT — Proje Yapılacaklar ve Yol Haritası

> Merkezi backlog + doğrulanmış P0 durumu + önceliklendirilmiş yol haritası.
>
> **Son inceleme:** 2026-09-13  
> **İncelenen HEAD:** `0d8bca034fbfd54bb5fd4b92e13bb189bfd91955`  
> **package.json:** `1.17.7`  
> **Not:** Bugünkü değişiklikler özellikle PostgreSQL tenant kapsamı, DB dayanıklılığı, sistem logları, test izolasyonu ve yönetim arayüzü tarafını ileri taşıdı.

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
- [x] `/system/stats` PostgreSQL/TimescaleDB veya disconnected durumunu raporluyor.
- [x] PostgreSQL tenant scope kontrolleri notifications/logs/alarms tarafında güçlendirildi.
- [x] Memory/PostgreSQL permission kontrolleri standardize edilmeye başlandı.
- [ ] `LocalDatabase` / legacy `db.json` katmanının production source-of-truth olamayacağı runtime policy ile kesinleştirilmeli.
- [ ] Firestore legacy/stub/sync yolları production veri akışından tamamen ayrıştırılmalı veya kaldırılmalı.
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
- [x] Migration 002 Timescale extension enable hatası production'da fail ediyor.
- [x] Hydration sırasında yakalanan DB hataları system logger'a kaydediliyor.
- [x] Backup catch yolları sessizce kaybolmak yerine loglanıyor.
- [ ] DB read error ile gerçek boş sonuç ayrımı tam taranmalı.
- [ ] Tenant scope/read-query regresyon testleri eklenmeli.

## P0.4 — DB hazır olmadan uygulama hazır olmamalı
**Durum: 🟢 Kod tarafı tamam; operasyon testi açık**

- [x] `isReady()` schema ensure koşulunu dikkate alıyor.
- [x] `/health/ready` DB hazır değilse 503.
- [x] Advisory lock sonrası schema verification zorunlu.
- [x] Startup timeout sonrası readiness yalnız gerçek DB/schema durumuna göre belirleniyor.
- [ ] Nginx → app → DB failure-injection testi.

## P0.5 — Versioned migration sistemi
**Durum: 🟢 Kod tarafı tamam; down rollback açık**

- [x] `001–004` sıralı migration yapısı.
- [x] `schema_migrations`.
- [x] Advisory lock.
- [x] Pending migration transaction/rollback modeli.
- [x] Timescale extension failure fail ediyor.
- [ ] `down` migration'lar gerçek rollback veya açık irreversible politika sağlamalı.
- [x] Migration checksum SHA-256 yazılıyor ve drift kontrol ediliyor.
- [x] Migration sonrası otomatik schema verification.
- [ ] Runtime DDL ile migration DDL tek canonical kaynağa indirilmeli.

## P0.6 — Telemetry packet idempotency
**Durum: 🟢 Kod tarafı tamam; yük testi açık**

- [x] `(device_id, boot_id, sequence)` unique constraint tanımlı.
- [x] Dedup modeli mevcut.
- [x] Verification gerçek constraint kolonlarını ordinal sırayla doğruluyor.
- [x] `ON CONFLICT (device_id, boot_id, sequence)` hedefi gerçek constraint ile birebir eşleşiyor.
- [ ] Duplicate/retry/reboot/out-of-order/concurrent production-benzeri test kanıtı.

## P0.7 — `telemetry_readings` TimescaleDB bütünlüğü
**Durum: 🟠 Büyük ölçüde tamamlandı; load testi açık**

- [x] Verifier `telemetry_readings` hypertable olup olmadığını kontrol ediyor.
- [x] Composite PK `(id, created_at)` sırasını kontrol ediyor.
- [x] 7 günlük chunk interval katalogdan kesin kontrol ediliyor.
- [x] Compression ayarı ve compression policy katalogdan kontrol ediliyor.
- [x] Timescale extension/version production için zorunlu.
- [x] `simulation_telemetry_readings` hypertable doğrulaması var.
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
**Durum: 🟠 Kısmi; bugünkü değişikliklerle iyileştirildi**

- [x] Critical column verification mevcut.
- [x] `tenant_id` migration mevcut.
- [x] DATABASE_URL CI/production gate mevcut.
- [x] Notifications, logs ve alarms için tenant scope filtreleri güçlendirildi.
- [x] Legacy record tenant sync/migration iyileştirildi.
- [ ] Tenant backfill gerçek müşteri eşlemesine göre doğrulanmalı.
- [ ] NULL/yanlış tenant reconciliation.
- [ ] Tenant column type/default/index/FK tam doğrulanmalı.
- [ ] Tenant isolation negatif testleri.

## P0.11 — package/lock dependency drift
**Durum: 🔴 Açık**

- [x] `npm ci` modeli mevcut.
- [x] `verify:schema` scripti mevcut.
- [ ] `package.json` sürümü `1.17.7` iken `package-lock.json` hâlâ `1.17.2`; senkronize edilmeli.
- [ ] CI metadata drift fail etmeli.

## P0.12 — Production DB-only enforcement
**Durum: 🟢 Kod tarafı tamam; regression testi açık**

- [x] Production `local` engine seçimi engellendi.
- [x] `/system/stats` SQLite raporlamasından çıkarıldı.
- [x] Production runtime PostgreSQL kullanımına zorlanıyor.
- [ ] PostgreSQL-only regression test.
- [ ] Legacy local/Firestore yollarının production write path'inden kesin ayrıldığı otomatik test.

## P0.13 — Migration false-success
**Durum: 🟢 Kod tarafı tamam**

- [x] 002 hypertable/compression errors throw ediyor.
- [x] 003 PK/unique errors throw ediyor.
- [x] 004 tenant ALTER/FK errors throw ediyor.
- [x] Timescale extension oluşturulamaması production migration'ı fail ettiriyor.
- [x] Migration contract gate başarı kaydından önce/sonra çalışıyor.

## P0.14 — Schema verification false-positive
**Durum: 🟢 Tamamlandı**

- [x] Composite PK `(id, created_at)` sıkı kontrol ediliyor.
- [x] Unique constraint kolonları ordinal sırayla kontrol ediliyor.
- [x] Hypertable dimension/chunk interval kontrolü var.
- [x] Compression + policy kontrolü var.
- [x] Timescale extension version kontrolü var.
- [x] Migration checksum kontrolü var.

## P0.15 — Multitenant migration safety
**Durum: 🟠 Kod büyük ölçüde tamam; negatif testler açık**

- [x] Yeni tenant kolonlarında kalıcı default eklenmiyor.
- [x] ALTER/FK hataları throw ediyor.
- [x] NULL tenant backfill ilişkisel sahiplik mantığına taşındı.
- [x] Tenant kapsamı notifications/logs/alarms için kod seviyesinde güçlendirildi.
- [ ] Yanlış tenant reconciliation.
- [ ] Tenant isolation negatif testleri.
- [ ] Gerçek çoklu müşteri verisiyle cross-tenant sızıntı testi.

## P0.16 — Schema readiness bypass
**Durum: 🟢 Kod tarafı tamam; multi-instance testi açık**

- [x] Lock alınamadığında diğer instance'ın migration sonucunu bekleme/polling var.
- [x] Başarı kanıtı olmadan `isSchemaEnsured=true` yapılmıyor.
- [x] Timeout/schema hatasında readiness 503 kalıyor.
- [ ] Multi-instance migration/readiness testi.

## P0.17 — Migration bypass configuration
**Durum: 🟢 Kod tarafı tamam; CI policy testi açık**

- [x] Production'da `DISABLE_AUTO_MIGRATION=true` yalnız doğrulanmış schema contract ile çalışıyor.
- [x] Flag readiness'i otomatik true yapmıyor.
- [ ] CI'da production environment policy testi.

## P0.18 — Process crash handling
**Durum: 🟢 Kod tarafı tamam; operasyon doğrulaması açık**

- [x] `uncaughtException` sonrası kontrollü crash exit.
- [x] `unhandledRejection` için kontrollü crash exit.
- [x] Graceful shutdown loglama mekanizması.
- [ ] Docker restart policy ile E2E doğrulama.

---

# 2. 🔴 P0 — BUGÜNKÜ DEĞİŞİKLİKLERDEN SONRA YENİ / GÜNCEL ÖNCELİKLER

## P0.19 — Package-lock release parity
**Durum: 🔴 Yeni kritik**

Bugünkü uygulama sürümü `1.17.7` iken lockfile üst metadata'sı `1.17.2` olarak kalmış durumda. Bu, `npm ci`, release metadata ve sürüm denetimleri arasında drift oluşturabilir.

- [ ] `package-lock.json` kök ve workspace version alanlarını `1.17.7` ile eşitle.
- [ ] CI'da package/lock/version source parity gate zorunlu olsun.
- [ ] Release öncesi beklenmeyen lockfile drift kontrolü.

## P0.20 — Production Compose ile CI Timescale parity
**Durum: 🔴 Yeni / mevcut risk**

Repository production compose `timescale/timescaledb:latest-pg15` kullanırken CI `latest-pg16` kullanıyor. Bu, şema/extension davranışının production ile CI arasında ayrışmasına neden olabilir.

- [ ] Production ve CI PostgreSQL/Timescale majör sürümlerini tek sürüm politikasında birleştir.
- [ ] Image digest pinle.
- [ ] Upgrade/restore testini CI'ya ekle.

## P0.21 — Docker production secret / network güvenliği
**Durum: 🔴 Yeni / doğrudan production riski**

`docker-compose.yml` içinde varsayılan PostgreSQL parolası, JWT secret'ı ve host `5432` port publish'i mevcut. Production'da gerçek secret verilmemesi durumunda tahmin edilebilir güvenlik açığı ve gereksiz DB erişim yüzeyi oluşabilir.

- [ ] Production'da default DB password kesinlikle reddedilmeli.
- [ ] Default JWT/session secret kesinlikle reddedilmeli.
- [ ] Host `5432` publish kaldırılmalı; DB yalnız private Docker network'ten erişilebilir olmalı.
- [ ] Secret scanning + startup policy.

## P0.22 — DB restart / proxy recovery gerçek testi
**Durum: 🔴 Açık**

Kod tarafında health/readiness ve restart davranışları belirgin biçimde güçlendi; fakat gerçek Docker/PostgreSQL/Nginx failure-injection sonucu henüz roadmap üzerinde doğrulanmış değil.

- [ ] PostgreSQL restart → app recovery.
- [ ] App restart → proxy recovery.
- [ ] Proxy restart → HTTP + WebSocket recovery.
- [ ] Host reboot → DB → app → proxy.
- [ ] Gerçek ESP8266/ESP32 `connect → telemetry → DB → dashboard → command → ACK → UI` E2E.

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
- [ ] Uzun telemetry soak/load.
- [ ] Gerçek ESP8266/ESP32 `connect → telemetry → DB → dashboard → command → ACK → UI` E2E.
- [ ] Multi-instance schema migration/readiness testi.

---

# 4. 🟠 P1 — DOCKER / PRODUCTION / GÜVENİLİRLİK

## P1.1 — Compose / CI / production parity
- [ ] `latest-pg15` / `latest-pg16` ayrımı kaldırılmalı; production ile CI aynı majör sürümde olmalı.
- [ ] Image digest pinleme.
- [ ] Host `5432` publish kaldırılmalı.
- [ ] DB private Docker network'te kalmalı.
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
- [ ] `package.json`, `package-lock.json`, `version.ts`, CHANGELOG ve roadmap aynı release bilgisini göstermeli.
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

## P1.10 — Sistem logları / gözlemlenebilirlik
**Bugünkü geliştirmelerle temel atıldı; şimdi operasyonel hale getirilmeli.**

- [x] Persistent System Logs API/arayüzü mevcut.
- [x] HTTP 5xx observer eklendi.
- [x] Dashboard/system state persistence geliştirildi.
- [ ] Log severity/source/correlation ID standardizasyonu.
- [ ] Error → request → device → tenant zincirinin tek trace kimliğiyle izlenmesi.
- [ ] Log retention/rotation.
- [ ] Kritik P0 olaylarında alarm/notification entegrasyonu.

---

# 5. 🟡 P2 — MEVCUT ÖZELLİKLER

## Live Dashboard
- [ ] Render/memory optimizasyonu.
- [ ] Stale/offline mesajları.
- [ ] Persisted vs live data görünürlüğü.
- [ ] Bugünkü localStorage state persistence davranışlarının tenant/device değişimlerinde regresyon testi.

## Device Management
- [ ] Toplu operasyonlar.
- [ ] Bakım planlama.
- [ ] Health timeline.
- [ ] Device replacement veri bütünlüğü.
- [ ] Customer selector UX'in admin/test hesapları dışındaki gerçek müşteri sıralama ve filtre davranışı.

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
- [ ] Test verisi ile production verisinin daha sert sınırlandırılması.

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

# 8. 🏗️ GÜNCEL UYGULAMA SIRASI

### Faz 0 — Production güvenliğini tamamla
1. **P0.11 + P0.19** — package/lock/version parity (`1.17.7`)
2. **P0.20** — Production/CI Timescale sürüm parity + digest pin
3. **P0.21** — Default secret ve host DB port güvenliği
4. **P0.22 + Recovery** — DB/app/proxy restart ve gerçek ESP E2E
5. **P0.15** — Tenant isolation negatif testleri
6. **P0.6** — Telemetry idempotency load/replay kanıtı
7. **P0.7** — Timescale soak/load kanıtı
8. **P0.8** — Telemetry loss/replay failure-injection
9. **P0.16/P0.17** — Multi-instance + CI policy doğrulaması
10. **P0.1/P0.12** — PostgreSQL-only regression + legacy path izolasyonu

### Faz 1 — Telemetry + cihaz güvenilirliği
- Telemetry soak/load
- Command ID → ACK → final state
- Device health
- Alarm lifecycle
- System Logs correlation

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

# 9. ✅ DEFINITION OF DONE

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

# 🎯 2026-09-13 SONRAKİ EN KRİTİK SIRA

**1. P0.11/P0.19 → `package-lock.json` sürüm drift'i (1.17.2 → 1.17.7)**  
**2. P0.20 → CI/production Timescale sürüm farkı**  
**3. P0.21 → Production default secret + host 5432 exposure**  
**4. P0.22 → Gerçek DB/app/proxy recovery + ESP uçtan uca test**  
**5. P0.15 → Tenant isolation negatif testleri**  
**6. P0.6 → Telemetry idempotency/load kanıtı**  
**7. P0.7 → Timescale soak/load kanıtı**  
**8. P0.8 → Telemetry loss/replay failure-injection**  
**9. P0.16/P0.17 → Multi-instance + CI policy doğrulaması**  
**10. P0.1/P0.12 → PostgreSQL-only regression ve legacy DB yollarının kesin izolasyonu**
