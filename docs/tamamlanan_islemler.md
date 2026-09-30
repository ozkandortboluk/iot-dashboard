# NexusNode IoT — Tamamlanan işlemler

[Kurallar](kurallar.md) · [Açık işler](PROJECT_ROADMAP.md) · [Ortak notlar ve denetim geçmişi](notlar.md)

2026-09-30 tarihinde mevcut roadmap’ten taşındı. Bu işlem yeni kod denetimi değildir; aşağıdaki onay kapsamları ve test sınırları korunmuştur. Regresyonda aynı görev kimliği açık işlere geri taşınır.

## 1. Güvenlik — erişim, SSH, sırlar ve müşteri izolasyonu

- ☑ ☑ ☐ **SEC-02 | P0 | SSH host key doğrulamasını geri getir** — **AI Studio tarafından yeniden uygulandı (fail-closed pinning).**
  - **Son Codex yürütmeli denetimi (2026-09-30 13:36 sonrası, `aa1173b`):** Host-key kodu aa1173b’de değişmedi; önceki kod ve altı geçen CI unit testi kapsamındaki onay korunur. Yeni CI unit’e ulaşmadığından aa1173b’de altı test yeniden geçti denmiyor. Eksik/yanlış pin erken ret ve hostVerifier false akışı mevcut.
  - **Son kabul / AI Studio düzeltme talebi:** Güvenilir pin bağımsız kanaldan doğrulanmalı. Gerçek SSH handshake sırasında yanlış anahtara credential gitmediği testi operasyonel kanıt olarak ayrıca açık; önceki dar kod/unit onayı bunu kapsamaz.


  - **Güncel Codex denetimi (2026-09-30, kod `7c51485`; HEAD `89b974a`):** `verifyHostFingerprint()` eksik pini ve uyumsuz anahtarı reddediyor; SHA256 Base64 karşılaştırması büyük/küçük harfe duyarlı. test/connect eksik pinle `Client.connect` öncesinde dönüyor; SSH2 `hostVerifier` uyumsuzlukta false veriyor. Son CI’da bu dosyanın altı testi geçti. Onay mevcut kod + altı birim test kapsamıdır; gerçek SSH/VPS deneyi değildir.
  - **Sonraki adım / yeniden kabul:** Güvenilir SHA256 pini VPS üzerinde bağımsız kanaldan doğrulayarak kullan. Probe’dan alınan anahtar tek başına sunucunun güvenilir olduğunu kanıtlamaz. İleride SSH2 handshake entegrasyonunda yanlış/değişmiş anahtara parola/private-key gönderilmediğini ayrıca ölç.


  - **Uygulama Kanıtı (2026-09-29):** `src/server/services/sshTunnel.service.ts` içerisinde `verifyHostFingerprint()` fonksiyonu, `expectedHostFingerprint` verilmediğinde `valid: false` döndürecek şekilde tam fail-closed hale getirildi. `testConnection()` ve `connectTunnel()` metotları SSH bağlantısını ve kimlik bilgisi gönderimini başlatmadan önce zorunlu `expectedHostFingerprint` varlığını şart koşacak şekilde güncellendi.
  - **Test Kapsamı:** `src/tests/ssh_host_key_pinning.test.ts` eklendi; 4 temel kabul senaryosu (doğru pin → kabul; yanlış pin → reddet; host key değişti → reddet; zorunlu pin eksik → reddet; kimlik bilgisiz test/connect engelleme) birim testleri ile %100 doğrulandı.
  - **Kabul:** Tüm 4 pozitif/negatif senaryo ve credential göndermeme garantisi birim testler seviyesinde kanıtlandı.

- ☑ ☑ ☐ **SEC-10 | P1 | Anahtar için ayrı salt okunur secrets yolu mevcut.** `docker-compose.yml` ./secrets:/app/secrets:ro bağlar; crypto.ts secrets/encryption_key okur. .gitignore ve .dockerignore secrets/ dizinini dışlar. Kod incelemesiyle doğrulandı; canlı izin testi değildir.
  - **Son Codex yürütmeli denetimi (2026-09-30 13:36 sonrası, `aa1173b`):** Salt okunur bind ve Docker encryption_key secret korunmuş; dedicated resolver/ignore mevcut. Önceki dar statik onay korunuyor. Normal production için iki bağımsız gerçek crypto resolver instance’ı, sanal mount’taki aynı key ile encrypt/decrypt kontrolünü geçti. UID/GID ve gerçek container mount testi değildir.
  - **Son kabul / AI Studio düzeltme talebi:** SEC-13’ün effective-key precedence sorununu ve RUN-06 izin/recreate kabulünü tamamla. Mount varlığı Cloud Run bootstrap veya key-validation doğruluğu için genel onay sayılmaz.


  - **Güncel Codex denetimi (2026-09-30, kod `7c51485`; HEAD `89b974a`):** Salt okunur ./secrets:/app/secrets:ro ve Docker secret tanımı mevcut; crypto resolver özel secrets dosyasını okuyor; ignore kuralları mevcut. Önceki dar kapsamlı statik onay korunuyor. Bu onay production bootstrap’ın güvenli olduğu anlamına gelmez: SEC-13/RUN-06’daki env anahtar üretimi dosya kaynağının önüne geçebilir.
  - **Sonraki adım / yeniden kabul:** Mount kodunu koru; etkili anahtar kaynağı, UID/GID izinleri ve restart sonrası eski şifreli veri için SEC-13/RUN-06 kabulünü ayrıca tamamla.

## Kısmen tamamlanan kanonik görevler

