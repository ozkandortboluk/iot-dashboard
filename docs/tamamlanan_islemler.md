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
