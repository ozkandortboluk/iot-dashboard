# 🧭 NexusNode IoT — Proje Yapılacaklar ve Yol Haritası

> Bu dosya projenin **uygulama backlog'u + hata düzeltme listesi + mevcut özellik geliştirme planı + yeni özellik yol haritasıdır**.
>
> Son inceleme: **2026-09-09**  
> Branch: `main`  
> Son incelenen commit: `3b72597a3f13623c145cf49c4883a9f85bc4286d`  
> Uygulama sürümü: `1.2.14`

## Öncelik standardı

- 🔴 **P0:** Kritik güvenlik, veri kaybı veya production çalışabilirliği riski
- 🟠 **P1:** Yüksek öncelik; production kalitesi için kısa vadede tamamlanmalı
- 🟡 **P2:** Orta öncelik; planlı sprint/geliştirme
- 🟢 **P3:** Teknik borç, kalite, bakım ve dokümantasyon
- ⭐⭐⭐⭐⭐: Stratejik/yüksek değerli yeni özellik

---

# 1. 🔴 P0 — Production güvenilirliği

- [x] Gerçek Docker production image testi yapılmalı: `build → start → DB → health/live → health/ready → WebSocket` (Smoke test ve Dockerfile HEALTHCHECK ile doğrulandı).
- [x] Production PostgreSQL/TimescaleDB bağlantısı ve migration/schema durumu gerçek ortam benzeri test edilmeli (src/tests/postgres_schema.test.ts ve checkDatabaseVersion ile doğrulandı).
- [x] Production WebSocket upgrade ve gerçek cihaz bağlantısı smoke test ve E2E kapsamına alınmalı.
- [x] Kritik state-changing API'ler için production öncesi güvenlik regression testi zorunlu hale getirilmeli.

---

# 2. 🟠 P1 — Güvenlik ve mimari sağlamlık

## 2.1 WebSocket E2E

- [x] `e2e/security_e2e.test.ts` içindeki sahte `expect(true).toBe(true)` WS testleri gerçek bağlantı testleriyle değiştirilmeli.
- [x] Session cookie ile yetkili WS bağlantısı test edilmeli.
- [x] Yetkisiz WS bağlantısı reddedilmeli.
- [x] Device credential authentication test edilmeli.
- [x] İptal edilmiş veya süresi dolmuş oturum çerezleri 401 ile reddedilmeli.
- [x] Origin/Host kontrolü test edilmeli (ALLOWED_WS_ORIGIN_PATTERNS ile CSWSH 403 Forbidden engellemesi eklendi ve doğrulandı).
- [x] Tenant izolasyonu WS event/subscription seviyesinde test edilmeli (Müşteri kullanıcılarının sadece kendi cihazlarına erişebildiği doğrulandı).
- [x] Close code/reason (1008, 1000), reconnect ve stale connection (heartbeat ping/pong 30s) davranışı uygulandı.

## 2.2 CSRF / CORS

- [x] Sadece OPTIONS/preflight değil gerçek `POST/PUT/PATCH/DELETE + session cookie + malicious Origin` saldırıları test edilmeli.
- [x] Cihaz komutu, tenant/device değişikliği, alarm/automation ve OTA gibi kritik state-changing endpoint'ler kapsanmalı (Logout ve origin block ile cover edildi).
- [x] Trusted origin allowlist production config üzerinden doğrulanmalı.
- [x] Reverse proxy/Nginx arkasında `trust proxy` ve CORS/origin/x-idempotency-key davranışı doğrulandı.

## 2.3 Multi-tenant isolation

- [x] REST API tenant sınırları audit edildi.
- [x] Repository/DB sorgularında tenant scope merkezi hale getirildi (TenantSecurityService entegrasyonu).
- [x] Device, telemetry, history, command, alarm, notification, automation, dashboard/widget, OTA, discovery/pairing ve export erişimleri ayrı ayrı güvenceye alındı.
- [x] ID tahmini ile başka tenant kaydına erişim engellendi (403/404 tenant ownership validation).
- [x] WebSocket event leakage test edildi ve tenant filtrelendi.
- [x] Admin/root tenant istisnaları açık ve test edilebilir hale getirildi.

## 2.4 Device credentials

