# NexusNode Codex — İşletim ve geri dönüş sınırları

Bu PR bir üretim kurulumu değildir. Hiçbir dosya VPS'ye kopyalanmaz, servis kurulum/enable edilmez, gerçek Telegram mesajı gönderilmez ve runtime dizini bu repoda oluşturulmaz.

## Yerel geliştirme

`src/codex/README.md` içindeki örnek config yalnız yerel/mock denetim içindir. `observe_only` dışındaki modlar üretim değişikliğine izin vermez. İleride işletime alınacak CLI, operatör tarafından ayrı bir runtime config ile elle çalıştırılmalıdır; bu PR CLI'ı başlatmaz ve Codex CLI çalıştırmaz.

Önerilen runtime dizini `/var/lib/nexusnode-codex` yalnız sonraki, ayrıca onaylanmış kurulum tasarımıdır: ayrı root olmayan servis hesabına ait, mode `0700`; config `0600`; lock/report `0600`; kaynak ve yedek dizinlerine yazma hakkı yok. POSIX izin bitleri yalnız POSIX hostta doğrulanır; Windows ACL doğrulanmadığından Windows testleri üretim izin kanıtı değildir. Servis hesabına Docker socket, DB secret, vault anahtarı veya sınırsız sudo verilmez. Mevcut uygulama sağlık ucu HTTP koduyla kullanılabilir; Docker daemon gözlemi etkinleştirilirse root-eşdeğer daemon erişimi doğar ve ayrıca gözden geçirilmelidir.

## Yedek ve geri dönüş

Mevcut `scripts/dr/local-backup.sh`, `scripts/dr/nexus-dr.sh` ve `vps-update.sh` akışları değiştirilmez veya çağrılmaz. Yedek kontrolü yalnız salt-okunur doğrulanmış artifact/checksum biçimini destekler; manifest secret dosyaları kapsıyorsa `unsupported` raporlar. SHA-256 eşleşmesi yalnız dosya bütünlüğüdür; başarılı restore kanıtı değildir.

Denetleyici hatası servis restart'ı, uygulama/DB rollback'i, migration, restore, silme veya yeni backup başlatmaz. Bu PR'da rollback prosedürü kaynak kod değişikliği için Git diff'inin operatörce gözden geçirilmesidir; otomatik `git reset`, checkout veya clean çalıştırılmaz.

## İzleme ve bildirim

Health probe yalnız yapılandırmada izin verilen loopback URL'lerine gider; yanıt gövdesi saklanmaz. Telegram yalnız giden HTTPS bildirimidir, token `NEXUS_CODEX_TELEGRAM_BOT_TOKEN` environment secret kaynağından okunur; gerçek gönderim bu PR kapsamında test edilmez. Özet saati yapılandırılabilir Europe/Istanbul 09:00 varsayılanıdır; örnek systemd timer kurulmaz/etkinleştirilmez.

## Daha sonraki kurulum için açık kapılar

Üretim hostu, gerçek dosya izinleri, service account, Codex CLI entegrasyonu, ağ çıkış allowlist'i ve Telegram secret kaynağı bu repository'den doğrulanamaz. Bunlar VPS'ye bağlanmadan, kullanıcı ayrıca salt-okunur keşif ve sonra ayrı kurulum onayı vermeden etkinleştirilemez.

Admin paneli `codex_monitor_config` tercihlerini uygulama ayarlarında saklar; Codex eklentisi default-off'dur. `createAdminConfiguredCheckers` ayarlar tüketildiğinde read-only checker'ları filtreler ve modül kapalıysa boş liste döndürür. Bu PR uygulama sunucusuna agent scheduler bağlamaz ve ayar kaydı herhangi bir production check başlatmaz. Panelden açılabilen tercihler dahi çalıştırma yetkisi veya OS erişimi sağlamaz. Eklentiyi ayırma adımları `UNINSTALL.md` içindedir.

`systemd/` altındaki `.example` dosyaları sadece sonraki paketleme/izin incelemesi için taslaktır. ExecStart hedefi bu PR'da üretilmiyor; dosyalar kurulamaz/etkinleştirilemez olarak kalmalıdır. Unit dosyalarının systemd tarafından doğrulanması Windows ortamında yapılmadı.
