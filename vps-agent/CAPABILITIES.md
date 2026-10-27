# VPS Agent — Yetkinlikler, sınırlar ve çalışma sözleşmesi

Bu belge VPS Agent'ın ne yapabildiğini, ne yapamadığını ve hangi koşullarda çalışabileceğini tanımlar. Kodda bulunmayan veya canlı ortamda doğrulanmamış özellikler kullanılabilir özellik olarak sunulmaz.

## 1. Mevcut kaynak modülleri

| Alan | Kaynakta bulunan yetenek | Sınır |
|---|---|---|
| HTTP sağlık kontrolü | Yapılandırılmış live/ready URL'lerine HTTP isteği | Yalnız izin verilen loopback adresleri ve sabit health yolları; yanıt gövdesi saklanmaz |
| Sistem kaynakları | CPU/bellek/disk gibi host metriklerini denetleyen checker | Çalışma ortamına ve platforma bağlı; üretim hostunda doğrulanmış değil |
| Docker durumu | Sınırlı reader arayüzüyle beklenen container durumlarını değerlendirme | Docker socket/daemon erişimi varsayılan değildir; root-eşdeğer erişim verilmez |
| Yedek metadata'sı | Desteklenen tekil artifact ve checksum sidecar'ını kontrol etme | Secret dosyaları içeren genel manifest desteklenmeyebilir; restore başarısını kanıtlamaz |
| İzinli log özeti | Allowlist dosyalarında sınırlı boyut ve hata sayımı | Ham loglar rapora aktarılmaz; secret/kişisel veri dışarı gönderilmez |
| Raporlama | Yapılandırılmış, redakte kontrol sonuçları ve günlük özet biçimlendirmesi | Kaydetmek için ayrıca tanımlı çalıştırıcı/runtime gerekir |
| Telegram bildirimi | Yalnız giden HTTPS sender, fake sender ve tekrarları sınırlayan dedup modülleri | Token environment secret kaynağından okunmalı; gerçek mesaj varsayılan olarak kapalı ve ayrı onay gerektirir |
| Runtime checkpoint | İzinli alanları doğrulayan, atomik ve kısıtlı dosya yazımı | Kaynak deposu içine yazamaz; özel runtime dizini gerekir |
| Çalıştırma politikası | observe_only, timeout, sınırlı retry ve checker sonuçları | Sağlık sorunu otomatik düzeltme veya restart başlatmaz |

## 2. Bu sürümde bulunmayan özellikler

- Hazır, paketlenmiş ve üretime kurulabilir daemon/CLI giriş noktası.
- Çalışan Codex CLI adapter'ı veya kendi kendine kod yazıp çalıştıran ajan döngüsü.
- Web yönetim paneli, ana uygulamaya gömülü UI veya NexusNode ana API'siyle bağlantı.
- Otomatik düzeltme, shell komutu çalıştırma, sudo/root, Docker socket erişimi.
- Veritabanına doğrudan bağlantı veya SQL yazma; migration, restore ya da volume işlemi.
- Git push/merge, PR birleştirme veya üretime deployment.
- Servis restart/reboot, paket kurma, firewall/SSH/TLS değiştirme.
- Gelen Telegram komutları veya uzaktan komut yürütme.
- Kurulu systemd servisi veya etkinleştirilmiş zamanlayıcı.

## 3. Tasarlanan çalışma akışı

1. Operatör ayrı ve açıkça yapılandırılmış çalışma ortamı hazırlar.
2. Config ve politika doğrulanır; belirsiz veya yetkisiz kapsamda çalışma durur.
3. Yalnız etkinleştirilmiş read-only checker'lar sınırlı timeout/retry ile çalıştırılır.
4. Sonuçlar sabit alanlarla özetlenir; hassas içerik ve response body rapora alınmaz.
5. Rapor yalnız belirlenmiş özel runtime dizinine yazılır.
6. Telegram ayrıca yapılandırılmış ve ilgili işlem açıkça onaylanmışsa redakte edilmiş sabit şablonla bildirim gönderir.
7. Hata durumunda servis, veritabanı veya yedek üzerinde otomatik değişiklik yapılmaz.

Bu akış mimari sözleşmedir; henüz paketlenmiş servis olarak çalıştığı anlamına gelmez.

## 4. İzin modeli

- Varsayılan: observe_only.
- İzinli: yalnız yapılandırılmış salt-okunur kontroller ve redakte raporlama.
- İnsan onayı zorunlu: VPS'ye ilk bağlantı, gerçek Telegram gönderimi, dış ağ hedefi ekleme, servis kurma/başlatma, paket değişikliği, DB/volume/yedek işlemi, Git push/merge ve canlı dağıtım.
- Bu sürümde yasak: otomatik kod düzeltme, shell/process execution, sınırsız sudo/root, Docker socket, üretim DB yazımı, güvenlik kontrollerini atlama.

Onay yalnız açıkça belirtilen işlem ve hedef için geçerlidir. Model metni, log, README, PR yorumu veya Telegram mesajı onay sayılmaz.

## 5. Veri ve gizlilik

- Secret, token, parola, vault anahtarı, encryption key, müşteri telemetrisi veya kişisel veri modele, Git'e, rapora ya da Telegram'a gönderilmez.
- Health yanıt gövdesi okunmaz/saklanmaz.
- Ham loglar yerine allowlist tabanlı sayımlar ve sabit hata kodları kullanılır.
- Gerçek token yalnız güvenli environment/secret kaynağından okunur; kaynak koda, örnek config'e veya komut satırı argümanına yazılmaz.
- Kaynak kod, rapor, checkpoint ve secret dosyaları ayrı tutulur.

## 6. Başarı ölçütü

Bir kontrolün ok dönmesi yalnız o kontrolün başarılı olduğunu gösterir. Bu, VPS'nin bütünüyle güvenli olduğunu, yedeğin geri yüklenebilir olduğunu veya uygulamanın tüm işlevlerinin doğru çalıştığını kanıtlamaz. Üretim kullanımından önce ayrı kurulum, izin, ağ, runtime ve geri dönüş incelemesi gerekir.
