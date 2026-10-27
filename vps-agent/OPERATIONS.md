# VPS Agent — İşletim notları

Bu klasör tek başına üretim kurulumu değildir. CLI yerel/izole ortamda operatör tarafından başlatılabilir; kod VPS'ye kopyalanmaz; servis kurulum/enable edilmez; gerçek Telegram mesajı gönderilmez; runtime dizini otomatik oluşturulmaz.

## Yerel geliştirme
Config örneği yalnız yerel/mock denetim içindir. Varsayılan mod observe_only'dir. Codex CLI başlatılmaz. Testler geliştirici makinesinde veya izole ortamda çalıştırılır; GitHub üzerinde test çalıştırılmaz.

## Runtime
Runtime dosyaları repository dışındaki özel bir dizinde tutulmalıdır. Önerilen Linux izinleri: ayrı root olmayan kullanıcı, runtime dizini 0700, config/state dosyaları 0600. Kaynak, yedek ve secret dizinlerine yazma hakkı verilmez. Windows ACL'leri production izin kanıtı değildir.

## Yedek ve geri dönüş
Mevcut NexusNode yedekleme script'leri çağrılmaz veya değiştirilmez. Yedek kontrolü yalnız desteklenen artifact/checksum biçimini okur; SHA-256 eşleşmesi restore edilebilirliği kanıtlamaz. Hata servis restart'ı, DB rollback'i, restore, silme veya yeni yedek başlatmaz.

## Bildirim
Telegram yalnız giden HTTPS içindir; token VPS_AGENT_TELEGRAM_BOT_TOKEN gibi güvenli environment secret kaynağından okunur. Gerçek gönderim varsayılan değildir ve ayrıca açık onay ister.

## Kurulum öncesi kapılar
Üretim hostu, service account, gerçek dosya izinleri, ağ allowlist'i, secret kaynağı ve runtime davranışı doğrulanmamıştır. Kurulumdan önce ayrı salt-okunur keşif, paketleme, yerel test ve kullanıcı onayı gerekir.
