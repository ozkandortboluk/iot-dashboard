# VPS Agent — Mimari ve izolasyon

## Yerleşim
VPS Agent, repository kökünde vps-agent/ altında ayrı bir alt projedir. Ana uygulama src/ içinden VPS Agent import etmez. VPS Agent da ana uygulamanın server, UI, permission veya database modüllerini import etmez.

## Bağımlılık sınırı
- Kendi package.json, tsconfig.json, vitest.config.ts, config örneği, dokümantasyonu ve testleri vardır.
- Ana uygulamanın package.json, lockfile, build script'i, Docker Compose, Nginx, API route'ları ve DB migration'ları VPS Agent için değiştirilmez.
- Ana uygulama kaldırıldığında VPS Agent kendi bağımsız tasarımına göre ileride ayrı servis olarak paketlenebilir; mevcut kaynak henüz kurulu servis değildir.
- Ana uygulama kaldırılırken VPS Agent silinmek zorunda değildir; iki yönde de çalışma zamanı bağımlılığı olmamalıdır.

## Veri akışı
Operatörün ayrıca başlattığı çalışma -> config doğrulama -> read-only checker'lar -> redakte rapor -> isteğe bağlı ve ayrıca onaylı outgoing notification.

Health yanıt gövdesi yok sayılır. DB portuna doğrudan bağlanılmaz. Docker daemon adapter'ı yalnız reader arayüzüdür; daemon/socket erişimi verilmesi root-eşdeğer risk doğurur ve varsayılan değildir.

## Kapsam dışı
Ana uygulama yönetim paneli, API route'u, generic settings endpoint'i, uygulama veritabanı ayarı veya ana uygulama lifecycle'ına bağlanan scheduler yoktur. Üretim VPS durumu bu repository'den doğrulanamaz.
