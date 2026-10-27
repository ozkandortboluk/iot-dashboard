# VPS Agent

VPS Agent, NexusNode IoT Dashboard'dan bağımsız tasarlanan salt-okunur VPS sağlık denetimi modülüdür. Ana uygulamanın bir parçası değildir; ana uygulama derlemesi, API'si, veritabanı şeması veya dağıtım akışı bu klasöre import yapmaz.

## Başlamadan önce
- Yetkinlikler ve sınırlar: CAPABILITIES.md
- Güvenlik kuralları: SECURITY.md
- Mimari sınırlar: ARCHITECTURE.md
- İşletim notları: OPERATIONS.md
- Kaldırma işlemi: UNINSTALL.md

## Durum
Bu depo denetim modüllerini ve testlerini içerir; tamamlanmış/kurulmuş VPS servisi veya çalışan web paneli değildir. Örnek systemd birimleri kurulum talimatı değil, taslaktır. Codex CLI çağıran çalışan adapter yoktur. VPS bağlantısı, servis kurulumu, zamanlayıcı veya Telegram gönderimi kendiliğinden başlamaz.

## Bağımsız doğrulama
Testler geliştiricinin kendi makinesinde veya izole ortamda çalıştırılmalıdır; GitHub üzerinde test çalıştırılmaz.

~~~powershell
npm.cmd exec -- vitest run --config vps-agent/vitest.config.ts
~~~

VPS Agent'a özel bağımsız paket dosyaları klasör içindedir; kök uygulamanın bağımlılıklarına güvenerek çalıştırılmamalıdır.

## Temel ilke
VPS Agent kaldırılırsa ana uygulamanın kaynak kodu, derlemesi, API uçları, gezinmesi, veritabanı ve dağıtım akışı çalışmaya devam etmelidir. VPS Agent yalnızca kendi klasöründeki dosyalara ve ayrıca açıkça yapılandırılmış dış kaynaklara bağlı olabilir.
