# 🧭 NexusNode IoT — Proje Yapılacaklar ve Yol Haritası

> Merkezi backlog + hata düzeltme + mevcut özellik geliştirme + yeni özellik yol haritası.
>
> **Son inceleme:** 2026-09-09  
> **Sürüm:** `1.4.0`

## Öncelik
- 🔴 P0: production/veri/güvenlik açısından kritik
- 🟠 P1: yüksek öncelik
- 🟡 P2: planlı geliştirme
- 🟢 P3: teknik borç/kalite
- ⭐⭐⭐⭐⭐: stratejik özellik

---

# 1. 🔴 P0 — Production

- [x] Gerçek ESP8266/ESP32 ile `connect → telemetry → DB → dashboard → command → ACK → UI` zinciri (`src/tests/esp_hardware_e2e.test.ts`).
- [x] Ağ kopması, reconnect, cihaz reboot ve komut kuyruğu soak testi (`src/tests/network_reconnect_reboot_soak.test.ts`).
- [x] Docker + PostgreSQL/TimescaleDB + reverse proxy + WebSocket gerçek production-benzeri doğrulaması (`src/tests/docker_postgres_proxy_ws.test.ts`).
- [x] Backup/restore + migration + release upgrade birlikte doğrulanmalı (`src/tests/backup_restore_migration_upgrade.test.ts`).

---

# 2. 🟠 P1 — Hatalar ve güvenilirlik

## 2.1 Version / lockfile
- [x] `package.json` **1.4.0**, `src/config/version.ts` **1.4.0**, `package-lock.json` **1.4.0** tam senkronize edildi.
- [x] CI'da package.json/package-lock version equality kontrolü (`src/tests/version_sync.test.ts`).
- [x] README/CHANGELOG/roadmap sürüm zinciri tek release ile eşleştirildi (`v1.4.0`).

## 2.2 Telemetry DB integrity
Son sürüm yüksek ingest sırasında FK kaynaklı kilitlenmeleri azaltmak için telemetry hypertable FK'lerini kaldırıyor ve deterministic batch ordering + deadlock retry ekliyor.
- [x] FK kaldırma kararının uygulama seviyesinde referential-integrity karşılığı belgelendi ve test edildi.
- [x] Orphan telemetry reconciliation/monitoring (`db.reconcileOrphanTelemetry()`).
- [x] Device delete/replacement ile historical telemetry politikası (denetim için saklanma).
- [x] Unknown/discovered device telemetry kabul politikası (keşif havuzuna alma).
- [x] Deadlock/serialization retry sonrası partial commit ve duplicate oluşmadığı yük testleri.
- [x] 3 retry sonrası failure/requeue davranışı (WAL kuyruğuna kalıcı yazma).
- [x] `deviceId + bootId + sequence` idempotency altında eşzamanlı ingest testi (`src/tests/telemetry_db_integrity.test.ts`).

## 2.3 WebSocket
Temel auth/origin/tenant E2E ve smoke doğrulamaları mevcut.
- [x] Gerçek telemetry schema validation.
- [x] Gerçek command → ACK → applied round-trip.
- [x] Reconnect/backoff, duplicate event ve stale socket.
- [x] Backpressure + max payload (512KB / 2MB limitleri & 1MB azami frame).
- [x] Credential revoke → socket termination (`terminateDeviceSockets`).
- [x] Origin / CORS doğrulaması (`isAllowedWsOrigin`) ve başlık tabanlı kimlik doğrulama.

## 2.4 Multi-tenant
- [x] Tenant A/B negatif test matrisi: REST, DB, WS, telemetry, history, commands, alarms, notifications, automation, dashboards, OTA, discovery ve export (`src/tests/multitenant_negative_matrix.test.ts`).
- [x] ID enumeration/guessing ve bulk endpoint testleri.
- [x] Admin/root istisnaları ayrı test edildi (Sanal cihaz ve simülasyon yönetimi SADECE yöneticiye aittir).

## 2.5 OTA/Web Compiler
- [x] Build sandbox ve kaynak limitleri.
- [x] SHA-256 + Ed25519 + trusted key rotation/revocation.
- [x] Hardware/firmware compatibility (model ve revizyon denetimi).
- [x] Canary/staged rollout.
- [x] Install/verify/failure state machine.
- [x] Retry/rollback (`otaWorker` zaman aşımı kontrolü).
- [x] Concurrent deployment protection.
- [x] Deployment audit/report (`src/tests/ota_complete_lifecycle.test.ts`).

---

# 3. 🟡 P2 — CI/CD, test ve operasyon

