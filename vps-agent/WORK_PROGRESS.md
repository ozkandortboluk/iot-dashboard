# VPS Agent — İlerleme durumu

## Durum
- Aşama: bağımsızlaştırma ve salt-okunur izleme/uyarı akışını tamamlama.
- Durum: IN_PROGRESS — CLI'a kalıcı state, lock, dedup, Telegram ve opt-in AI teşhis akışı bağlandı; yerel doğrulamalar bekliyor.
- GitHub üzerinde test çalıştırılmadı; GitHub Actions test workflow'u eklenmedi.
- Üretim VPS'sine erişilmedi; canlı değişiklik yapılmadı; gerçek Telegram mesajı veya AI API çağrısı gönderilmedi.

## Bu değişiklikte
- VPS Agent bağımsız pakette tutuldu ve ana uygulama bağlantıları kaldırıldı.
- CLI config ile salt-okunur kontrolleri çalıştırır, JSON raporu ve exit code üretir.
- Kaynak ağacı dışında özel runtime state ve eşzamanlı çalıştırma kilidi eklendi.
- Bildirim dedup geçmişi kalıcı hale getirildi; 24 saat içinde aynı olay tekrar gönderilmez.
- Telegram akışı CLI'a bağlandı; config, environment secret ve --allow-telegram-send olmadan dış mesaj gönderilmez.
- Günlük özetin gönderim günü state dosyasında saklanır.
- AI teşhisi yalnız uyarı/kritik/bilinmeyen sonuç varsa çalışabilir; config, API key env ve --allow-ai-analysis gerekir.
- AI'ye yalnız sabit kontrol/hata kodları ve sayısal/boolean metrikler gönderilir; ham log/secret/URL/telemetri gönderilmez.
- AI çıktı/timeout sınırları eklendi; AI çıktısı komut olarak çalıştırılmaz veya Telegram'a otomatik gönderilmez.
- Örnek systemd timer 5 dakikalık izleme için güncellendi; servis/timer kurulmadı.
- Doğrudan Docker socket yerine yalnız loopback read-only proxy'ye sabit GET isteği yapan adapter eklendi; proxy ayrıca kurulmalı ve doğrulanmalı.
- Yeni testler yazıldı ancak henüz çalıştırılmadı.

## Tek seferlik yerel doğrulama listesi
1. VPS Agent: npm.cmd test, npm.cmd run type-check, npm.cmd run build.
2. Ana uygulama: mevcut yerel type-check/build ve ilgili testler.
3. Ana uygulama ile VPS Agent arasında import/derleme/Compose/DB migration bağımlılığı olmadığını doğrula.
4. CLI config/exit code, runtime state izinleri, lock, Telegram fake/blocked flow, dedup ve AI veri minimizasyonu senaryolarını doğrula.
5. Test sonuçlarını ancak gerçek çalıştırmadan sonra buraya yaz.

Hiçbir şeyi merge veya canlıya dağıtma. Gerçek Telegram/AI gönderimi, servis kurulumu, VPS erişimi ve üretim değişiklikleri ayrı açık onay gerektirir.
