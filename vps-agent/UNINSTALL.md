# VPS Agent'ı kaldırma

VPS Agent bağımsız vps-agent/ dizininde tutulur. Ana uygulama kodu bu klasörden import yapmamalı; ana uygulama build'i, API'si, UI'si, veritabanı şeması ve dağıtım akışı bu klasör olmadan çalışmalıdır.

## Kaynak koddan kaldırma
1. VPS Agent ile ilgili ayrı servis/zamanlayıcı kurulmuşsa önce durumu salt okunur biçimde inceleyin. Bu depodaki .example unit dosyaları kurulu servis değildir.
2. Ana uygulamada vps-agent importu, API mount'u, UI kaydı, root package script'i veya DB migration'ı bulunmadığını doğrulayın.
3. vps-agent/ klasörünü kaldırın.
4. Ana uygulamanın bağımsız yerel build/type-check ve mevcut testlerini geliştirici makinesinde çalıştırın; GitHub üzerinde test çalıştırmayın.
5. Üretim ortamında kurulum yapılmışsa yalnız açık onayla ve ayrı bir değişiklik planıyla kaldırın. Önce servis/zamanlayıcı varlığını doğrulayın; var olmayan servisi durdurmaya çalışmayın.

## Veri ve geri dönüş
- Bu sürüm ana DB'ye ayar yazmaz ve migration eklemez.
- Önceki sürümden kalmış codex_monitor_config gibi orphan ayarlar otomatik silinmez; veri temizliği ayrı, yedekli ve açık onaylı iştir.
- VPS Agent kaldırılırken ana uygulama dosyaları, DB, volume'lar, yedekler, secrets veya Docker kaynakları silinmez.
- Kaldırma sonrası ana uygulamada hata görülürse rastgele reset/clean çalıştırmayın; Git diff ve logları inceleyip güvenli geri dönüş planı oluşturun.
