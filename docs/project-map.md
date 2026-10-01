# NexusNode IoT — Project Map

> Amaç: AI ajanının tüm kaynak kodu okumadan doğru modüle ve çağrı zincirine ulaşmasını sağlamak.
>
> Bu dosya **navigasyon indeksidir, kaynak kod otoritesi değildir**. Davranış hakkında son karar ilgili kaynak dosya ve testten doğrulanır.
>
> Mimari snapshot kaynağı: `42efd0f481c8454aa034c9dfa32496e651a655cb`. Yalnız mimari/rota değiştiğinde güncellenir; sıradan CSS/metin değişiklikleri için yeniden yazılmaz.

## Kullanım

1. Sorunu aşağıdaki **Problem Routes** bölümünde bul.
2. Önce “Primary” dosyaları oku.
3. Sorun açıklanmazsa “Secondary” halkasına genişle.
4. Test ararken aynı alanın listelenen testlerinden başla.
5. `app/applet/` altında benzer kopyalar bulunabilir; aktif üretim kaynağı olduğu import/build kanıtı olmadan ana `src/` ile eşdeğer kabul etme.

## Hızlı iskelet

- `server.ts` — Express/HTTP bootstrap, route registration, workers, WebSocket ve graceful shutdown.
- `src/App.tsx` — ana React görünüm/sekme yönlendirmesi.
- `src/context/` — auth, realtime ve UI context'leri.
- `src/components/` — kullanıcı arayüzleri.
- `src/server/routes/` — HTTP API uç noktaları.
- `src/server/controllers/` — telemetry/command controller katmanı.
- `src/server/services/` — iş mantığı, workers, WebSocket, SSH tunnel, security/secrets.
- `src/server/repositories/` — PostgreSQL veri erişimi.
- `src/server/database/` — connection resolver, PostgreSQL lifecycle, migration, schema audit/maintenance.
- `src/db/schema.ts` — Drizzle şema sözleşmesi.
- `src/server/database/canonicalSchema.ts` — kanonik DB şema üretimi.
- `ddl.sql`, `src/db/timescaledb.sql` — SQL/Timescale şema çıktıları.
- `src/tests/` — unit/integration/regression testleri.
- `e2e/` — uçtan uca testler.
- `scripts/` — migration, schema/provenance/parity doğrulama, smoke/load araçları.
- `docker-compose.yml`, `Dockerfile`, `docker/` — deployment/runtime.
- `.github/workflows/ci.yml` — CI kapısı.

# Problem Routes

## 1. Login / session / cookie / logout

**Primary**
- `src/context/AuthContext.tsx`
- `src/lib/apiFetch.ts`
- `src/server/routes/auth.ts`
- `src/server/middleware/auth.ts`

**Secondary**
- `src/server/db.ts`
- `src/server/database/postgres.ts`
- `src/server/services/websocket.ts`
- `src/server/services/passwordReset.service.ts`

**Tests**
- `src/tests/auth.test.ts`
- `src/tests/runtime_auth_environment.test.ts`
- `src/tests/runtime_auth_isolation.test.ts`
- `src/tests/rest_api_security_matrix.test.ts`

Akış: React login → `/api/auth/login` → session oluşturma → HttpOnly cookie → `/api/auth/me` → WebSocket/session doğrulama.

## 2. İlk kurulum / setup lock / admin recovery

**Primary**
- `src/components/setup/DatabaseSetupWizard.tsx`
- `src/components/setup/RecoveryView.tsx`
- `src/server/routes/setup.ts`
- `src/server/services/setup.service.ts`
- `src/server/middleware/setupAuth.ts`

**Secondary**
- `src/context/AuthContext.tsx`
- `scripts/generate-recovery-token.ts`
- `src/server/database/connection.ts`

**Tests**
- `src/tests/database_setup_wizard.test.ts`
- `src/tests/setup_auth_security.test.ts`
- `src/tests/password_reset_flow.test.ts`

## 3. PostgreSQL bağlantısı / VPS–AI Studio ayrımı / SSH tunnel

**Primary**
- `src/server/config/runtimeEnvironment.ts`
- `src/server/database/connection.ts`
- `src/server/services/sshTunnel.service.ts`
- `src/server/routes/sshTunnel.ts`

**Secondary**
- `src/server/database/postgres.ts`
- `src/server/db.ts`
- `src/components/SSHTunnelDrawer.tsx`
- `.env.example`
- `docker-compose.yml`

