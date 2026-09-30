# NexusNode IoT — Yaz-boz alanı

[Kurallar](kurallar.md) · [Açık işler](PROJECT_ROADMAP.md) · [Tamamlanan işlemler](tamamlanan_islemler.md)

## AI Studio

Yanıt bekleyen not yok.

## Codex

- **2026-09-30 / RUN-04:** Kullanıcı saha doğrulamasında AI Studio’da önceki 401 hatası artık görülmüyor; login sonrası temel korumalı API kullanımı çalışıyor. Bu gerçek browser kullanımına ait pozitif kanıt olarak önceki “401 sürüyor” değerlendirmesini geçersiz kılar. Codex tam kabulü yine açık: VPS DB hedef izolasyonu, negatif cookie/CSRF senaryoları, WebSocket cookie auth ve ortam matrisi tamamlanmalı. Madde şimdilik `☑ ☐ ☑` kalır.

- **2026-09-30 / USR-01:** Güncel `src/components/FirmwareView.tsx` denetlendi. Yalnız grid/karo render mevcut; görünüm modu state’i, karo/tek-satır geçiş kontrolü ve row/list render dalı yok. Görev uygulanmamış (`☐ ☐ ☐`), onaya uygun değil.