### USR-02 → RUN-04 | P1 | Ortam, SSH/DB ve kullanıcı oturum ayrımı — kısmen tamamlandı

- ☑ ☑ ☐ **Tamamlanan alt kapsam — merkezi runtime sınıflandırması:** `src/server/config/runtimeEnvironment.ts` içinde `APP_ENV` öncelikli `vps/aistudio/local/test` çözümleyicisi ve ortam yardımcıları mevcut. İlgili runtime testleri ortam seçimlerini kapsıyor.
- ☑ ☑ ☐ **Tamamlanan alt kapsam — SSH yönlendirme politikasının kod ayrımı:** `src/server/database/connection.ts` SSH reroute’u yalnız `isSshTunnelAllowed() && sshTunnelService.isConnected()` koşulunda uygular; runtime politikası VPS’de SSH tünelini kapatacak şekilde merkezileştirilmiştir. Bu kayıt kod/test kapsamıdır; gerçek VPS hedef doğrulaması RUN-04’te açık kalır.
- ☑ ☑ ☐ **Tamamlanan alt kapsam — browser kullanıcı auth mimarisi:** `apiFetch` `credentials: 'include'` değerini çağıran init’in üzerine garanti eder; browser user auth HttpOnly `nexus_session_token` akışına taşınmıştır ve eski `dashboard_token` başlangıçta temizlenir. Login/register akışında `/api/auth/me` doğrulaması yapılmadan başarılı kullanıcı oturumu kabul edilmez.
- ☑ ☑ ☐ **Tamamlanan alt kapsam — temel negatif auth/CSRF ve WS testleri:** Testlerde cookie yok/geçersiz → 401, yetkisiz Origin + cookie ile state-changing istek → 403, izinli AI Studio Origin akışı ve cookie ile WS kabulü / cookiesiz WS reddi kapsanmıştır. Bu testler Node/supertest/WS seviyesindedir; gerçek browser E2E kalan RUN-04 kapsamındadır.
- ☑ ☑ ☐ **Tamamlanan alt kapsam — AI Studio 401 saha sorunu:** Kullanıcı 2026-09-30 tarihinde AI Studio geliştirme ortamında önceki `Authorization Token eksik` 401 hatasını artık almadığını ve login sonrası sistemin çalıştığını doğruladı. Bu, temel browser session/korumalı API akışı için pozitif saha kanıtıdır.
- **Açık kalan kapsam:** Gerçek VPS DB hedef izolasyonu, gerçek AI Studio/VPS deployment environment doğrulaması, PG parola/migration/schema/setup/DB-down matrisi ve cookie elle taşınmayan gerçek browser + WebSocket E2E. Bunlar `PROJECT_ROADMAP.md` içindeki tek aktif kanonik `RUN-04` maddesinde tutulur.

## 2026-09-30 — Pratik kanıt standardıyla yeni onaylar

- ☑ ☑ ☐ **SEC-04 | P0 | WebSocket varsayılan yayınından müşteri verisi sızmasını engelle** — **Codex onaylandı.** `websocket.ts::broadcast()` telemetry/device/command/notification/network/dashboard/OTA/alarm/rule/queue/dispatch/firmware eventlerini açık dallarda tenant/admin yetkisine göre filtreliyor ve en sonda tanımsız/unwhitelisted eventleri açıkça drop ediyor. Onay kod sözleşmesine dayanır; ileride yeni event eklenirken aynı whitelist/tenant kuralı korunmalı.
- ☑ ☑ ☐ **SEC-05 | P0 | Parola sıfırlamayı tek kullanımlı ve atomik yap** — **Codex onaylandı.** `PasswordResetService.resetPassword()` production PostgreSQL yolunda tokenı `used=false && expires_at>now` koşuluyla transaction içinde tüketiyor, aynı transaction'da password hash güncelliyor ve user sessions siliyor; hata durumunda rollback, production DB yoksa fail-closed var. Mevcut single-use/session testleri destekleyici kanıt. Gerçek paralel yarış testi faydalıdır fakat bu kod onayını bloke etmez.
- ☑ ☑ ☐ **USR-01 | P2 | Firmware sayfasında karo ve tek satır görünümü** — **Codex onaylandı.** `FirmwareView.tsx` grid/list state, localStorage kalıcılığı, görünüm anahtarı, aynı filteredFirmwares kaynağından grid ve list render dallarını içeriyor. Kullanıcının istediği özellik doğrudan uygulanmış; mevcut odaklı test yeterli kabul edildi.

## 2026-10-01 — Hedefli yeniden denetim onayları

- ☑ ☑ ☐ **DB-02 | P1 | Başarılı PostgreSQL hydration boş kümeleri de uygulamalı** — **Codex onaylandı.** `2f26d374...` ile başarılı hydration users/passwords/sessions/devices/rules/dashboards/alarms/firmwares/otaJobs cache'lerini authoritative PostgreSQL snapshot ile replace ediyor; boş snapshot eski password/session RAM verisini temizliyor. Hydration exception durumunda atamalar gerçekleşmeden RAM korunuyor. Odaklı boş-snapshot/hata testleri bu kapsam için yeterli kabul edildi.
- ☑ ☑ ☐ **IOT-01 | P1 | Otomasyon komutlarını kalıcı ortak komut servisine geçir** — **Codex onaylandı.** `2f26d374...` production PostgreSQL claim hatasında RAM fallback'i kaldırıp hatayı yukarı taşıyor; normal PG claim sonucu korunuyor. Böylece DB'de atomik claim edilmemiş komut production cihazına RAM üzerinden verilmiyor. İki odaklı fail-closed/success testi bu düzeltme için yeterli kabul edildi.