**Tests**
- `src/tests/runtime_auth_environment.test.ts`
- `src/tests/runtime_auth_isolation.test.ts`
- `src/tests/ssh_host_key_pinning.test.ts`
- `src/tests/docker_postgres_proxy_ws.test.ts`

Akış: runtime classification → DB connection resolver → gerekirse dev/AI Studio tunnel localPort → PG Pool. VPS'de tunnel yönlendirmesi varsayılan olarak kapalı olmalıdır.

## 4. Migration / schema drift / DB readiness

**Primary**
- `src/server/database/migrations/migrationRunner.ts`
- `src/server/database/postgres.ts`
- `src/server/database/canonicalSchema.ts`
- `src/server/database/schemaAuditor.ts`

**Secondary**
- `src/server/database/dataMaintenance.ts`
- `src/server/services/databaseAutoHealer.service.ts`
- `src/server/db.ts`
- `src/db/schema.ts`
- `ddl.sql`
- `src/db/timescaledb.sql`
- `scripts/verify-schema-drift.ts`

**Tests**
- `src/tests/migration_runner_and_schema_drift.test.ts`
- `src/tests/real_postgres_migrations.test.ts`
- `src/tests/db03_db04_migration_readiness_and_session_integrity.test.ts`
- `src/tests/production_db_ready_lifecycle.test.ts`

## 5. Telemetry ingest / kalıcılık / parsing

**Primary**
- `src/server/routes/telemetry.ts`
- `src/server/controllers/telemetry.controller.ts`
- `src/server/services/telemetry.service.ts`
- `src/server/repositories/telemetry.repository.ts`
- `src/server/utils/telemetry.parser.ts`

**Physical / simulation**
- `src/server/controllers/physicalTelemetry.controller.ts`
- `src/server/services/physicalTelemetry.service.ts`
- `src/server/controllers/simulationTelemetry.controller.ts`
- `src/server/services/simulationTelemetry.service.ts`

**Tests**
- `src/tests/telemetry_db_integrity.test.ts`
- `src/tests/p0_database_telemetry_hardening.test.ts`
- `scripts/telemetry-load-test.ts`

## 6. WebSocket / realtime sarı bağlantı / cihaz socket auth

**Primary**
- `src/server/services/websocket.ts`
- `src/server/services/deviceWsProtocol.service.ts`
- `src/server/services/deviceAuth.service.ts`
- `src/context/RealtimeContext.tsx`

**Secondary**
- `src/server/middleware/auth.ts`
- `src/server/database/connection.ts`
- `src/server/services/tenantSecurity.service.ts`
- `server.ts`

**Tests**
- `src/tests/ws_protocol_integrity.test.ts`
- `src/tests/docker_postgres_proxy_ws.test.ts`
- `src/tests/runtime_auth_isolation.test.ts`

## 7. Cihaz çevrimdışı algılama / alarm / bildirim

**Primary**
- `src/server/services/noDataWorker.ts`
- `src/server/services/alarmEngine.ts`
- `src/server/services/alarm.service.ts`
- `src/server/services/notification.service.ts`

**Secondary**
- `src/server/repositories/alarm.repository.ts`
- `src/server/repositories/notification.repository.ts`
- `src/server/notificationServices.ts`
- `src/components/NotificationsView.tsx`
- `src/components/notifications/`

**Tests**
- `src/tests/alarm-engine.test.ts`
- `src/tests/notification-security.test.ts`
- `src/tests/email_resend_retry_dedup.test.ts`
- `src/tests/network_reconnect_reboot_soak.test.ts`

## 8. Device CRUD / API key / tenant isolation

**Primary**
- `src/server/routes/devices.ts`
- `src/server/services/device.service.ts`
- `src/server/services/deviceAuth.service.ts`
- `src/server/repositories/device.repository.ts`
- `src/server/services/tenantSecurity.service.ts`

**Secondary**
- `src/server/routes/admin/tenants.ts`
- `src/server/middleware/auth.ts`
- `src/components/DevicesView.tsx`
- `src/components/DeviceHealthView.tsx`

**Tests**
- `src/tests/device-api-key-uniqueness.test.ts`
- `src/tests/multitenant_negative_matrix.test.ts`
- `src/tests/rest_api_security_matrix.test.ts`

## 9. Komut / çıkış kontrolü

**Primary**
- `src/server/routes/commands.ts`
- `src/server/controllers/command.controller.ts`
- `src/server/services/command.service.ts`

**Secondary**
- `src/server/services/websocket.ts`
- `src/components/devices/outputs/`

