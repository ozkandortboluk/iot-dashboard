# NexusNode Codex yönetim sistemi

Bu PR, yalnızca yerel kaynak kodu, test ve örnek yapılandırma sağlar. Üretim VPS'sine erişmez; servis kurmaz/etkinleştirmez; otomatik düzeltme, shell, DB yazımı, push, merge veya deployment yapmaz. Başlangıç modu `observe_only`'dir.

## Durum

`IMPLEMENTATION_PROMPT.md` fazlarına göre ilerleme `WORK_PROGRESS.md` içinde tutulur. Mimari ve tehdit modeli `ARCHITECTURE.md`, operasyon/güvenli geri dönüş sınırı `OPERATIONS.md`, zorunlu korumalar `SECURITY.md` içindedir. Örnek ayar `config/monitor.example.json` içindedir; gerçek secret içermez.

## Yerel doğrulama

Repository `vitest.config.ts` yalnız `src/tests` altını taradığı için bu alt sistem için `src/codex/vitest.config.ts` kullanılır. GitHub Actions'a test eklenmez veya testler GitHub'da çalıştırılmaz.

```powershell
npm.cmd exec -- vitest run --config src/codex/vitest.config.ts
npm.cmd run type-check
```

Telegram fake sender ile sınanır; gerçek gönderim yapılmaz. Codex CLI adapter'ı bilerek kapalıdır; CLI sürümü/kimlik doğrulama doğrulanmadan process başlatmaz.

## Entegrasyon sınırları

- Health: yalnız loopback URL ve sabit health path; response body yok sayılır.
- PostgreSQL: doğrudan DB bağlantısı yerine `/api/health/ready` HTTP status kodu.
- Docker: root-eşdeğer socket/daemon erişimi varsayılan kapalı, sadece reader interface mevcut.
- Backup: mevcut root yedek scriptleri çağrılmaz; secret dosyalarını içeren mevcut `manifest.sha256` biçimi desteklenmiyorsa güvenli `unknown` sonucu.
- Telegram: yalnız HTTPS giden bildirim; token sadece environment secret kaynağından; incoming komut yok.
- Runtime: report/lock/log gibi çıktılar kaynak ağacına değil, ileride ayrıca onaylanacak kısıtlı runtime dizinine gider.

## Admin paneli

Admin rolü sistemdeki **Eklentiler** bölümünden `NexusNode Codex` modülünü açıp kapatabilir, izinleri verebilir ve özellikleri seçebilir. Modül varsayılan olarak kapalıdır; kapalıyken `createAdminConfiguredCheckers` boş checker listesi döndürür. Admin API ayarı yalnız admin'e açar; shell, DB yazımı, servis yönetimi, Git push/merge ve deployment grant alanı yoktur. Codex analizi ve Docker daemon erişimi kilitlidir.

Panelin “Nasıl çalışır?” bölümü modülü açma, salt-okunur izinleri ve features ayarlama adımlarını anlatır. Panelde tercih kaydetmek bir production agent kurmaz veya başlatmaz; gerçek Telegram erişimi ayrıca işlem bazında onay ister. Modülü daha sonra ayırma adımları `UNINSTALL.md` içindedir.
