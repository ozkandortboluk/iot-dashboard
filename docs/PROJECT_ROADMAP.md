# 🧭 NexusNode IoT — Proje Yapılacaklar ve Yol Haritası

> Merkezi backlog + hata düzeltme + mevcut özellik geliştirme + yeni özellik yol haritası.
>
> **Son inceleme:** 2026-09-09  
> **Güncel uygulama sürümü:** `1.6.0`  
> **Son HEAD:** `14b9ed30bf389896139f55e6c76b4147efaecdf1`

## Öncelik
- 🔴 P0: production/site erişilebilirliği, veri kaybı veya kritik güvenlik
- 🟠 P1: yüksek öncelik
- 🟡 P2: planlı geliştirme
- 🟢 P3: teknik borç/kalite
- ⭐⭐⭐⭐⭐: stratejik özellik

---

# 1. 🔴 P0 — Site çökmesine neden olabilecek durumlar

## P0.1 — Docker Compose DB healthcheck yanlış veritabanını kontrol ediyor
**Bulgu:** `POSTGRES_DB` değişkeni özelleştirilebilirken TimescaleDB healthcheck sabit olarak `nexus_iot` veritabanını kontrol ediyor. Uygulama ise `DATABASE_URL` içinde `${POSTGRES_DB}` değerini kullanıyor. Dolayısıyla `.env` içinde `POSTGRES_DB=nexus_production` gibi farklı bir değer verilirse PostgreSQL doğru veritabanını çalıştırdığı halde healthcheck başarısız olabilir.

**Olası zincir:**
`DB healthcheck FAIL → app depends_on service_healthy bekler → app başlamaz → proxy app healthy bekler → site açılmaz.`

**Risk:** 🔴 **P0 / doğrudan site downtime riski.** Özellikle temiz kurulum, migration, VPS taşıma veya `.env` değişikliğinde ortaya çıkabilir. fileciteturn90file0L2-L2

- [ ] Healthcheck `${POSTGRES_DB}` / aynı runtime DB bilgisi ile uyumlu hale getirilmeli.
- [ ] Farklı DB adıyla CI/production compose startup testi eklenmeli.
- [ ] `docker compose up -d` sonrası `timescaledb → app → proxy` health zinciri release gate olmalı.
- [ ] DB restart sonrası app/proxy recovery testi yapılmalı.

## P0.2 — Gerçek production outage testi
- [ ] DB yeniden başlatma.
- [ ] App container restart.
- [ ] Nginx/proxy restart.
- [ ] Disk doluluğu.
- [ ] DB connection exhaustion.
- [ ] WebSocket reconnect.
- [ ] Host reboot sonrası otomatik toparlanma.

---

# 2. 🔴 P0 — Production güvenilirliği

- [ ] Gerçek ESP8266/ESP32 ile `connect → telemetry → DB → dashboard → command → ACK → UI` zinciri.
- [ ] En az birkaç saatlik gerçek telemetry/WS soak testi.
- [ ] Backup/restore + migration + release upgrade birlikte doğrulanmalı.
- [ ] Reverse proxy üzerinden gerçek HTTP + WS production testi.

---

# 3. 🟠 P1 — Güncel yüksek öncelikler

## 3.1 Version / lockfile
- `package.json`: **1.6.0**. fileciteturn73file0L2-L2
- `src/config/version.ts`: **1.6.0**. fileciteturn74file0L2-L2
- `package-lock.json`: **1.4.0**. fileciteturn72file0L2-L2
- [ ] Lockfile kesin olarak 1.6.0 ile senkronlanmalı.
- [ ] CI `npm ci` öncesinde package/lock eşitliğini zorunlu kontrol etmeli.

## 3.2 Production secret/default değerleri
Compose içinde default PostgreSQL password ve default session secret bulunuyor. fileciteturn90file0L2-L2
- [ ] Production'da default değerlerle startup engellenmeli.
- [ ] Secret yönetimi zorunlu hale getirilmeli.
- [ ] Session secret rotation prosedürü eklenmeli.

