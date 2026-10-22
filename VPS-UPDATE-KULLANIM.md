# NexusNode VPS Update & Disk Temizleme — v0.4

Bu betik NexusNode Git deposunun **ana dizininde** (`/opt/iot-dashboard/iot-dashboard/vps-update.sh`) bulunacak şekilde düzenlenmiştir. Ek bir `/tmp` aktarımı veya `/usr/local/sbin` kurulumu **gerekmez**. Bütün komutları sunucuda **proje ana dizininden** çalıştırın.

## 1. Dosyaların yeri

Aşağıdaki dosyaları proje ana dizinine yerleştirin:

```text
/opt/iot-dashboard/iot-dashboard/
├── vps-update.sh
├── VPS-UPDATE-KULLANIM.md
├── docker-compose.yml
├── Dockerfile
├── .dockerignore
└── ...
```

**Not:** Betik gerçek çalışmada proje dizinini kendi bulunduğu konumdan otomatik bulur. `--run` sırasında çalışmakta olan betiğin Git güncellemesiyle değişmesini önlemek için `/var/lib/nexusnode-update` altında root'a özel bir *çalıştırma kopyası* oluşturur. Ana dosya yine proje dizininde kalır. `--check` hiçbir kopya veya log oluşturmaz.

## 2. Yardım ve Salt Okunur Ön Kontrol

Tüm komut seçeneklerini ve detaylı yardım kılavuzunu görüntülemek için:

```bash
cd /opt/iot-dashboard/iot-dashboard
sudo bash ./vps-update.sh --help
```

Hiçbir değişiklik yapmadan sistemi denetlemek için:

```bash
sudo bash ./vps-update.sh --check
```

`--check`, mevcut APT paket listesini, disk durumunu, Docker/Compose, Git çalışma ağacı, yedekleme servisi, HTTPS ve API sağlığını **salt okunur** kontrol eder. Ne yeni yedek oluşturur ne paket/image indirir ne de dosya siler. Güncel uzak paket veya GitHub sürümlerini sorgulamaz.

## 3. Güvenli Disk Temizliği ve Alan Kazanımı (--clean)

VPS diski dolmaya başladığında veya derleme öncesinde yer açmak gerektiğinde bu komut kullanılır.

### Temel Temizlik:
```bash
sudo bash ./vps-update.sh --clean
```

### Derin Temizlik (Eski Çekirdekler ve Paketler Dahil):
```bash
sudo bash ./vps-update.sh --clean --deep
```

### Simülasyon (Silmeden Taramak İçin):
```bash
sudo bash ./vps-update.sh --clean --dry-run
```

### Onaysız Otomatik Temizlik (Cron / Scriptler İçin):
```bash
sudo bash ./vps-update.sh --clean -y
```

### Neler Temizlenir?
1. **Docker BuildKit Önbelleği (`docker builder prune -af`)**: Docker derlemelerinden kalan ve genellikle GB'larca yer tutan katman önbelleği.
2. **Sahipsiz (Dangling) Docker İmajları (`docker image prune -f`)**: Etiketsiz (`<none>`) ara imajlar.
3. **Durdurulmuş Konteynerler ve Boş Ağlar**: Çıkış yapmış geçici konteynerler (`docker container prune -f`) ve boş Docker köprü ağları.
4. **Eski Derleme Adayları ve Rollback İmajları**: `iot-dashboard-app:candidate-*` geçici derleme imajları silinir; `nexusnode-app-rollback` ve `adminer-rollback` imajlarından güvenlik payı olarak **en son 3 yükleme korunur**, daha eski olanlar otomatik olarak temizlenir.
5. **Host Derleme Kalıntıları**: Host üzerindeki `dist/`, `build/`, `server.js` çıktıları.
6. **Önbellek ve Hata Günlükleri**: `node_modules/.cache`, `.eslintcache`, `.tsbuildinfo`, test/coverage raporları, npm/yarn debug logları, core dökümleri.
7. **Debian APT Arşiv Önbelleği**: `/var/cache/apt/archives` altındaki `.deb` paketleri (`apt-get clean & autoclean`). `--deep` modunda kullanılmayan bağımlılıklar ve eski çekirdek paketleri (`apt-get autoremove --purge`) de kaldırılır.
8. **Systemd Journal Günlükleri**: `journalctl --vacuum-time=7d --vacuum-size=100M` ile 7 günden eski veya 100M üzerindeki sistem logları güvenle vakumlanır.
9. **Eski Güncelleme Logları ve Betikleri**: `/var/log/nexusnode-update/` altındaki 14 günden eski loglar ve `/var/lib/nexusnode-update/` altındaki 7 günden eski dondurulmuş betikler.
10. **Geçici Artık Dosyalar**: `/tmp` ve `/var/tmp` altındaki 7 günden eski standart dosyalar.