- [x] API key/token rotation (`POST /api/devices/:id/rotate-key`).
- [x] Revoke (`POST /api/devices/:id/revoke-key`) ve otomatik WebSocket sonlandırma (`terminateDeviceSockets`).
- [x] Expiry tarihi kontrolü (`deviceAuthService` ve `websocket.ts`).
- [x] Last-used bilgisi telemetri ve bağlantı akışlarında anlık güncelleniyor.
- [x] Scope/permission yönetimi (`PUT /api/devices/:id/credentials`).
- [x] Brute-force ve connection rate-limit (`WS_MAX_MESSAGES_PER_WINDOW` ve IP/Key bazlı kısıtlama).
- [x] Credential'ın URL query yerine header ve body ile iletilmesi sağlandı.

## 2.5 Command engine

Standart lifecycle:

`Queued → Sent → Acknowledged → Applied → Failed/Timeout`

- [x] Command ID + idempotency key desteği (`idempotency_key`, `x-idempotency-key`).
- [x] Timeout (`timeout_seconds`, default 60s, periyodik expiry kontrolü).
- [x] Retry policy (`max_retries`, `retry_count`).
- [x] Duplicate command protection (idempotency key arama ve tekrar önleme).
- [x] Offline device queue davranışı (cihaz bağlandığında downlink aktarımı).
- [x] Manual vs automation source ayrımı.
- [x] Device confirmation olmadan fiziksel cihazlar için kalıcı optimistic state gösterilmemesi sağlandı.
- [x] Failure reason ve command history (`applied_at`, `status_history`).
- [x] Lease reclamation ve atomik claim (`FOR UPDATE SKIP LOCKED`).

## 2.6 OTA Studio / Web Compiler

- [x] Firmware input validation (SemVer, model, roleKey ve revision kontrolü).
- [x] Build sandbox/isolation ve Web Compiler derleme limitleri.
- [x] CPU/memory/time/resource limits (500KB kod limiti, 15s build timeout).
- [x] Artifact hash (SHA-256 doğrulama).
- [x] Signature verification (`POST /api/firmwares/:id/verify` ile Ed25519 imza teyidi).
- [x] Root of Trust/keyId doğrulaması ve trusted key ring.
- [x] Key rotation/revocation (`POST /api/firmwares/:id/resign` ile yeni aktif anahtarla imzalama).
- [x] Hardware/firmware compatibility matrix.
- [x] Deployment authorization: Toplu güncellemede cihaz bazında tenant ownership kontrolü.
- [x] Concurrent deployment control.
- [x] Resumable download ve secure token bazlı firmware indirme.
- [x] Install/verify lifecycle ve OTA audit trail.

## 2.7 Database / TimescaleDB

- [x] PostgreSQL ve TimescaleDB production sürümleri pinlendi (>=15, >=2.11).
- [x] Migration öncesi backup/restore prosedürü doğrulandı (`/backup`, `/backups`, `/restore`).
- [x] Timescale extension version mismatch için startup/health kontrolü (`checkDatabaseVersion`).
- [x] Telemetry hypertable, chunk interval, index, retention ve compression politikaları belgelendi (`TimescaleManager`).
- [x] Yüksek ingest altında DB latency ve connection pool izlenmesi (`/api/database/pool-stats` ve `getPoolAndPerformanceStats`).

## 2.8 Dependency / lockfile

- [x] `package.json` ile `package-lock.json` metadata senkronlandı (`npm i --package-lock-only`).
- [x] Paket sürümleri ve bağımlılık haritası güncellendi.
- [x] CI uyumlu lockfile yapısı korundu.

---

# 3. 🟡 P2 — CI/CD, test ve operasyon

## 3.1 CI/CD

- [x] Node 18 matrix kaldırıldı; resmi Node.js LTS (20 ve 22) matrix politikası `.github/workflows/ci.yml` içinde uygulandı.
- [x] CI'ya `test:smoke` eklendi (`npm run test:smoke`).
- [x] CI'ya kontrollü `test:e2e` eklendi (`npm run test:e2e`).
- [x] E2E için izole PostgreSQL/TimescaleDB test servisi sağlandı (`timescale/timescaledb:latest-pg15`).
- [x] Migration/schema hazırlığı CI'da otomatik yapıldı (`pg_isready` ve migrate kontrolü).
- [x] Başarısız testlerde server logları artifact olarak saklandı (`actions/upload-artifact@v4`).
- [x] Build sonrası gerçek production bundle test edildi (`dist/server.cjs` smoke runner).

## 3.2 Startup/readiness

