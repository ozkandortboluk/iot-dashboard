# VPS Agent

VPS Agent, NexusNode IoT Dashboard'dan bağımsız, salt-okunur VPS sağlık denetimi aracıdır. Ana uygulamanın UI, API, DB, build veya deployment akışına bağımlı değildir.

## Durum

Kodda CLI, HTTP sağlık kontrolleri, host kaynak eşikleri, kalıcı bildirim dedup, Telegram göndericisi ve açıkça etkinleştirilen AI teşhis adaptörü bulunur. Bu PR henüz yerel test/type-check/build veya gerçek VPS üzerinde doğrulanmamıştır. Systemd dosyaları örnektir; kurulu servis/zamanlayıcı değildir.

## Yerel çalıştırma

~~~powershell
cd vps-agent
Copy-Item .\config\monitor.example.json .\config\monitor.local.json
npm.cmd install
npm.cmd run agent -- --config (Resolve-Path .\config\monitor.local.json).Path
~~~

CLI varsayılan olarak salt-okunur kontrolleri çalıştırır; gerçek Telegram veya AI çağrısı yapmaz. JSON raporu stdout'a yazılır. Çıkış kodları: 0=ok, 1=uyarı/bilinmiyor veya entegrasyon hatası, 2=kritik, 64=başlangıç/yapılandırma hatası.

## Harici entegrasyonlar

- Telegram için telegram.enabled=true, özel runtime.statePath ve VPS_AGENT_TELEGRAM_BOT_TOKEN / VPS_AGENT_TELEGRAM_CHAT_ID environment değerleri gerekir. Gerçek mesaj için komuta ayrıca --allow-telegram-send eklenmelidir.
- AI varsayılan kapalıdır. Açmak için ai.enabled=true, OPENAI_API_KEY environment değeri ve komuta --allow-ai-analysis eklenmelidir. AI yalnız uyarı/kritik/bilinmeyen sonuç varsa çağrılır; ham log, secret, URL veya müşteri telemetrisi gönderilmez.
- Bu bayrakları örnek systemd servisine eklemek operatörün ayrıca yaptığı bir tercihtir.
- Docker izleme için docker.enabled=true ve readOnlyProxyUrl ile ayrıca kurulmuş, loopback üzerinde çalışan read-only Docker API proxy gerekir. VPS Agent doğrudan Docker socket'ine bağlanmaz.

## Bağımsız doğrulama

Testler geliştiricinin kendi makinesinde veya izole ortamda çalıştırılmalıdır; GitHub üzerinde test çalıştırılmaz.

~~~powershell
npm.cmd test
npm.cmd run type-check
npm.cmd run build
~~~

Ana uygulamanın type-check/build/test kontrolleri de aynı yerel oturumda ayrı olarak yapılmalıdır. Sonuçlar çalıştırılmadan başarılı kabul edilmez.

## Güvenlik

VPS Agent kaldırılırsa ana NexusNode uygulamasının kaynak kodu, build'i, API uçları, veritabanı ve deployment akışı çalışmaya devam etmelidir. Varsayılan mod observe_only; otomatik düzeltme, shell, DB yazımı, servis restart'ı, restore, merge veya deployment yoktur.