## 3.3 PostgreSQL erişim yüzeyi
- Compose PostgreSQL portunu host'a publish ediyor. fileciteturn90file0L2-L2
- [ ] Production'da DB'nin internete açık olmaması doğrulanmalı.
- [ ] Firewall/allowlist kontrolü.
- [ ] DB yalnızca private Docker network üzerinden erişilebilir olmalı.

## 3.4 Telemetry DB integrity
- [x] Deterministic batch ordering + deadlock/serialization retry.
- [x] FK kaldırma ile ingest kilitlenmesi azaltıldı.
- [ ] Orphan telemetry reconciliation'ın production davranışı doğrulanmalı.
- [ ] Idempotency + retry yük testi.
- [ ] Partial commit / duplicate packet regression testi.

## 3.5 WebSocket
- [x] Auth/origin/tenant temel testleri.
- [x] Telemetry schema ve command round-trip.
- [ ] Credential revoke sonrası tüm aktif socket'lerin kapanması.
- [ ] Reconnect/backoff/duplicate event.
- [ ] Backpressure ve max payload soak testi.
- [ ] Query-string credential kullanımının tamamen kaldırılması.

## 3.6 Multi-tenant
- [x] REST/DB/WS için temel negatif izolasyon testleri.
- [ ] Telemetry/history/command/alarm/notification/automation/dashboard/OTA/export için sürekli regression matrisi.

## 3.7 OTA
- [x] Signature/hash, compatibility, canary, rollback ve concurrent deployment korumaları.
- [ ] Gerçek saha rollout testi.
- [ ] Deployment timeout/recovery.
- [ ] Firmware artifact retention.

---

# 4. 🟡 P2 — CI/CD ve test

CI Node 20/22 + TimescaleDB + unit + smoke + E2E çalıştırıyor. fileciteturn75file0L2-L2

- [ ] Docker image build'i CI'da gerçek compose health zinciriyle doğrulamak.
- [ ] Farklı `POSTGRES_DB` ile compose startup testi.
- [ ] Production schema/migration parity.
- [ ] Load/soak test.
- [ ] Disk/DB connection exhaustion testi.
- [ ] CI failure artifact kapsamını genişletmek.

---

# 5. 🟡 P2 — Mevcut özellik geliştirmeleri

## Canlı Dashboard
- [x] Connected/Reconnecting/Offline.
- [x] Widget freshness.
- [x] Last data / age / latency.
- [x] Command Pending/Applied/Failed/Timeout.
- [ ] Büyük dashboardlarda render/memory optimizasyonunu sürekli ölçmek.
- [ ] Offline/stale durumda kullanıcıya net operasyon mesajı.

## Device Management
- [x] Site/Bölge/Grup/Cihaz hiyerarşisi.
- [x] Tags.
- [x] Maintenance mode.
- [x] Health/firmware/telemetry/command/alarm özeti.
- [x] Device replacement history.
- [ ] Toplu operasyonlar ve bakım planlama.

## Discovery & Pairing
- [x] QR + discovery provisioning.
- [x] Lifecycle.
- [x] Duplicate identity.
- [x] Tenant/location assignment.
- [x] Pairing audit.
- [ ] Provisioning başarısızlık/recovery UX.

## Generic Control Panel
- [ ] Relay/digital/PWM/analog ortak command schema.
- [ ] Button/toggle/slider/selector.
- [ ] Kritik komut confirmation.
- [ ] Result feedback/history.
- [ ] Manual/automation ayrımı.
- [ ] Fail-safe/default state.

## Telemetry
- [ ] Metric catalog/unit normalization.
- [ ] Aggregation + downsampling.
- [ ] Data quality: duplicate/delayed/out-of-order.
- [ ] Clock drift.
- [ ] Ingest latency/retry/drop metrics.
- [ ] Retention/compression.