**Tests**
- `src/tests/command_lifecycle.test.ts`
- `src/tests/iot_command_claim_fallback.test.ts`

## 10. Firmware / compiler / OTA

**Primary**
- `src/components/FirmwareView.tsx`
- `src/components/WebCompilerStudio.tsx`
- `src/server/routes/firmware.ts`
- `src/server/routes/compiler.ts`
- `src/server/routes/ota.ts`
- `src/server/services/otaWorker.ts`
- `src/server/utils/ota-crypto.ts`

**Examples / tests**
- `examples/ESP32_Secure_OTA_Client.ino`
- `src/server/ota.test.ts`
- `src/tests/ota_complete_lifecycle.test.ts`
- `src/tests/firmware_view_modes.test.ts`

## 11. Secrets / startup security / encryption

**Primary**
- `src/server/services/systemSecrets.service.ts`
- `src/server/services/systemKeys.service.ts`
- `src/server/utils/crypto.ts`
- `src/server/utils/startupSecurityPolicy.ts`
- `src/server/routes/secrets.ts`

**Secondary**
- `src/components/system/SystemSecretsPanel.tsx`
- `scripts/manage-keys.ts`
- `docker-compose.yml`

**Tests**
- `src/tests/system_secrets_vault.test.ts`
- `src/tests/system_keys_lifecycle.test.ts`
- `src/tests/startup_security_policy.test.ts`

## 12. Deployment / Nginx / Docker / health / graceful shutdown

**Primary**
- `server.ts`
- `docker-compose.yml`
- `Dockerfile`
- `docker/`
- `src/components/DeploymentView.tsx`

**Tests / gates**
- `src/tests/docker_postgres_proxy_ws.test.ts`
- `src/tests/graceful_shutdown.test.ts`
- `scripts/smoke-test.mjs`
- `scripts/verify-bundle-parity.ts`
- `.github/workflows/ci.yml`

## 13. Backup / restore / DB yönetim arayüzü

**Primary başlangıç noktaları**
- `src/components/database/ScheduledBackupsPanel.tsx`
- `src/components/DatabaseDataView.tsx`
- `src/server/routes/system.ts`

**Tests**
- `src/tests/backup_restore_migration_upgrade.test.ts`

Sunucu tarafındaki gerçek uygulama yolu belirsizse bu üç noktadan sembol bazlı hedefli arama yap; sırf “backup” için tüm server klasörünü okuma.

## 14. UI / görünüm sorunu

- Ana sekme ve görünüm seçimi: `src/App.tsx`
- Navigasyon: `src/components/Sidebar.tsx`, `src/components/Header.tsx`
- Auth ekranı: `src/components/LoginView.tsx`
- DB ekranı: `src/components/DatabaseDataView.tsx`, `src/components/database/`
- Firmware: `src/components/FirmwareView.tsx`
- Bildirim: `src/components/NotificationsView.tsx`, `src/components/notifications/`
- Cihaz: `src/components/DevicesView.tsx`, `src/components/devices/`
- Sistem logları: `src/components/system/SystemLogsView.tsx`

Backend davranışıyla ilgili bir UI hata mesajında yalnız component'e bakma; ilgili API rotasına kadar problem rotasını takip et.

# Test / doğrulama rotaları

- Genel kalite: `npm run lint`, `npm run type-check`
- Unit/integration: `npm run test`
- Build: `npm run build`
- Şema drift: `npm run verify:schema`
- Provenance: `npm run verify:provenance`
- Bundle parity: `npm run verify:parity`
- Smoke: `npm run test:smoke`
- E2E: `npm run test:e2e`
- Tam CI zinciri: `npm run test:ci`

Her küçük görevde tüm zinciri koşmak zorunlu değildir; `docs/kurallar.md` içindeki orantılı test kuralını uygula.

# Harita bakım kuralı

Bu dosyayı güncelle:
- yeni ana modül/route/service/repository eklendiğinde,
- dosya taşındığında/yeniden adlandırıldığında,
- problem rotasının çağrı zinciri değiştiğinde,
- aktif kaynak ağacı değiştiğinde.

Güncelleme:
- yalnız metin/CSS değişikliğinde,
- aynı modül içindeki küçük refaktörde rota değişmiyorsa,
- test verisi veya changelog güncellemesinde
gerekmez.

Haritayı kod özeti veya uzun fonksiyon açıklamalarıyla şişirme. Hedef: hızlı navigasyon.
