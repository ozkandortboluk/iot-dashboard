# NexusNode Codex — Mimari ve Tehdit Modeli

## Keşif kanıtı ve sınır

Bu tasarım repository kaynaklarına dayanır; üretim VPS'sinin durumu incelenmemiştir. Compose app liveness için `/api/health/live` kullanır; uygulama route'u `/api/health/ready` veritabanı hazır oluşunu da kapsar. Readiness yanıtı ayrıntı içerebildiğinden istemci yanıt gövdesini okumaz. Host Nginx `docker/nginx/nginx.conf` altındadır.

DR kodu `/var/backups/nexusnode/gunluk` altında root tarafından üretilen yerel snapshot'lar ve ayrı şifreli offsite arşivleri kullanır. Snapshot manifesti secret içeren dosyaları kapsar; bu nedenle yeni ajan genel manifesti çözümleyip içerik dosyalarını hash'lemez. Backup denetimi, yalnızca açıkça yapılandırılmış, güvenli ve secret içermeyen tekil artifact ile checksum sidecar'ını destekler. Mevcut format bu güvenli profile uymuyorsa sonuç `unsupported` olur.

## Modüller

- `core/config.ts`: Zod ile yapılandırma doğrulama; varsayılan mod `observe_only`.
- `core/policy.ts`: mod/işlem kapısı; tüm üretim mutasyonları ve yayın işlemleri varsayılan olarak reddedilir.
- `core/runner.ts`: sınırlı timeout/retry ile seri, read-only checker yürütme.
- `core/report.ts` ve `core/redaction.ts`: veri minimizasyonu ve yapılandırılmış özet.
- `monitoring/`: HTTP health, host kaynakları, salt-okunur Docker adapter arayüzü, backup artifact/checksum, allowlist log sayımı.
- `notifications/`: HTTPS giden Telegram sender, sahte sender ve sınırlı event dedup.
- `codex/analyzer.ts`: kapalı varsayılan analyzer arayüzü; CLI çağırmaz.
- `approvals/`: ayrı insan onayı olmadan approved release'i reddeden politika kapısı.
- `operations/`: yerel, elle başlatılan tek seferlik CLI; servis kurulumu veya ağ yetki yükseltmesi yapmaz.
- `plugin.ts` / `pluginMetadata.ts`: admin navigation için tek kayıt yüzeyi; `admin/router.ts` Codex API sınırıdır. Host uygulamaya gereken kayıtlar kaldırma kılavuzunda tutulur.

Docker daemon API'si root eşdeğeridir; Docker CLI adapter'ı varsayılan olarak kapalıdır. Açıkça etkinleştirilmesi, operatörün servis hesabına daemon erişimi vermesi anlamına gelir ve ayrı risk kabulü gerektirir. DB portuna bağlanılmaz; uygulama readiness HTTP kodu DB sinyali olarak kullanılır.

## Veri akışı

```text
elle başlatılan observe-only CLI
  -> doğrulanmış config + policy
  -> sıralı read-only checker'lar (timeout/retry)
  -> hassas gövdesiz, redakte sonuçlar
  -> yerel rapor; opsiyonel ve ayrı etkinleştirilen Telegram bildirimi
```

Admin modül anahtarı varsayılan kapalıdır. Kapatıldığında admin tercihleri korunur ancak bridge hiçbir checker üretmez. Checker hatası yalnızca rapor/uyarı üretir. Restart, shell, update, DB yazımı, backup üretimi/silme, restore, push, merge ve deploy için kod yolu yoktur. Runtime lock/state/log dosyaları yalnızca harici runtime dizinine yazılır; `src/codex/` içine çalışma çıktısı yazılmaz.

## Tehdit modeli

| Tehdit | Kontrol | Artık risk |
|---|---|---|
| Kötü amaçlı log/telemetri talimatı | Ham içerik raporlanmaz/model girdisi yapılmaz; sabit hata sınıfları | Log regex'i yanlış alarm üretebilir |
| Secret sızıntısı | Health body yok sayılır; hata/URL redakte edilir; env secret sadece sender içinde okunur | Harici Telegram servisine gönderilen metin yapılandırma hatasıyla hassas bilgi içerebilir; metin şablonları sabit tutulur |
| Ajanın yetki kazanması | Allowlist checker, shell/mutasyon arayüzü yok, observe-only varsayılan | Host seviyesinde dosya/daemon izinleri ayrıca sınırlandırılmalıdır |
| Çakışan veya sonsuz iş | Tek instance lock, timeout, sınırlı retry ve dedup | OS/FS lock semantiği platforma göre farklıdır |
| Sahte backup başarı sinyali | Yalnız desteklenen artifact checksum doğrulanır; diğer format `unsupported` | Checksum bütünlüğü restore edilebilirliği kanıtlamaz |
| Kesinti/yarım rapor | Atomik rapor yazımı ve lock temizleme | Güç kesintisi/bozuk filesystem ayrıca ele alınmalıdır |
| Telegram kesintisi/yanıt sahteciliği | Giden HTTPS, kısa timeout, API kabulü ayrıca raporlanır | Gerçek gönderim bu PR'da onaylanıp denenmez |

## Faz 1 dosya planı

Faz 2–6 boyunca yeni uygulama, test, örnek config ve servis şablonları yalnız `src/codex/` altında tutulur. Kök package scripts, Compose, Nginx, `vps-update.sh` ve `sec-all.sh` değiştirilmez; TypeScript/Vitest komutları dosya yoluyla yerel çalıştırılır.