Mevcut CI Node 20/22, TimescaleDB service, smoke, E2E ve failure artifacts çalıştırıyor.

- [ ] Lockfile mismatch CI gate.
- [ ] Docker image build + container health + DB + WS smoke.
- [ ] Production schema/migration ile CI test schema'sının parity kontrolü.
- [ ] E2E flaky test detection.
- [ ] Load/soak test.
- [ ] Test coverage raporu: auth, tenant, WS, command, telemetry, alarm, automation, OTA, discovery.

---

# 4. 🟡 P2 — Mevcut özelliklerin geliştirilmesi

## Canlı Dashboard
- [x] Global `Connected / Reconnecting / Offline` (`Header.tsx` & `RealtimeContext.tsx`).
- [x] Widget `Live / Stale / Offline / Error` (`widgetFreshness.ts` & `DeviceStatusDot.tsx`).
- [x] Last data / data age / latency.
- [x] Command `Pending → Applied/Failed/Timeout` (`RealtimeContext.tsx`).
- [x] ACK gelmeden kalıcı optimistic physical state gösterme (ACK ve timeout takibi).
- [x] Büyük dashboard render/memory optimizasyonu (Memoization & synchronous filtering).
- [x] Layout persistence + widget config validation (`widgetValidation.ts`).

## Device Management
- [x] Site → Bölge → Grup → Cihaz (`DeviceHierarchyBar.tsx` & `HierarchyManagementModal.tsx`).
- [x] Tags (`DeviceTagsEditor.tsx` & hiyerarşik filtreleme).
- [x] Maintenance mode (`DeviceMaintenanceModal.tsx` & alarm bastırma).
- [x] Health/firmware/last telemetry/last command/last alarm özeti (`DeviceHealthBadge.tsx` & `deviceHealth.ts`).
- [x] Device replacement history (`DeviceReplacementModal.tsx` & `device_hardware_replacements` tablosu).

## Discovery & Pairing
- [x] QR + discovery tek provisioning wizard (`ProvisioningWizardModal.tsx`).
- [x] `Discovered → Pending → Assigned → Active` (`DiscoveredDeviceCard.tsx` & lifecycleState).
- [x] Duplicate identity (`checkDuplicateIdentity` & çakışma çözümleme stratejileri).
- [x] Tenant/location assignment (Site, Zone, Group ve Tag hiyerarşi ataması).
- [x] Pairing audit (`PairingAuditTable.tsx` & `/api/network/pairing-history`).

## Generic Control Panel
- [ ] Relay/digital/PWM/analog ortak command schema.
- [ ] Button/toggle/slider/selector.
- [ ] Kritik komut confirmation.
- [ ] Result feedback + history.
- [ ] Manual/automation ayrımı.
- [ ] Fail-safe/default state.

## Telemetry
- [ ] Metric catalog + unit normalization.
- [ ] Min/max/avg/sum/rate.
- [ ] Time presets + downsampling/rollup.
- [ ] CSV/JSON export.
- [ ] Data quality: duplicate/delayed/out-of-order.
- [ ] Clock drift.
- [ ] Ingest latency/retry/drop metrics.
- [ ] Retention/compression yönetimi.

## Alarm & Notification
- [ ] `Triggered → Acknowledged → Resolved`.
- [ ] Severity/hysteresis/debounce/cooldown.
- [ ] Escalation/flood protection.
- [ ] Offline alarm.
- [ ] Responsible user + history.
- [ ] Quiet hours/maintenance suppression.
- [ ] Kanal bazlı tercihler.

## Automation
- [ ] Visual rule builder + AND/OR.
- [ ] Schedule/time windows.
- [ ] Multi-device actions.
- [ ] Delay/timer.
- [ ] Retry/fallback.
- [ ] Dry-run.
- [ ] Execution trace.
- [ ] Circular trigger + max-depth protection.
- [ ] Audit trail.

## OTA
- [ ] Firmware registry/build history.
- [ ] Compatibility matrix.
- [ ] Deployment groups.
- [ ] Canary/staged rollout.
- [ ] Schedule/progress.
- [ ] Failed-device list.
- [ ] Rollback/deployment report.

## Customer/Tenant
- [ ] Tenant overview.
- [ ] User/role management.
- [ ] Device online ratio.
- [ ] Telemetry/usage quota.
- [ ] Credential management.
- [ ] Activity/audit history.

## Mobile UX
- [ ] Touch target standardı.
- [ ] Widget drag/edit/swipe.
- [ ] Alarm/notification quick access.
- [ ] Connection state visibility.
- [ ] QR pairing optimization.
- [ ] Accessibility checks.

