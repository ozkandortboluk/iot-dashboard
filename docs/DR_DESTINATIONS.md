# Yönetici Panelinden Tam Kurtarma Yedeği Hedefi (DR-01 / DR-02)

**Durum:** PR #18 taslak, VPS üzerinde uçtan uca henüz test edilmedi. Canlıya uygulamayın.

## Mimari

- `PostgreSQL & Veritabanı Yönetimi → Yedekleme` paneli, ayrı tam kurtarma hedefini gösterir. Bu seçim mevcut SQL snapshot ayarları değildir.
- `GET/PUT /api/database/dr/destination`: `authenticateUser` ve `requireAdmin`; servis jetonları engellenir, yalnızca `{ "destination": "local" | "disk" | "gdrive" | "dropbox" | "sftp" }` kabul edilir. Keyfi komut, SSH kullanıcı adı, token, URI, yol veya provider secret kabul edilmez.
- Seçim `/app/data/.dr_destination.json` içine atomik yazılır. Bu kalıcı app volume içindedir. Durum dosyaları `.dr_capabilities.json` ve `.dr_delivery_status.json` (sadece ID, zaman ve sonuç) aynı volume'dedir. Gerçek saklama hedefi, özel anahtarlar veya remote URI bu dosyalarda yoktur.
- Host systemd `nexusnode-local-backup.service` root-only `/usr/local/sbin/nexusnode-dr-deliver` aracını başlatır. Bu, **önce** `/usr/local/sbin/nexusnode-local-backup` ile tutarlı PostgreSQL dump, Vault, uygulama verileri ve secret dosyalarını yeni /var/backups/nexusnode/gunluk/yedek-* klasörüne alır. Eski yedekler değiştirilmez.
- Seçim `local` ise işlem burada tamamlanır. `disk` için root-owned, bağımsız dosya sistemi olarak **önceden bağlanmış** `/mnt/nexusnode-backup` şarttır. `gdrive`, `dropbox`, `sftp` için host root'un rclone yapılandırmasında birebir o isimli bağlantı tanımlı olmalıdır. Uygulamaya Docker socket veya root sudo verilmez.
- Harici hedefler için `/etc/nexusnode/dr-recipients.txt` içinde **yalnızca age PUBLIC recipient** saklanır; age private identity kullanıcı tarafından VPS dışında iki bağımsız yerde saklanır. Yerel yedek tar.gz olarak paketlenir, age ile şifrelenir, sabit `NexusNode-DR/production/` hedef yoluna kopyalanır. Hash uzak/harici diskten geri okunarak karşılaştırılır. Başarısız olursa servis başarısız olur, yerel yedek kalır. Otomatik silme/sync yoktur.
- Harici aktarım başarı durumu yalnızca son teslimin SHA-256 eşleşmesini gösterir; indirilmiş age kimliğiyle çözme ve izole Timescale restore testi ayrıca gereklidir. Google Drive ve Dropbox token'ları veya SSH kimlikleri admin API üzerinden ayarlanmaz.
- `rclone listremotes` bağlantının yalnızca **tanımlı olduğunu** gösterir, geçerliliğini veya uzak depolama kotasını doğrulamaz. İlk gerçek aktarım ayrı test edilmelidir.

## Operasyon

VPS'de önce zaten var olan yerel yedekleri ve `/var/backups/nexusnode/arsiv` dizinini koruyun. PR kodları, ana uygulamanın normal ilk kurulumu/güncellemesi ve root-only betikler dikkatle test edildikten sonra kurulur; uygulama container'ına /var/backups, /root, Docker socket ya da /etc/nexusnode bağlanmaz.

Hedef değiştirme **sonraki** zamanlanmış tam yedekte uygulanır. Seçim sırasında anında backup veya kopyalama tetiklenmez. `systemctl status nexusnode-local-backup.service`, `journalctl -u nexusnode-local-backup.service -n 50`, `systemctl list-timers --all nexusnode-local-backup.timer` ile host durumunu izleyin.

İlk kurulumun timer kurabilmesi için systemd root erişimi zorunlu; şifreli harici depolama hazır değilse güvenli varsayılan `local` hedefi seçilir. Panel herhangi bir üçüncü taraf hesap için ücretsiz depolama/kapasite garantisi vermez.

## Kabul testleri

1. Yönetici GET/PUT erişebilir; kullanıcı/servis token'ı 403 döner; bilinmeyen alanlar/hedefler 400 döner.
2. Host SSH/DB/Docker socket'e erişimi olmayan app container'ı yalnızca seçimi kaydeder; JSON'a komut/yol/URI eklenmesi reddedilir.
3. Root host runner local hedefte günlük yeni yedek oluşturur, korunan arşive dokunmaz.
4. Hazırlanmamış hedef seçilemez; kurulu hedef erişimi kesilirse yerel yedek korunur, host job başarısız ve durum başarısız olur.
5. Google Drive, Dropbox, harici ayrı disk ve SFTP üzerinde birer şifreli aktarım + SHA-256 readback + yaş private identity ile bağımsız decrypt + disposable PostgreSQL restore doğrulanır.
6. Eski tam yedekler, Vault root secret ve OTA Ed25519 anahtarı tüm testlerde korunur.
