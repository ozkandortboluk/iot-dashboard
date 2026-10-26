# PR #26 İş Akışı

## Tamamlandı

- [x] PR #26 kapsamındaki mevcut değişiklikler incelendi; tespit edilen CI, şema uyumluluğu ve WebSocket güvenlik sorunları düzeltildi.
- [x] Bildirim kuyruğu PostgreSQL’de kalıcı hale getirildi; atomik worker claim, lease yenileme, retry ve çökme sonrası kurtarma eklendi.
- [x] Migration 023 ve çoklu worker/lease recovery entegrasyon testleri eklendi.
- [x] Sürüm PR sonunda tek artışla `1.49.35` yapıldı; package, lockfile, version config ve changelog eşitlendi.
- [x] Yerel tam Vitest suite geçti: 85 dosya, 691 test başarılı; provenance, parity, lint, type-check ve production build geçti.
- [x] İlk GitHub Actions sonucu incelendi; PostgreSQL entegrasyon fixture’ındaki hatalar giderilip `80f4ba9` commit’i gönderildi.
- [x] PR açıklaması kalıcı kuyruk garantileri ve at-least-once teslimat davranışıyla güncellendi.

## Yapılıyor

- [ ] GitHub Actions run #1378’in Node 20/22 test, PostgreSQL smoke ve E2E sonuçları izleniyor; varsa yeni CI hataları düzeltilecek.

## Yapılacak

- [ ] PR #26 tüm zorunlu kontroller yeşil olduğunda main’e birleştirilecek.
- [ ] Birleştirme sonrasında main dalında tam test suite ve GitHub Actions yeniden çalıştırılıp sonuçları doğrulanacak.
- [ ] Main doğrulaması tamamlanınca PR ve sürüm (`1.49.35`) sonucu bu dosyada güncellenecek.

## Not

- Yerel production smoke testi, bu ortamda PostgreSQL ve Docker Secret `ENCRYPTION_KEY` bulunmadığı için sağlık endpoint’ine erişemedi; GitHub Actions ortamı bu kontrolleri sağlıyor.
- Worker, sağlayıcının mesajı kabul etmesinden sonra tamamlanma kaydını yazamadan çökerse tekrar gönderim olabilir; dış sağlayıcılar genelinde exactly-once garantisi yoktur.