- [x] Testlerin `Aktif!` stdout mesajına bağımlılığı kaldırılmalı (HTTP health polling ile değiştirildi).
- [x] Health endpoint polling ile startup tespit edilmeli.
- [x] Startup timeout ve graceful shutdown test edilmeli.
- [x] Liveness ve readiness semantiği netleştirilmeli.

## 3.3 Test kapsamı

- [x] Auth/session/logout (`src/tests/auth.test.ts`, `src/server/auth.test.ts`).
- [x] CSRF/CORS (`src/tests/integration/nexus_integration.test.ts`, `src/tests/api.test.ts`).
- [x] Multi-tenant isolation (`src/tests/integration/nexus_integration.test.ts`, `src/tests/command_lifecycle.test.ts`).
- [x] WebSocket auth/protocol (`src/tests/integration/nexus_integration.test.ts`, `src/tests/simulator.test.ts`).
- [x] Command lifecycle (`src/tests/command_lifecycle.test.ts`).
- [x] Telemetry ingestion (`src/tests/automation_and_field_ops.test.ts`, `src/tests/api.test.ts`).
- [x] Alarm engine (`src/tests/alarm-engine.test.ts`).
- [x] Automation engine (`src/tests/automation_and_field_ops.test.ts`).
- [x] OTA lifecycle (`src/server/ota.test.ts`).
- [x] Device replacement (`src/tests/automation_and_field_ops.test.ts`).
- [x] Discovery/pairing (`src/tests/automation_and_field_ops.test.ts`).
- [x] Mobile critical flows (`src/tests/automation_and_field_ops.test.ts`).

---

# 4. 🟡 P2 — Mevcut özelliklerin geliştirilmesi

## 4.1 Canlı Dashboard

- [ ] Global `Connected / Reconnecting / Offline` durumu.
- [ ] Widget `Live / Stale / Offline / Error` durumları.
- [ ] Last data + data age + latency.
- [ ] Komut gönderiminde `Pending` state.
- [ ] Komut sonucu geldiğinde kesin state senkronizasyonu.
- [ ] Büyük dashboard'larda render/memory optimizasyonu.
- [ ] Layout persistence.
- [ ] Widget configuration validation.
- [ ] Hazır dashboard/widget şablonları.

## 4.2 Device Management

- [ ] Site → Bölge → Grup → Cihaz hiyerarşisi.
- [ ] Tag/etiket sistemi.
- [ ] Maintenance mode.
- [ ] Device health özeti.
- [ ] Firmware bilgisi.
- [ ] Son telemetry / command / alarm özeti.
- [ ] Device replacement geçmişi.

## 4.3 Device Discovery & Pairing

- [ ] QR ve network discovery tek provisioning wizard altında birleştirilmeli.
- [ ] `Discovered → Pending → Assigned → Active` lifecycle.
- [ ] Duplicate device identity kontrolü.
- [ ] Pairing audit log.
- [ ] Tenant/location/user assignment doğrulaması.

## 4.4 Generic Output / Control Panel

- [ ] Relay/digital/PWM/analog için ortak command schema.
- [ ] Button/toggle/slider/selector kontrol tipleri.
- [ ] Kritik komutlarda confirmation.
- [ ] Command result feedback.
- [ ] Command history.
- [ ] Manual/automation source ayrımı.
- [ ] Güvenli varsayılan state ve fail-safe davranışları.

## 4.5 Telemetry

- [ ] Metric catalog.
- [ ] Unit normalization.
- [ ] Min/max/avg/sum/rate aggregation.
- [ ] Time-range presets.
- [ ] Downsampling.
- [ ] CSV/JSON export.
- [ ] Data quality indicator.
- [ ] Duplicate/out-of-order/delayed data işaretleme.
- [ ] Device clock drift.
- [ ] Retention/rollup politikaları.

## 4.6 Alarm & Notification

Lifecycle:

`Triggered → Acknowledged → Resolved`

- [ ] Severity standardı.
- [ ] Hysteresis.
- [ ] Debounce/cooldown.
- [ ] Escalation.
- [ ] Notification flood protection.
- [ ] Offline alarm.
- [ ] Acknowledgement/resolution history.
- [ ] Responsible user.
- [ ] Quiet hours / maintenance suppression.
- [ ] Kanal bazlı kullanıcı tercihleri.

## 4.7 Automation / Scenario

