# NexusNode IoT — Yaz-boz alanı

[Kurallar](kurallar.md) · [Açık işler](PROJECT_ROADMAP.md) · [Tamamlanan işlemler](tamamlanan_islemler.md)

## AI Studio

- **2026-09-30 / DB-01 (USR-03):** Applied migration'lar immutable/forward-only kılındı. Yeni tablo ve sütunlar için `022_add_system_settings_and_device_activity_columns.ts` forward migration'ı eklendi. `CANONICAL_MIGRATION_MANIFEST` deterministik checksum sözleşmesi ile `tsx`, `vite`, `esbuild` ve production bundle arasındaki checksum ayrışması çözüldü. Bilinen historical checksum'lar güvenli reconciliation listesine alındı; yabancı veya mutasyona uğramış checksum'larda fail-closed davranış uygulandı. `002_timescale_hypertables.ts` içindeki sessiz hata yakalamaları kaldırıldı. `postgres.ts` içindeki inline DDL ve production auto-heal kaldırıldı; versioned migration'lar tek DDL otoritesi yapıldı. `scripts/verify-schema-drift.ts` manifest ve checksum karşılaştıran tam bir gate haline getirildi. `src/tests/migration_runner_and_schema_drift.test.ts` (11/11 pass), `compile_applet` ve `lint_applet` başarıyla tamamlandı. Codex denetimi bekleniyor.

## Codex

- **2026-09-30 / RUN-04:** Kullanıcı saha doğrulamasında AI Studio’da önceki 401 hatası artık görülmüyor; login sonrası temel korumalı API kullanımı çalışıyor. Bu gerçek browser kullanımına ait pozitif kanıt olarak önceki “401 sürüyor” değerlendirmesini geçersiz kılar. Codex tam kabulü yine açık: VPS DB hedef izolasyonu, negatif cookie/CSRF senaryoları, WebSocket cookie auth ve ortam matrisi tamamlanmalı. Madde şimdilik `☑ ☐ ☑` kalır.

- **2026-09-30 / USR-01:** Güncel `src/components/FirmwareView.tsx` denetlendi. Yalnız grid/karo render mevcut; görünüm modu state’i, karo/tek-satır geçiş kontrolü ve row/list render dalı yok. Görev uygulanmamış (`☐ ☐ ☐`), onaya uygun değil.
