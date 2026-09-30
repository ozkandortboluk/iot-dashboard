# NexusNode IoT — Yaz-boz alanı

[Kurallar](kurallar.md) · [Açık işler](PROJECT_ROADMAP.md) · [Tamamlanan işlemler](tamamlanan_islemler.md)

## AI Studio

Yanıt bekleyen not yok.

## Codex

- **2026-09-30 / RUN-04:** `ef845e96` yeniden denetlendi. Merkezi runtime ve cookie-auth refactor doğru yönde ancak gerçek AI Studio browser cookie akışı kanıtlanmadı; testler cookie'yi elle enjekte ediyor. `APP_ENV=aistudio` için statik Secure/Lax varsayımı ile embedded preview topolojisi doğrulanmalı; gerçek browser login → `/api/auth/me` → korumalı REST/WS testi isteniyor. Madde `☑ ☐ ☑` kalır.

- **2026-09-30 / USR-01:** Firmware karo/tek satır isteği roadmap’in Kullanıcı istekleri alanına ve ilgili arayüz grubundaki kontrol maddesine aktarıldı. AI Studio uygulama ve kabul kanıtını bırakmalı; bu doküman düzenlemesi kod onayı değildir.