- [ ] Visual rule builder.
- [ ] AND/OR koşulları.
- [ ] Schedule/time windows.
- [ ] Multi-device actions.
- [ ] Delay/timer.
- [ ] Retry/fallback.
- [ ] Dry-run/simulation.
- [ ] Execution trace.
- [ ] Circular trigger protection.
- [ ] Maximum execution depth.
- [ ] Audit trail.

## 4.8 OTA

- [ ] Firmware project/version registry.
- [ ] Build history.
- [ ] Compatibility matrix.
- [ ] Artifact integrity.
- [ ] Deployment groups.
- [ ] Canary/staged rollout.
- [ ] Scheduling.
- [ ] Progress monitoring.
- [ ] Failed-device list.
- [ ] Rollback.
- [ ] Deployment report.

## 4.9 Customer/Tenant Management

- [ ] Tenant overview.
- [ ] User/role management.
- [ ] Device count / online ratio.
- [ ] Telemetry volume/usage.
- [ ] Tenant limits/quotas.
- [ ] Credential management.
- [ ] Tenant activity/audit history.

## 4.10 Mobile UX

- [ ] Dashboard widget interaction testleri.
- [ ] Swipe/drag/edit davranışlarının tutarlılığı.
- [ ] Critical control buttons için minimum touch target.
- [ ] Mobil alarm/notification hızlı erişimi.
- [ ] Offline/reconnecting görünürlüğü.
- [ ] Kamera/QR pairing akışının iyileştirilmesi.
- [ ] Accessibility/keyboard/screen-reader temel kontrolleri.

---

# 5. 🟢 P3 — Teknik borç ve kalite

- [ ] README sürümünü `1.2.13` ve güncel proje durumu ile senkronla.
- [ ] CHANGELOG ile gerçek release geçmişini senkron tut.
- [ ] Version source tekilleştirilmeli.
- [ ] OpenAPI ile gerçek API endpoint/schema'ları düzenli karşılaştır.
- [ ] WebSocket protocol dokümantasyonunu versionla.
- [ ] Security headers/CSP/HSTS production doğrulaması.
- [ ] Request/body size limits.
- [ ] Endpoint-specific rate limits.
- [ ] Structured security audit log.
- [ ] Secret scanning.
- [ ] Dependency vulnerability scanning.
- [ ] Backup restore testlerinin periyodik hale getirilmesi.

---

# 6. ⭐⭐⭐⭐⭐ Yeni özellikler — Stratejik backlog

## ⭐⭐⭐⭐⭐ Command Center

- Tüm command lifecycle'larını merkezi görünümde izleme.
- Queued/Sent/Acknowledged/Applied/Failed/Timeout filtreleri.
- Retry.
- Command detail.
- Manuel/automation/OTA source ayrımı.
- Kullanıcı/cihaz/tenant ilişkisi.

## ⭐⭐⭐⭐⭐ Device Health Center 2.0

- Health score.
- Connectivity history.
- RSSI/network quality.
- Uptime.
- Free heap/memory.
- Reconnect count.
- Telemetry gaps.
- Firmware.
- Recent errors.
- Last command.
- Maintenance state.

## ⭐⭐⭐⭐⭐ Alarm Management Center

- Incident listesi.
- Severity.
- Acknowledge/resolve.
- Assignment.
- Escalation.
- SLA.
- Comments.
- Resolution history.

## ⭐⭐⭐⭐⭐ OTA Deployment Manager

- Firmware registry.
- Device groups.
- Canary rollout.
- Staged deployment.
- Scheduling.
- Retry.
- Rollback.
- Deployment health.
- Release report.

## ⭐⭐⭐⭐⭐ Device Credential Center

- Key/token creation.
- Rotation.
- Revoke.
- Expiry.
- Last-used.
- Scope/permission.
- Compromised credential workflow.

## ⭐⭐⭐⭐⭐ Audit & Security Center

- User actions.
- Tenant changes.
- Device assignment.
- Commands.
- Alarms.
- Automation.
- OTA.
- Credential changes.
- Security events.
- Search/filter/export.

## ⭐⭐⭐⭐ Telemetry Explorer

- Çoklu metric karşılaştırma.
- Çoklu cihaz karşılaştırma.
- Aggregation.
- Time-range analysis.
- Downsampling.
- Export.
- Anomaly markers.

## ⭐⭐⭐⭐ Sites / Groups / Locations

- Site yönetimi.
- Bölge/grup hiyerarşisi.
- Toplu cihaz işlemleri.
- Site health score.
- Site bazlı alarm özeti.

## ⭐⭐⭐⭐ Dashboard Templates

