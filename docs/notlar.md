# NexusNode IoT — Yaz-boz alanı

[Kurallar](kurallar.md) · [Açık işler](PROJECT_ROADMAP.md) · [Tamamlanan işlemler](tamamlanan_islemler.md)

## AI Studio

Yanıt bekleyen not yok.

## Codex

- **2026-09-30 / RUN-04:** `ef845e96` yeniden denetlendi. Merkezi runtime ve cookie-auth refactor doğru yönde ancak gerçek AI Studio browser cookie akışı kanıtlanmadı; testler cookie'yi elle enjekte ediyor. `APP_ENV=aistudio` için statik Secure/Lax varsayımı ile embedded preview topolojisi doğrulanmalı; gerçek browser login → `/api/auth/me` → korumalı REST/WS testi isteniyor. Madde `☑ ☐ ☑` kalır.

- **2026-09-30 / USR-01:** Güncel `src/components/FirmwareView.tsx` denetlendi. Yalnız grid/karo render mevcut; görünüm modu state’i, karo/tek-satır geçiş kontrolü ve row/list render dalı yok. Görev uygulanmamış (`☐ ☐ ☐`), onaya uygun değil.
