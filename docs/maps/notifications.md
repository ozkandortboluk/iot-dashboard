# Alarm / Notification Map

## Offline / no-data / alarm
Primary: `src/server/services/noDataWorker.ts`, `alarmEngine.ts`, `alarm.service.ts`.

## Delivery / email
Primary: `src/server/services/notification.service.ts`, `src/server/notificationServices.ts`, `repositories/notification.repository.ts`, `repositories/alarm.repository.ts`.
UI: `src/components/NotificationsView.tsx`, `src/components/notifications/`.
Tests: `alarm-engine.test.ts`, `notification-security.test.ts`, `email_resend_retry_dedup.test.ts`, `network_reconnect_reboot_soak.test.ts`.

Yanlış offline alarmında device activity/heartbeat/telemetry zamanlarını alarm üretimi ve notification dispatch zinciriyle birlikte izle.
