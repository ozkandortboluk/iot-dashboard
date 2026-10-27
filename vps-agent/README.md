# VPS Agent

VPS Agent, NexusNode IoT Dashboard'dan bağımsız tasarlanan salt-okunur VPS sağlık denetimi modülüdür. Ana uygulamanın bir parçası değildir; ana uygulama derlemesi, API'si, veritabanı şeması veya dağıtım akışı bu klasöre import yapmaz.

## Başlamadan önce
- Yetkinlikler ve sınırlar: CAPABILITIES.md
- Güvenlik kuralları: SECURITY.md
- Mimari sınırlar: ARCHITECTURE.md
- İşletim notları: OPERATIONS.md
- Kaldırma işlemi: UNINSTALL.md

## Durum
Bu depo denetim modüllerini, yerel CLI giriş noktasını ve testlerini içerir; tamamlanmış/kurulmuş VPS servisi veya çalışan web paneli değildir. Örnek systemd birimleri kurulum talimatı değil, taslaktır. Codex CLI çağıran çalışan adapter yoktur. VPS bağlantısı, servis kurulumu, zamanlayıcı veya Telegram gönderimi kendiliğinden başlamaz.

## Yerel çalıştırma
PowerShell örneği; uygulama sağlık URL'si yerel ortamda erişilebilir olmalıdır:

~~~powershell
cd vps-agent
Copy-Item .\\config\\monitor.example.json .\\config\\monitor.local.json
npm.cmd install
npm.cmd run agent -- --config (Resolve-Path .\\config\\monitor.local.json).Path
~~~

CLI yalnız salt-okunur denetimleri çalıştırır ve JSON raporunu stdout'a yazar. Çıkış kodu 0=ok, 1=uyarı/bilinmiyor, 2=kritik, 64=başlangıç/yapılandırma hatasıdır. Gerçek VPS bağlantısı, Telegram gönderimi, servis kurulumu veya otomatik düzeltme yapmaz. Yerel config dosyasını Git'e eklemeyin.

## Bağımsız doğrulama
Testler geliştiricinin kendi makinesinde veya izole ortamda çalıştırılmalıdır; GitHub üzerinde test çalıştırılmaz.

~~~powershell
npm.cmd test
npm.cmd run type-check
npm.cmd run build
~~~

VPS Agent'a özel bağımsız paket dosyaları klasör içindedir; kök uygulamanın bağımlılıklarına güvenerek çalıştırılmamalıdır.

## Temel ilke
VPS Agent kaldırılırsa ana uygulamanın kaynak kodu, derlemesi, API uçları, gezinmesi, veritabanı ve dağıtım akışı çalışmaya devam etmelidir. VPS Agent yalnızca kendi klasöründeki dosyalara ve ayrıca açıkça yapılandırılmış dış kaynaklara bağlı olabilir.
