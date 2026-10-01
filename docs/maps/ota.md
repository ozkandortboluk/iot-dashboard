# Firmware / OTA Map

Primary: `src/components/FirmwareView.tsx`, `WebCompilerStudio.tsx`, `src/server/routes/firmware.ts`, `compiler.ts`, `ota.ts`, `src/server/services/otaWorker.ts`, `src/server/utils/ota-crypto.ts`.
Device example: `examples/ESP32_Secure_OTA_Client.ino`.
Tests: `src/server/ota.test.ts`, `src/tests/ota_complete_lifecycle.test.ts`, `firmware_view_modes.test.ts`.

Protocol/signing değişirse server route + crypto + worker + cihaz örneği birlikte kontrol edilir.
