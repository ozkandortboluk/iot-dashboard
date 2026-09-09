# 🧭 NexusNode IoT — Proje Yapılacaklar ve Yol Haritası

> Bu dosya projenin **uygulama backlog'u + hata düzeltme listesi + mevcut özellik geliştirme planı + yeni özellik yol haritasıdır**.
>
> Son inceleme: **2026-09-09**  
> Branch: `main`  
> Son incelenen commit: `3b72597a3f13623c145cf49c4883a9f85bc4286d`  
> Uygulama sürümü: `1.2.13`

## Öncelik standardı

- 🔴 **P0:** Kritik güvenlik, veri kaybı veya production çalışabilirliği riski
- 🟠 **P1:** Yüksek öncelik; production kalitesi için kısa vadede tamamlanmalı
- 🟡 **P2:** Orta öncelik; planlı sprint/geliştirme
- 🟢 **P3:** Teknik borç, kalite, bakım ve dokümantasyon
- ⭐⭐⭐⭐⭐: Stratejik/yüksek değerli yeni özellik

---

# 1. 🔴 P0 — Production güvenilirliği

- [ ] Gerçek Docker production image testi yapılmalı: `build → start → DB → health/live → health/ready → WebSocket`.
- [ ] Production PostgreSQL/TimescaleDB bağlantısı ve migration/schema durumu gerçek ortam benzeri test edilmeli.
- [ ] Production WebSocket upgrade ve gerçek cihaz bağlantısı smoke test kapsamına alınmalı.
- [ ] Kritik state-changing API'ler için production öncesi güvenlik regression testi zorunlu hale getirilmeli.

---

# 2. 🟠 P1 — Güvenlik ve mimari sağlamlık

## 2.1 WebSocket E2E

- [ ] `e2e/security_e2e.test.ts` içindeki sahte `expect(true).toBe(true)` WS testleri gerçek bağlantı testleriyle değiştirilmeli.
- [ ] Session cookie ile yetkili WS bağlantısı test edilmeli.
- [ ] Yetkisiz WS bağlantısı reddedilmeli.
- [ ] Device credential authentication test edilmeli.
- [ ] Origin/Host kontrolü test edilmeli.
- [ ] Tenant izolasyonu WS event/subscription seviyesinde test edilmeli.
- [ ] Close code/reason, reconnect ve stale connection davranışı test edilmeli.

## 2.2 CSRF / CORS

- [ ] Sadece OPTIONS/preflight değil gerçek `POST/PUT/PATCH/DELETE + session cookie + malicious Origin` saldırıları test edilmeli.
- [ ] Cihaz komutu, tenant/device değişikliği, alarm/automation ve OTA gibi kritik state-changing endpoint'ler kapsanmalı.
- [ ] Trusted origin allowlist production config üzerinden doğrulanmalı.
- [ ] Reverse proxy/Nginx arkasında CORS ve cookie davranışı doğrulanmalı.

## 2.3 Multi-tenant isolation

- [ ] REST API tenant sınırları audit edilmeli.
- [ ] Repository/DB sorgularında tenant scope merkezi hale getirilmeli.
- [ ] Device, telemetry, history, command, alarm, notification, automation, dashboard/widget, OTA, discovery/pairing ve export erişimleri ayrı ayrı test edilmeli.
- [ ] ID tahmini ile başka tenant kaydına erişim engellenmeli.
- [ ] WebSocket event leakage test edilmeli.
- [ ] Admin/root tenant istisnaları açık ve test edilebilir olmalı.

## 2.4 Device credentials

- [ ] API key/token rotation.
- [ ] Revoke.
- [ ] Expiry.
- [ ] Last-used bilgisi.
- [ ] Scope/permission.
- [ ] Brute-force ve connection rate-limit.
- [ ] Credential'ın URL query üzerinden taşınmasının log/proxy sızıntısı riski azaltılmalı.

## 2.5 Command engine

Standart lifecycle:

`Queued → Sent → Acknowledged → Applied → Failed/Timeout`

- [ ] Command ID + idempotency key.
- [ ] Timeout.
- [ ] Retry policy.
- [ ] Duplicate command protection.
- [ ] Offline device queue davranışı.
- [ ] Manual vs automation source.
- [ ] Device confirmation olmadan kalıcı optimistic state gösterilmemeli.
- [ ] Failure reason ve command history.
- [ ] Lease reclamation edge-case testleri.

## 2.6 OTA Studio / Web Compiler

- [ ] Firmware input validation.
- [ ] Build sandbox/isolation.
- [ ] CPU/memory/time/resource limits.
- [ ] Artifact hash.
- [ ] Signature verification.
- [ ] Root of Trust/keyId doğrulaması.
- [ ] Key rotation/revocation.
- [ ] Hardware/firmware compatibility matrix.
- [ ] Deployment authorization.
- [ ] Concurrent deployment control.
- [ ] Resumable download.
- [ ] Install/verify lifecycle.
- [ ] Failure reason.
- [ ] Automatic/manual rollback.
- [ ] Canary/staged rollout.
- [ ] OTA audit trail.

## 2.7 Database / TimescaleDB

- [ ] PostgreSQL ve TimescaleDB production sürümleri pinlenmeli.
- [ ] Migration öncesi backup/restore prosedürü doğrulanmalı.
- [ ] Timescale extension version mismatch için startup/health kontrolü değerlendirilmeli.
- [ ] Telemetry hypertable, chunk interval, index, retention ve compression politikaları belgelenmeli.
- [ ] Yüksek ingest altında DB latency ve connection pool izlenmeli.

## 2.8 Dependency / lockfile

- [ ] `package.json` ile `package-lock.json` metadata senkronlanmalı.
- [ ] `package-lock.json` ve `bun.lock` birlikte tutulacaksa bunun amacı netleştirilmeli; tercihen tek authoritative package manager seçilmeli.
- [ ] CI'nin `npm ci` kullanımı seçilen lockfile politikasıyla uyumlu olmalı.

---

# 3. 🟡 P2 — CI/CD, test ve operasyon

## 3.1 CI/CD

- [ ] Node 18 matrix kaldırılmalı veya resmi destek politikası açıkça belirlenmeli; `package.json` şu anda Node `>=20` diyor.
- [ ] CI'ya `test:smoke` eklenmeli.
- [ ] CI'ya kontrollü `test:e2e` eklenmeli.
- [ ] E2E için izole PostgreSQL/TimescaleDB test servisi sağlanmalı.
- [ ] Migration/schema hazırlığı CI'da otomatik yapılmalı.
- [ ] Başarısız testlerde server logları artifact olarak saklanmalı.
- [ ] Build sonrası gerçek production bundle test edilmeli.

## 3.2 Startup/readiness

- [ ] Testlerin `Aktif!` stdout mesajına bağımlılığı kaldırılmalı.
- [ ] Health endpoint polling ile startup tespit edilmeli.
- [ ] Startup timeout ve graceful shutdown test edilmeli.
- [ ] Liveness ve readiness semantiği netleştirilmeli.

## 3.3 Test kapsamı

- [ ] Auth/session/logout.
- [ ] CSRF/CORS.
- [ ] Multi-tenant isolation.
- [ ] WebSocket auth/protocol.
- [ ] Command lifecycle.
- [ ] Telemetry ingestion.
- [ ] Alarm engine.
- [ ] Automation engine.
- [ ] OTA lifecycle.
- [ ] Device replacement.
- [ ] Discovery/pairing.
- [ ] Mobile critical flows.

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
