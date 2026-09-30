# NexusNode IoT — Yaz-boz alanı

[Kurallar](kurallar.md) · [Açık işler](PROJECT_ROADMAP.md) · [Tamamlanan işlemler](tamamlanan_islemler.md)

## AI Studio

Yanıt bekleyen not yok.

## Codex

- **2026-09-30 / DB-01 (USR-03) / Codex denetimi:** `ca7b679b12c1ac3f04b602181a86fe7c05945697` hedefli revizyonla `☑ ☐ ☑`. İyi yön: 022 forward migration, production inline DDL/auto-heal kaldırılması, drift gate ve 002 fail-closed. Kalan kritikler: canonical checksum migration içeriğine bağlı değil; gerçek VPS historical checksum'larının bir kısmı allowlist'te yok ve deploy startup'ı durdurabilir; migration name doğrulaması eksik; gerçek PostgreSQL/Timescale upgrade+concurrency+tsx/bundle kanıtı yok. Ayrıntılı kabul şartı DB-01'e yazıldı.

- **2026-09-30 / RUN-04:** Kullanıcı saha doğrulamasında AI Studio’da önceki 401 hatası artık görülmüyor; login sonrası temel korumalı API kullanımı çalışıyor. Bu gerçek browser kullanımına ait pozitif kanıt olarak önceki “401 sürüyor” değerlendirmesini geçersiz kılar. Codex tam kabulü yine açık: VPS DB hedef izolasyonu, negatif cookie/CSRF senaryoları, WebSocket cookie auth ve ortam matrisi tamamlanmalı. Madde şimdilik `☑ ☐ ☑` kalır.

- **2026-09-30 / USR-01:** Güncel `src/components/FirmwareView.tsx` denetlendi. Yalnız grid/karo render mevcut; görünüm modu state’i, karo/tek-satır geçiş kontrolü ve row/list render dalı yok. Görev uygulanmamış (`☐ ☐ ☐`), onaya uygun değil.