### Kesin Güvenlik İlkeleri (Asla Silinmeyenler):
- **Veritabanı ve Docker Volume'ları ASLA Silinmez**: PostgreSQL / TimescaleDB (`timescaledb_data`) ve uygulama kalıcı dizinleri (`app_data`) asla temizlenmez.
- **Yedekler ASLA Silinmez**: `/var/backups/nexusnode/gunluk` altındaki kurtarma yedekleri korunur.
- **Gizli Anahtarlar ASLA Silinmez**: `secrets/`, `.env` ve `.system_secrets.json` dosyalarına dokunulmaz.
- **Canlı Üretim Konteynerleri ASLA Durdurulmaz**.

## 4. Gerçek Güncelleme (--run)

**Yalnızca `--check` sonuçlarındaki engeller giderildikten sonra:**

```bash
cd /opt/iot-dashboard/iot-dashboard
sudo bash ./vps-update.sh --run
```

`--run` sırası:

1. Git'in `main` dalında olduğunu ve yerel takip edilen dosyalarda değişiklik olmadığını kontrol eder. Yalnızca `vps-update.sh` ve `VPS-UPDATE-KULLANIM.md` dosyalarının **Git tarafından takip edilmeyen** kopyalarına izin verir; diğer tüm takip edilmeyen dosyalar engeldir.
2. Servis ve secrets izin kontrolleri yapar.
3. `nexusnode-local-backup.service` ile **yeni bir yerel yedek** oluşturur; SHA256, gerekli yedek dosyaları ve PostgreSQL arşivinin okunabilirliğini kontrol eder. Gerekirse burada durur.
4. Boş alan 6 GiB altında kalırsa **önce onay alarak sadece Docker build cache'i** temizleyebilir. Yedekleri, volume'ları ve eski imajları otomatik silmez.
5. Debian APT paketlerini günceller. İşlem sonunda Docker/Nginx ve uygulama sağlığını denetler.
6. GitHub `origin/main` dalını güvenli **fast-forward** ile günceller. Uzak dalda `docker-compose.yml`/Compose yapılandırması değişmişse otomatik dağıtım yerine manuel inceleme için durur.
7. NexusNode yeni sürümünü önce ayrı bir Docker imajında derler, sonra yalnızca uygulama servisini yeniden oluşturur. Sağlık kontrolü başarısızsa yalnızca kısıtlı ve teknik olarak doğrulanmış koşullarda eski uygulama imajına dönmeye çalışır. DB migration değişiklikleri için otomatik rollback yapılmaz.
8. Compose'taki sabit sürüm etiketiyle Adminer imajını kontrol eder. **Yeni sürüm etiketini kendi kendine seçmez.**
9. Dağıtım ve sağlık kontrolleri başarılı olduğunda geçici aday derleme imajını siler, güvenlik payı olarak **son 3 yüklemenin rollback imajını koruyarak** daha eski olanları otomatik temizler.
10. HTTPS/API/veritabanı ve temel sistem servislerini kontrol eder. `/run/reboot-required` varsa yeniden başlatmak için terminalden **`evet`** yanıtını bekler.

**TimescaleDB/PostgreSQL imajını güncellemez.** Bunun için ayrıca kullanıcı onaylı, ayrı bir işlem tasarlanacaktır. PostgreSQL ve uygulama Docker volume'ları korunur.