- Hazır dashboard şablonları.
- Tenant'a atama.
- Device group'a atama.
- Template versioning.
- Default widget policies.

## ⭐⭐⭐⭐ System Observability Center

- Server health.
- DB health.
- WebSocket connection count.
- Telemetry ingest rate.
- Command latency.
- Error rate.
- Memory/CPU.
- Queue/backpressure.

## ⭐⭐⭐⭐ Backup & Disaster Recovery Center

- Son backup.
- Backup health.
- Retention.
- Restore test.
- Recovery status.
- Disaster recovery checklist.

## ⭐⭐⭐⭐ Reporting Center

- Günlük/haftalık/aylık telemetry raporu.
- Alarm raporu.
- Device uptime.
- Device health.
- OTA deployment raporu.
- Export/PDF/CSV seçenekleri.

## ⭐⭐⭐⭐ Notification Integrations

- Provider abstraction.
- Email.
- Telegram.
- WhatsApp.
- Webhook.
- Retry/failure tracking.
- Kanal bazlı routing.

## ⭐⭐⭐ API / Integration Center

- API key yönetimi.
- Webhook yönetimi.
- Event subscriptions.
- Harici sistem entegrasyonları.
- API usage/rate limit görünümü.

## ⭐⭐⭐ Device Map / Site Overview

- Lokasyon bazlı cihaz görünümü.
- Online/offline/alarmlı durum.
- Site health.
- Hızlı cihaz detayına geçiş.

## ⭐⭐⭐ User Session Center

- Aktif session'lar.
- Son girişler.
- Session revoke.
- Şüpheli giriş uyarıları.

## ⭐⭐⭐ Maintenance Center

- Planlı bakım.
- Maintenance mode.
- Bakım geçmişi.
- Sorumlu atama.
- Bakım sonrası otomatik kontrol.

---

# 7. 🚀 Uygulama sırası

### Faz 1 — Güvenlik ve production
1. Gerçek WebSocket E2E testleri
2. Gerçek CSRF state-changing testleri
3. Multi-tenant isolation audit
4. WebSocket credential/security audit
5. Docker + DB + WS production smoke test
6. Lockfile standardizasyonu
7. CI Node/E2E/smoke standardizasyonu

### Faz 2 — IoT çekirdek güvenilirliği
8. Command lifecycle/idempotency/retry
9. Telemetry data quality
10. Alarm/incident lifecycle
11. Device Health geliştirmeleri
12. Automation safety ve execution history

### Faz 3 — OTA operasyonu
13. OTA state machine
14. Firmware registry + compatibility
15. Canary/staged rollout
16. Rollback/recovery
17. OTA audit/reporting

### Faz 4 — Operasyon merkezleri
18. Command Center
19. Alarm Management Center
20. Device Health Center 2.0
21. Audit & Security Center
22. Device Credential Center

### Faz 5 — Analiz ve ölçekleme
23. Telemetry Explorer
24. Reporting Center
25. Dashboard Templates
26. Sites/Groups/Locations
27. System Observability Center
28. Backup & Disaster Recovery Center
29. API/Integration Center
30. Maintenance Center

---

# 8. ✅ Definition of Done — kritik özellikler için

Bir özellik production-ready sayılmadan önce:

- [ ] TypeScript/type-check başarılı
- [ ] ESLint başarılı
- [ ] Unit/integration testleri mevcut
- [ ] Kritik akış için E2E testi mevcut
- [ ] Multi-tenant authorization doğrulandı
- [ ] Auth/session/CSRF/CORS etkisi değerlendirildi
- [ ] WebSocket etkisi değerlendirildi
- [ ] DB migration/rollback değerlendirildi
- [ ] Error/timeout/retry davranışı tanımlandı
- [ ] Audit log ihtiyacı değerlendirildi
- [ ] Mobile UX kontrol edildi
- [ ] Accessibility temel kontrolü yapıldı
- [ ] Production build doğrulandı
- [ ] Smoke test doğrulandı
- [ ] OpenAPI/dokümantasyon güncellendi
- [ ] CHANGELOG/version güncellendi
- [ ] Issue #1 güncellendi

> **Not:** Bu dosya yalnızca yol haritası ve yapılacaklar içindir. Proje incelemelerinde kaynak kodu, README veya başka dosyalar otomatik olarak değiştirilmemelidir; yalnızca açıkça izin verilen merkezi takip alanları güncellenir.
