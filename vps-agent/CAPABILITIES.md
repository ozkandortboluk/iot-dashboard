# VPS Agent — Yetkinlikler ve çalışma sınırları

Bu PR kaynak kodu ve testler içerir; henüz yerel test/build veya gerçek VPS üzerinde doğrulanmış değildir.

## Kaynakta bulunan yetenekler

| Alan | Kodda bulunan | Sınır |
|---|---|---|
| HTTP sağlık | Allowlist edilmiş loopback live/ready URL'lerine istek | Yalnız HTTP durum kodu kullanılır; response body saklanmaz |
| Sistem kaynakları | Disk, inode, RAM ve CPU başına load eşikleri | İşletim sistemi metrikleri host üzerinde ayrıca doğrulanmalı |
| Docker durumu | Beklenen konteyner durumlarını değerlendiren reader arayüzü | İsteğe bağlı loopback read-only HTTP proxy adapter'ı vardır; config varsayılan kapalıdır ve proxy kurulumu ayrı iştir |
| Yedek metadata'sı | İzin verilen tekil artifact + SHA-256 sidecar kontrolü | Restore başarısını kanıtlamaz |
| Log özeti | Allowlist dosyalarında hata işaretlerini sayar | Ham log satırları rapora, Telegram'a veya modele gönderilmez |
| CLI | Config doğrulama, salt-okunur kontroller, JSON raporu ve exit code | Otomatik kurulum yapmaz |
| Kalıcı durum | Özel state dosyasında son çalışma, günlük özet tarihi ve sınırlı bildirim geçmişi | Runtime yolu ayrıca yapılandırılmalı; Linux izinleri özel olmalı |
| Telegram | Sabit metinli HTTPS mesajı, kalıcı 24 saatlik tekrar bastırma ve günlük özet | Varsayılan kapalı; config + environment secret + --allow-telegram-send gerekir |
| Yapay zekâ teşhisi | Yalnız sorun varsa, sınırlı çıktı tokeniyle OpenAI API teşhisi | Varsayılan kapalı; config + API key environment + --allow-ai-analysis gerekir |
| Çalıştırma kilidi | Aynı state dosyasını kullanan eşzamanlı çalışmaları engeller | Kesinti sonrası kalan kilit otomatik silinmez |

## Bu sürümde bulunmayanlar

- Kurulmuş/etkinleştirilmiş VPS servisi veya zamanlayıcı; systemd dosyaları örnektir.
- Çalışan Codex CLI adapter'ı veya kendiliğinden kod yazıp çalıştıran ajan döngüsü.
- Ana uygulamaya gömülü UI/API/DB bağlantısı.
- Doğrudan Docker socket/daemon erişimi yoktur; Docker durumu yalnız ayrıca yapılandırılmış loopback read-only proxy üzerinden okunabilir.
- Otomatik düzeltme, shell komutu, sudo/root, DB yazımı, migration, restore veya volume işlemi.
- Servis restart/reboot, paket kurma, firewall/SSH/TLS değişikliği.
- Git push/merge, deployment veya gelen Telegram komutları.

## Çalışma akışı

1. Operatör bağımsız config ve özel state dizinini hazırlar.
2. Agent observe_only politikasını ve config'i doğrular.
3. Etkin salt-okunur kontrolleri timeout/retry sınırlarıyla çalıştırır.
4. Hata yoksa AI çağrısı yapmaz. Hata varsa AI ancak config etkin ve CLI bayrağı verilmişse devreye girer.
5. Telegram yalnız config etkin, environment secret'ları mevcut ve CLI bayrağı verilmişse mesaj gönderir.
6. Bildirim geçmişi ve günlük özet tarihi özel runtime dosyasına kaydedilir.
7. Hata otomatik restart, silme, DB/backup değişikliği veya deployment başlatmaz.

AI isteğine yalnız sabit kontrol kimlikleri, durum/hata kodları ve sayısal/boolean metrikler dahil edilir. Ham log, URL, secret ve müşteri telemetrisi gönderilmez. AI çıktısı öneridir; komut çalıştırılmaz.

## Başarı ölçütü

Her kontrolün başarılı olması VPS'nin bütünüyle güvenli olduğunu ya da yedeğin geri yüklenebilir olduğunu kanıtlamaz. Üretim kullanımından önce bağımsız kurulum, izin, ağ ve runtime doğrulaması gerekir.