## 5. Mevcut VPS durumunda beklenen engel

18 Ekim 2026 denetiminde `main` dalında değişmemiş dosyalar olmakla beraber `ort`, `category:`, `docker-compose.yml.before-vault-fix`, `full_backup.sql` gibi **takip edilmeyen diğer dosyalar** vardı. Betik bunları **silmez, taşımaz veya otomatik yoksaymaz**. `--check` bunları gösterecek; `--run` güvenlik gerekçesiyle duracaktır. Gerekenler ayrı ayrı incelenmeli, hassas veriler proje dışına güvenli izinlerle alınmalı veya kullanıcının kararıyla düzenlenmelidir. Körlemesine `git clean -fd` veya `git reset --hard` kullanmayın.

Ayrıca diskte yaklaşık **4,4 GiB boş alan** görülmüştü. Betiğin güncelleme/derleme önkoşulu **6 GiB** olup ilk yedek için en az 1 GiB gerekir. Betik yetersiz alanda güvenli disk temizliği (`--clean`) önerir ve onay verildiğinde alan açar.

## 6. Günlükler ve çalışma dosyaları

Gerçek güncelleme ve temizlik günlükleri:

```text
/var/log/nexusnode-update/update-YYYYMMDDTHHMMSSZ.log
/var/log/nexusnode-update/clean-YYYYMMDDTHHMMSSZ.log
```

Kilitleme ve sürüm anlık kopyaları:

```text
/var/lib/nexusnode-update/
```

Bu dizinler root erişimine özeldir. Günlüğü kontrol etmek için:

```bash
sudo ls -lt /var/log/nexusnode-update/
sudo bash -c 'f=$(ls -1t /var/log/nexusnode-update/*.log 2>/dev/null | head -1); [ -n "$f" ] && tail -n 100 "$f"'
```

Günlükleri paylaşmadan önce hassas bilgi içermediğini doğrulayın.

## 7. Yedekleme güvenliği ve sınırlamalar

- Mevcut yedekte `database.dump`, `app_data`, `.env`, Vault ve `secrets/encryption_key` dahil hassas içerik bulunuyor. **Yedek klasörü ve dosyaları root-only erişimli olmalıdır.** İzinler beklenen güvenlik düzeyinde değilse betik durur; kendi kendine izin genişletmez.
- SHA256 kontrolü ve `pg_restore --list` **tam geri yükleme testi değildir**. Gerçekten geri yüklenebilirliği doğrulamak için ayrıca izole test gerekir.
- Yerel yedekler VPS ile aynı diskte kaldığından sunucu/disk arızasına karşı koruma sağlamaz. Sunucu dışı yedekleme ayrı aşamada eklenecek.
- Uygulama yayını kısa kesinti yaratabilir. Docker/OS paketi veya migration geri dönüşü otomatik ve risksiz sayılamaz.
- Bu betik `--check` için salt okunur; `--clean` ve `--run` paketler, önbellekler, servisler veya yedekler üzerinde **kontrollü değişiklik** yapar.
- Betik internetten indirdiği yeni GitHub kodunu, Debian paketlerini ve imajları çalıştıracağından, yetkili kişiler dışında hiç kimse proje kaynak dosyalarını veya `vps-update.sh` dosyasını değiştirememelidir. Root izinli çalıştırma yalnızca güvenilen kod için uygundur.

## 8. Doğrulama

Dosyayı VPS'ye kopyaladıktan sonra şu sıra önerilir:

```bash
cd /opt/iot-dashboard/iot-dashboard
bash -n ./vps-update.sh
sudo bash ./vps-update.sh --help
sudo bash ./vps-update.sh --check
```

**Önce `--check` çıktısını birlikte gözden geçirip engelleri çözelim; `--run` komutunu o aşamadan sonra çalıştıralım.**

Betik üzerinde yerel Bash sözdizimi/yol denetimi yapılmıştır. VPS üzerinde gerçek bir yükseltme veya geri yükleme provası yapılmış değildir.
