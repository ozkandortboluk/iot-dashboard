# NexusNode VPS Update — v0.2

Bu betik NexusNode Git deposunun **ana dizininde** (`/opt/iot-dashboard/iot-dashboard/vps-update.sh`) bulunacak şekilde düzenlenmiştir. Ek bir `/tmp` aktarımı veya `/usr/local/sbin` kurulumu **gerekmez**. Bütün komutları sunucuda **proje ana dizininden** çalıştırın.

## 1. Dosyaların yeri

Aşağıdaki iki dosyayı proje ana dizinine yerleştirin:

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

## 2. Birinci çalıştırma — hiçbir güncelleme yapmadan kontrol

```bash
cd /opt/iot-dashboard/iot-dashboard
sudo bash ./vps-update.sh --check
```

`--check`, mevcut APT paket listesini, disk durumunu, Docker/Compose, Git çalışma ağacı, yedekleme servisi, HTTPS ve API sağlığını **salt okunur** kontrol eder. Ne yeni yedek oluşturur ne paket/image indirir ne de dosya siler. Güncel uzak paket veya GitHub sürümlerini sorgulamaz.

Yardım için:

```bash
sudo bash ./vps-update.sh --help
```

## 3. Gerçek güncelleme

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
9. HTTPS/API/veritabanı ve temel sistem servislerini kontrol eder. `/run/reboot-required` varsa yeniden başlatmak için terminalden **`evet`** yanıtını bekler.

**TimescaleDB/PostgreSQL imajını güncellemez.** Bunun için ayrıca kullanıcı onaylı, ayrı bir işlem tasarlanacaktır. PostgreSQL ve uygulama Docker volume'ları korunur.

## 4. Mevcut VPS durumunda beklenen engel

18 Ekim 2026 denetiminde `main` dalında değişmemiş dosyalar olmakla beraber `ort`, `category:`, `docker-compose.yml.before-vault-fix`, `full_backup.sql` gibi **takip edilmeyen diğer dosyalar** vardı. Betik bunları **silmez, taşımaz veya otomatik yoksaymaz**. `--check` bunları gösterecek; `--run` güvenlik gerekçesiyle duracaktır. Gerekenler ayrı ayrı incelenmeli, hassas veriler proje dışına güvenli izinlerle alınmalı veya kullanıcının kararıyla düzenlenmelidir. Körlemesine `git clean -fd` veya `git reset --hard` kullanmayın.

Ayrıca diskte yaklaşık **4,4 GiB boş alan** görülmüştü. Betiğin güncelleme/derleme önkoşulu **6 GiB** olup ilk yedek için en az 1 GiB gerekir. Betik yalnızca onay verilen build-cache temizliğini deneyebilir; alan hâlâ yetmiyorsa durur.

## 5. Günlükler ve çalışma dosyaları

Gerçek güncelleme günlükleri:

```text
/var/log/nexusnode-update/update-YYYYMMDDTHHMMSSZ.log
```

Kilitleme ve sürüm anlık kopyaları:

```text
/var/lib/nexusnode-update/
```

Bu dizinler root erişimine özeldir. Günlüğü kontrol etmek için:

```bash
sudo ls -lt /var/log/nexusnode-update/
sudo bash -c 'f=$(ls -1t /var/log/nexusnode-update/update-*.log 2>/dev/null | head -1); [ -n "$f" ] && tail -n 100 "$f"'
```

Günlükleri paylaşmadan önce hassas bilgi içermediğini doğrulayın.

## 6. Yedekleme güvenliği ve sınırlamalar

- Mevcut yedekte `database.dump`, `app_data`, `.env`, Vault ve `secrets/encryption_key` dahil hassas içerik bulunuyor. **Yedek klasörü ve dosyaları root-only erişimli olmalıdır.** İzinler beklenen güvenlik düzeyinde değilse betik durur; kendi kendine izin genişletmez.
- SHA256 kontrolü ve `pg_restore --list` **tam geri yükleme testi değildir**. Gerçekten geri yüklenebilirliği doğrulamak için ayrıca izole test gerekir.
- Yerel yedekler VPS ile aynı diskte kaldığından sunucu/disk arızasına karşı koruma sağlamaz. Sunucu dışı yedekleme ayrı aşamada eklenecek.
- Uygulama yayını kısa kesinti yaratabilir. Docker/OS paketi veya migration geri dönüşü otomatik ve risksiz sayılamaz.
- Bu betik `--check` için salt okunur; `--run` paketler, kaynak kodu, imajlar, servisler ve yedekler üzerinde **gerçek değişiklik** yapar.
- Betik internetten indirdiği yeni GitHub kodunu, Debian paketlerini ve imajları çalıştıracağından, yetkili kişiler dışında hiç kimse proje kaynak dosyalarını veya `vps-update.sh` dosyasını değiştirememelidir. Root izinli çalıştırma yalnızca güvenilen kod için uygundur.

## 7. Doğrulama

Dosyayı VPS'ye kopyaladıktan sonra şu sıra önerilir:

```bash
cd /opt/iot-dashboard/iot-dashboard
bash -n ./vps-update.sh
sudo bash ./vps-update.sh --help
sudo bash ./vps-update.sh --check
```

**Önce `--check` çıktısını birlikte gözden geçirip engelleri çözelim; `--run` komutunu o aşamadan sonra çalıştıralım.**

Betik üzerinde yerel Bash sözdizimi/yol denetimi yapılmıştır. VPS üzerinde gerçek bir yükseltme veya geri yükleme provası yapılmış değildir.
