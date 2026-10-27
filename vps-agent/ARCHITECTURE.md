# VPS Agent — Mimari ve tehdit modeli

## Sınırlar

VPS Agent bağımsız vps-agent/ paketidir. Ana NexusNode UI/API/DB/build/deployment modüllerini import etmez; ana uygulama da VPS Agent modüllerini import etmez. Bu PR kaynak kodunu değiştirir, production VPS'sine erişmez.

## Veri akışı

~~~text
systemd timer (örnek; kurulu değil) veya elle CLI
  -> strict config + observe_only policy + instance lock
  -> salt-okunur HTTP / host / allowlist log / opsiyonel backup check
  -> redakte JSON raporu
  -> private runtime state (dedup + daily summary checkpoint)
  -> opsiyonel Telegram (config + env secret + CLI bayrağı)
  -> opsiyonel AI diagnosis (yalnız hata varsa; config + env secret + CLI bayrağı)
~~~

AI isteği sabit checker kimlikleri, durum/hata kodları ve yalnız sayısal/boolean metrikleri taşır. Ham log, health response body, URL, secret ve müşteri telemetrisi gönderilmez. AI yanıtı sadece raporda öneri olarak yer alır; komut çalıştırılmaz ve Telegram'a otomatik iletilmez.

## Modüller

- core/config.ts: Zod config doğrulama ve eşik tutarlılığı.
- core/policy.ts: varsayılan read-only davranış ve dış entegrasyon onay kapıları.
- core/runner.ts: timeout/retry sınırıyla seri checker çalıştırma.
- core/runtimeState.ts: whitelist alanlı, atomik ve özel runtime state; kaynak ağacına yazma yasağı.
- core/lock.ts: aynı anda birden çok çalışmayı engelleyen lock.
- monitoring/: HTTP health, host kaynakları, Docker reader arayüzü, backup artifact ve allowlist log sayımı.
- notifications/: sabit metinli Telegram sender, günlük özet ve kalıcılaştırılabilir dedup.
- analysis/openAiAnalyzer.ts: yalnız opt-in hata teşhisi, sabit endpoint, zaman/çıktı sınırı, hassas girdi minimizasyonu.
- systemd/: örnek servis/timer dosyaları; kurulum yapmaz.

## Güvenlik ve kalan riskler

| Risk | Kontrol | Kalan sınır |
|---|---|---|
| Bildirim spam'i | 24 saatlik kalıcı event dedup; günlük özet tarihi state'e yazılır | Yeni hata kodu veya durum yeni olay sayılır |
| Secret sızıntısı | Tokenlar env'den; sabit Telegram metni; AI'ye ham log gönderilmez | AI API'sine sınırlı metrik gönderilir ve maliyet doğurabilir |
| Dış ağ çağrısı | Sabit HTTPS endpoint, explicit CLI flag, timeout | API anahtarı host kurulumunda korunmalı |
| Eşzamanlı çalıştırma | Exclusive lock | Çökme sonrası stale lock elle incelenir |
| Docker root eşdeğeri | Docker socket adapter'ı yok | Gerçek Docker durumu bu sürümde bağlanmamıştır |
| Otomatik değişiklik | Shell/DB/deploy/restart yolu yok | Bakım otomasyonu kapsam dışıdır |

## Durum

Kaynak kod ve testler eklendi; yerel test/type-check/build henüz çalıştırılmadı ve gerçek VPS üzerinde doğrulanmadı. Bu mimari belge production hazır oluş kanıtı değildir.
