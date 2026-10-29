# PR #32 — İş Akışı ve Doğrulama

> Bu dosya yalnızca PR #32'ye ait değişiklikleri ve doğrulamaları takip eder. Yeni bulgular eklenir; tamamlanmamış maddeler kanıt olmadan işaretlenmez.
>
> GitHub Actions elle çalıştırılmaz. Yerel Windows/Antigravity veya kullanıcı tarafından onaylanan izole ortamda doğrulama yapılır. Üretime dağıtım, merge ve canlı veritabanı işlemleri bu iş akışının dışındadır.

## Amaç

Bash secret kurtarma sırasında `bash -x` izlerinin düz metin PostgreSQL parolalarını göstermesini önlemek ve bu davranışı gerçek shell çalıştırmasıyla korumak.

## Kontrol listesi

- [x] `ensure_secrets_initialized()` hassas değerler okunmadan önce xtrace'i kapatıyor.
- [x] Gerçek fonksiyon, geçici ve izole Bash fixture'ında sahte parola ile `bash -x` altında çalıştırıldı; parola stdout/stderr çıktısına sızmadı.
- [x] Fonksiyondan sonraki çağıran komutlar da xtrace kapalıyken çalıştı.
- [x] `npm.cmd exec vitest run src/tests/security/secret_recovery_trace.test.ts` — 1 test geçti.
- [x] `npm.cmd run lint` — başarılı.
- [x] `npm.cmd run type-check` — başarılı.
- [x] `npm.cmd run build` — başarılı. Vite bağımlılık yorumları ve büyük bundle parçaları için uyarı verdi.
- [ ] GitHub Actions sonucu — elle çalıştırma kuralı nedeniyle bu dosyada doğrulanmıyor; otomatik CI sonucu ayrıca gözlenmeli.

## Güncel durum

`origin/main` değişiklikleri PR dalına alındı. Birleşik dalda yerel test, lint, type-check ve build yeniden doğrulanıyor. GitHub Actions sonucu hâlâ gözlenmedi; iş akışı elle başlatılmadı.

## Kayıt

- 2026-10-28 ilk inceleme: statik test gerçek xtrace çıktısını kanıtlamadığı için runtime testi istendi.
- 2026-10-29: runtime Bash testi eklendi; yerel test, lint, type-check ve build başarılı.
- 2026-10-29: main ve diğer işler PR #32 kapsamından ayrılarak `docs/genel.md` dosyasına taşındı.
- 2026-10-29: güncel main değişiklikleri dala alındı; sürüm 1.51.1'e yükseltildi.
