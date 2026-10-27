# PR #26 İş Akışı

## Tamamlandı

- [x] PR #26 kapsamındaki mevcut değişiklikler incelendi; tespit edilen CI, şema uyumluluğu ve WebSocket güvenlik sorunları düzeltildi.
- [x] Bildirim kuyruğu PostgreSQL’de kalıcı hale getirildi; atomik worker claim, lease yenileme, retry ve çökme sonrası kurtarma eklendi.
- [x] Migration 023 ve çoklu worker/lease recovery entegrasyon testleri eklendi.
- [x] Sürüm PR sonunda tek artışla `1.49.35` yapıldı; package, lockfile, version config ve changelog eşitlendi.
- [x] Yerel tam Vitest suite main üzerinde geçti: 85 dosya, 691 test başarılı ve 26 test atlandı; provenance, parity, lint, type-check ve production build geçti.
- [x] GitHub Actions run #1384 yeşil: Node 20/22 lint ve type-check, 86 dosya/701 test, PostgreSQL, production smoke, E2E (15 test) ve privileged secret ownership geçti.
- [x] İlk GitHub Actions denemelerindeki PostgreSQL fixture hataları giderildi ve son commit `5c7625b` doğrulandı.
- [x] PR açıklaması kalıcı kuyruk garantileri ve at-least-once teslimat davranışıyla güncellendi.

## Yapılacak

- [x] PR #26 tüm zorunlu kontroller yeşil olduğunda ready durumuna alınıp squash merge ile main’e birleştirildi (`373ff3d`).
- [x] Merge sonrasında main için GitHub Actions run #1387 başarılı oldu: Node 20/22 test, PostgreSQL smoke, E2E ve privileged secret ownership geçti.
- [x] Main’de yerel lint, type-check, provenance, Vitest, build ve parity doğrulamaları geçti; sürüm `1.49.35` ve bu takip dosyası sonuçlarla eşitlendi.

## Not

- Yerel production smoke testi, bu ortamda PostgreSQL ve Docker Secret `ENCRYPTION_KEY` bulunmadığı için sağlık endpoint’ine erişemedi; GitHub Actions ortamı bu kontrolleri sağlıyor.
- Worker, sağlayıcının mesajı kabul etmesinden sonra tamamlanma kaydını yazamadan çökerse tekrar gönderim olabilir; dış sağlayıcılar genelinde exactly-once garantisi yoktur.
