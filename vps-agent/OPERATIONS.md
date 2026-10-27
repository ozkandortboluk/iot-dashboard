# VPS Agent — İşletim notları

Bu PR bir üretim kurulumu değildir. CLI elle başlatılabilir; VPS'ye kopyalama, servis kurma/enable etme, gerçek Telegram gönderimi veya üretim değişikliği yapılmaz.

## İzleme aralığı

Örnek systemd timer her 5 dakikada bir salt-okunur denetim başlatır; timer kurulmuş/etkin değildir. Günlük özet saati Europe/Istanbul zaman diliminde telegram.dailySummaryHour ile belirlenir. Eşikler başlangıç değerleridir: disk/inode %80 uyarı ve %90 kritik; bellek %80 uyarı ve %92 kritik; CPU başına load 1,5 uyarı ve 3 kritik. Gerçek host yükü izlenerek ayarlanmalıdır.

## Runtime ve kilit

Kalıcı bildirim dedup ve günlük özet için runtime.statePath ayarlanmalıdır. Linux'ta üst dizin yalnız servis hesabına açık (0700), state dosyası (0600) olmalıdır. State kaynak ağacı dışında tutulur. Eşzamanlı çalışmayı engelleyen .lock dosyası beklenmeyen kesinti sonrası kalırsa otomatik silinmez; PID/işlem ve çalışma durumu operatörce incelenmeden kaldırılmamalıdır.

## Telegram

Telegram varsayılan kapalıdır. Açmak için config etkinleştirilir, token/chat ID environment secret olarak tanımlanır ve CLI'a --allow-telegram-send eklenir. Mesajlar sabit ve sınırlı içeriktedir; tekrarlar 24 saat boyunca bastırılır. Günlük özetin gönderim tarihi kalıcı state'e yazılır. Gerçek mesaj gönderimi bu PR'da test edilmemiştir.

## AI teşhisi

AI varsayılan kapalıdır. ai.enabled=true, OPENAI_API_KEY (veya ai.apiKeyEnv ile seçilen env) ve --allow-ai-analysis gerekir. Yalnız uyarı/kritik/bilinmeyen sonuç varsa çağrılır. Gönderilen veri yalnız sabit checker/hata kodları ve sayısal/boolean metriklerdir; ham log, URL, secret veya müşteri telemetrisi gönderilmez. Çıktı öneridir; komut çalıştırılmaz ve Telegram'a otomatik iletilmez. API kullanımı maliyet doğurabilir; model/çıktı sınırı yapılandırılabilir.

## Docker ve yedek

Docker durum kontrolü yalnızca ayrıca kurulmuş loopback read-only HTTP proxy üzerinden çalışabilir. Config içindeki docker.readOnlyProxyUrl yalnızca localhost/127.0.0.1/::1 ve HTTP root URL kabul eder; agent yalnız sabit GET /containers/json endpoint'ini çağırır. Proxy kurulum/izinleri bu PR tarafından yapılmaz. Doğrudan Docker socket kullanılmaz. Yedek checker tekil artifact/checksum biçimini salt-okunur inceler; restore başlatmaz ve restore başarısını kanıtlamaz. Mevcut NexusNode yedek script'leri çağrılmaz veya değiştirilmez.

## Geri dönüş ve onay

Agent hatası restart, DB rollback, restore, silme, servis kurulumu, push/merge veya deployment başlatmaz. Gerçek VPS kurulumu, servis hesabı, izinler, ağ ve secret yönetimi ayrı açık onay gerektirir. GitHub üzerinde test çalıştırılmaz; yerel test/type-check/build sonuçları doğrulanmadan PR birleştirilmez.