## Alarm & Notification
- [ ] Triggered → Acknowledged → Resolved.
- [ ] Severity/hysteresis/debounce/cooldown.
- [ ] Escalation/flood protection.
- [ ] Offline alarm.
- [ ] Quiet hours/maintenance suppression.

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
- [ ] Widget drag/edit/swipe.
- [ ] Alarm quick access.
- [ ] Connection visibility.
- [ ] QR pairing optimization.
- [ ] Accessibility.

---

# 6. 🟢 P3 — Teknik borç / kalite

- [ ] package/version/CHANGELOG/README/roadmap tam senkron.
- [ ] OpenAPI ↔ gerçek API.
- [ ] Versioned WebSocket protocol.
- [ ] CSP/HSTS/security headers.
- [ ] Request/body limits.
- [ ] Dependency vulnerability + secret scanning.
- [ ] Structured audit log.
- [ ] Backup restore drill.
- [ ] Production load/soak/capacity plan.

---

# 7. ⭐ Yeni özellikler — öncelik

1. ⭐⭐⭐⭐⭐ Command Center
2. ⭐⭐⭐⭐⭐ Device Health Center 2.0
3. ⭐⭐⭐⭐⭐ Alarm Management Center
4. ⭐⭐⭐⭐⭐ OTA Deployment Manager
5. ⭐⭐⭐⭐⭐ Device Credential Center
6. ⭐⭐⭐⭐⭐ Audit & Security Center
7. ⭐⭐⭐⭐ Telemetry Explorer
8. ⭐⭐⭐⭐ Sites/Groups/Locations
9. ⭐⭐⭐⭐ Dashboard Templates
10. ⭐⭐⭐⭐ System Observability Center
11. ⭐⭐⭐⭐ Backup & Disaster Recovery Center
12. ⭐⭐⭐⭐ Reporting & Integration Center

---

# 8. 🏗️ Uygulama sırası

### Faz 1 — Önce siteyi koru
1. **P0.1 DB healthcheck riskini düzelt.**
2. Secret/default değerlerini production-safe yap.
3. DB port exposure'ını kontrol et.
4. Docker → DB → App → Proxy recovery testleri.
5. Version/lockfile senkronizasyonu.

### Faz 2 — IoT çekirdeği
6. Telemetry integrity/load.
7. Command Center.
8. Alarm lifecycle.
9. Device Health.

### Faz 3 — Saha operasyonu
10. OTA Deployment Manager.
11. Canary/rollback.
12. Maintenance + Sites/Groups.

### Faz 4 — Kurumsal
13. Audit & Security.
14. Device Credential Center.
15. Tenant Management 2.0.
16. Reporting.

### Faz 5 — Ölçek
17. Observability.
18. Backup/DR.
19. Integrations.
20. Load/soak/capacity planning.

---

# 9. ✅ Definition of Done

P0/P1 tamamlanmadan production'a alınmamalı:
- [ ] Unit/integration test
- [ ] Gerekirse E2E
- [ ] Tenant isolation
- [ ] WS etkisi
- [ ] DB migration/rollback
- [ ] Docker health chain
- [ ] Reverse proxy
- [ ] Gerçek cihaz/simülatör
- [ ] Restart/recovery
- [ ] Backup/restore
- [ ] Version/lockfile/CHANGELOG senkronu

---

# 10. 🔄 Her incelemede

HEAD/commitler, P0/P1/P2/P3, auth/CSRF/CORS, multi-tenant, WS, command, telemetry/TimescaleDB, alarm/notification, automation, OTA, Docker/CI/CD, dependency/lockfile, dashboard/mobile UX, API/OpenAPI, version consistency, mevcut özellikler ve yeni özellikler yeniden kontrol edilir.

> Bu dosya ve GitHub Issue #1 merkezi kalite/backlog/yol haritasıdır. İnceleme sırasında kaynak kodu ve diğer proje dosyaları değiştirilmez; yalnızca bu dosya ve Issue #1 güncellenebilir.