---

# 5. 🟢 P3 — Teknik borç / kalite

- [ ] Version/package-lock/CHANGELOG/README/roadmap tam senkron.
- [ ] OpenAPI ↔ gerçek API karşılaştırması.
- [ ] Versioned WebSocket protocol.
- [ ] CSP/HSTS/security headers.
- [ ] Request/body limits.
- [ ] Dependency vulnerability + secret scanning.
- [ ] Structured security audit log.
- [ ] Backup restore drill.
- [ ] Production load/soak test.

---

# 6. ⭐ Yeni özellikler — öncelik sırası

1. ⭐⭐⭐⭐⭐ **Command Center** — queued/sent/ack/applied/failed/timeout, retry, source ve filtreler.
2. ⭐⭐⭐⭐⭐ **Device Health Center 2.0** — connectivity, RSSI, uptime, memory, telemetry gaps, firmware, error timeline.
3. ⭐⭐⭐⭐⭐ **Alarm Management Center** — incident, assignment, escalation, SLA, resolution.
4. ⭐⭐⭐⭐⭐ **OTA Deployment Manager** — registry, canary, staged rollout, schedule, rollback.
5. ⭐⭐⭐⭐⭐ **Device Credential Center** — rotate/revoke/expiry/scope/last-used.
6. ⭐⭐⭐⭐⭐ **Audit & Security Center** — kritik kullanıcı/tenant/device/command/OTA/security olayları.
7. ⭐⭐⭐⭐ **Telemetry Explorer** — çoklu metric/device, aggregation, export, anomaly/data quality.
8. ⭐⭐⭐⭐ **Sites/Groups/Locations** — toplu komut/alarm/OTA.
9. ⭐⭐⭐⭐ **Dashboard Templates** — hazır endüstriyel şablonlar + versioning.
10. ⭐⭐⭐⭐ **System Observability Center** — API/DB/WS/ingest/command latency ve kaynaklar.
11. ⭐⭐⭐⭐ **Backup & Disaster Recovery Center**.
12. ⭐⭐⭐⭐ **Reporting & Integration Center** — rapor, webhook, API, Email/Telegram/WhatsApp provider abstraction.

---

# 7. 🏗️ Uygulama sırası

### Faz 1 — Stabilizasyon
1. Version/lockfile.
2. Telemetry integrity + idempotency/load tests.
3. Gerçek saha testi.
4. Production Docker/DB/WS gate.

### Faz 2 — IoT çekirdeği
5. Command Center.
6. Telemetry Explorer/data quality.
7. Alarm lifecycle.
8. Device Health.

### Faz 3 — Saha operasyonu
9. OTA Deployment Manager.
10. Canary/rollback.
11. Maintenance + Sites/Groups.

### Faz 4 — Kurumsal yönetim
12. Audit & Security.
13. Device Credential Center.
14. Tenant Management 2.0.
15. Reporting.

### Faz 5 — Ölçek
16. Observability.
17. Backup/DR.
18. Integrations.
19. Load/soak/capacity planning.

---

# 8. ✅ Definition of Done

P0/P1 tamamlandı sayılması için:
- [ ] Kod davranışı doğrulanmış.
- [ ] Unit/integration test.
- [ ] Gerekliyse E2E.
- [ ] Tenant izolasyonu.
- [ ] WS etkisi.
- [ ] DB migration/rollback etkisi.
- [ ] Production smoke.
- [ ] Gerçek cihaz/simülatör.
- [ ] Dokümantasyon + CHANGELOG/version senkronu.

---

# 9. 🔄 Her yeniden incelemede

- [ ] HEAD/son commitler
- [ ] P0/P1/P2/P3
- [ ] Auth/CSRF/CORS
- [ ] Multi-tenant
- [ ] WebSocket
- [ ] Command
- [ ] Telemetry/TimescaleDB
- [ ] Alarm/Notification
- [ ] Automation
- [ ] OTA
- [ ] Docker/CI/CD
- [ ] Dependencies/lockfile
- [ ] Dashboard/mobile UX
- [ ] API/OpenAPI
- [ ] Version consistency
- [ ] Mevcut özellik geliştirmeleri
- [ ] Yeni özellikler

> Bu dosya ve GitHub Issue #1 projenin merkezi kalite/backlog/yol haritasıdır. İnceleme sırasında kaynak kodu veya mevcut konfigürasyon dosyaları değiştirilmez; yalnızca bu doküman ve Issue #1 güncellenebilir.
