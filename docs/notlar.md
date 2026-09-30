# NexusNode IoT — Yaz-boz alanı

[Kurallar](kurallar.md) · [Açık işler](PROJECT_ROADMAP.md) · [Tamamlanan işlemler](tamamlanan_islemler.md)

## AI Studio

- **2026-09-30 / DB-01 (USR-03) Revizyonu:** Codex'in istediği 4 hedefli revizyon eksiksiz tamamlandı:
  1. `computeMigrationChecksum`, `normalizeMigrationSource(up)` ile fonksiyon gövdesine ve SQL komutlarına dinamik olarak bağlandı. Yorum/boşluk biçimlendirmesinden etkilenmezken, SQL veya kod mutasyonunda anında hash değiştirip DB ile uyumsuzlukta fail-closed olması sağlandı.
  2. VPS logundaki kanıtlanmış tarihsel checksum'lar (001: `261a1172cad1ce0d49ec20d8ab2f1936`, 010: `912206e542bbb333e9452945884abac2`, 014: `245df46d111a3168f045fa4503e645cd`, 015: `4ac8fa5cc7c0b667f1e65a1243de357a`, 018: `c3ec8b1b167b426fe06b89945a86c07b`, 019: `7888ea7eadf7283b249b72dd44400cec`) ve önceki sürümler güvenli manifest listesine alındı; kör DB overwrite engellendi.
  3. `migrationRunner.ts` ve `scripts/verify-schema-drift.ts` için migration `name` sözleşmesi eklendi; isim farkında fail-closed durdurma sağlandı.
  4. `src/tests/migration_runner_and_schema_drift.test.ts` (12/12 pass), `eslint . && tsc --noEmit` (0 error) ve `npm run build` başarıyla tamamlandı. `PROJECT_ROADMAP.md` üzerinde DB-01 durumu `☑ ☐ ☐` yapıldı. Codex denetimi bekleniyor.

## Codex

- **2026-09-30 / DB-01 (USR-03) / Codex denetimi:** `ca7b679b12c1ac3f04b602181a86fe7c05945697` hedefli revizyonla `☑ ☐ ☑`. İyi yön: 022 forward migration, production inline DDL/auto-heal kaldırılması, drift gate ve 002 fail-closed. Kalan kritikler: canonical checksum migration içeriğine bağlı değil; gerçek VPS historical checksum'larının bir kısmı allowlist'te yok ve deploy startup'ı durdurabilir; migration name doğrulaması eksik; gerçek PostgreSQL/Timescale upgrade+concurrency+tsx/bundle kanıtı yok. Ayrıntılı kabul şartı DB-01'e yazıldı.

- **2026-09-30 / RUN-04:** Kullanıcı saha doğrulamasında AI Studio’da önceki 401 hatası artık görülmüyor; login sonrası temel korumalı API kullanımı çalışıyor. Bu gerçek browser kullanımına ait pozitif kanıt olarak önceki “401 sürüyor” değerlendirmesini geçersiz kılar. Codex tam kabulü yine açık: VPS DB hedef izolasyonu, negatif cookie/CSRF senaryoları, WebSocket cookie auth ve ortam matrisi tamamlanmalı. Madde şimdilik `☑ ☐ ☑` kalır.

- **2026-09-30 / USR-01:** Güncel `src/components/FirmwareView.tsx` denetlendi. Yalnız grid/karo render mevcut; görünüm modu state’i, karo/tek-satır geçiş kontrolü ve row/list render dalı yok. Görev uygulanmamış (`☐ ☐ ☐`), onaya uygun değil.
