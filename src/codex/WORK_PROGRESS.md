# Codex VPS Yönetim Sistemi — İş İlerleme Kaydı

> Bu dosya kesinti sonrası devam edebilmek için tutulur. Her yeni Codex oturumu önce `IMPLEMENTATION_PROMPT.md` ve bu dosyayı okumalı, sonra Git durumuyla karşılaştırmalıdır. Secret, token, parola veya hassas üretim verisi yazmayın.

## Görev

- **Prompt:** `src/codex/IMPLEMENTATION_PROMPT.md`
- **Prompt sürümü:** 1
- **Durum:** DONE (uygulama ve güvenlik incelemesi tamamlandı; 2026-10-27 tarihinde main'e alındı)
- **Aktif faz:** Tamamlandı — VPS kurulumu için ayrı, açık kullanıcı onayı gerekir
- **Branch:** PR #27 ve yerel Codex yönetim modülü main'e birleştirildi
- **Son uygulama commit'i:** 590db2c (Codex modülü; main merge commit'i bu commit'i içerir)
- **Son güncelleme:** 2026-10-27.

## Keşif özeti

- Başlangıçta `main` üzerindeki `b2b6786` sonrası PR dalına geçiş güvenliydi. Devam oturumunda yerel `pr-27` iki commit gerideydi; yalnızca talimat/güvenlik dokümanı içeren `origin/docs/codex-vps-implementation-prompt` fast-forward edildi ve yerel WORK_PROGRESS değişikliği korundu.
- Node >=20, TypeScript ES2022/bundler, Vitest (yalnız `src/tests/**/*.test.ts[x]`), Zod bağımlılığı ve `test`, `type-check`, `lint`, `build` komutları keşfedildi. Testler yerel çalıştırılabilir; hiçbir GitHub workflow'u çalıştırılmayacak.
- Docker Compose servisleri `timescaledb`, `app`, isteğe bağlı `proxy` ve `adminer`; app liveness `/api/health/live`, uygulama/DB readiness `/api/health/ready`. Nginx dosyası `docker/nginx/nginx.conf`; `nginx/` kök klasörü yok.
- Readiness yanıt gövdesi hata/pool/retry ayrıntısı taşıyabildiğinden denetleyici yalnız HTTP durum kodu ve süreyi tutmalı; gövdeyi hiçbir zaman okumamalı. DB'ye doğrudan bağlanma veya sorgu yok.
- Host backup `scripts/dr/local-backup.sh` root, Docker ve üretim secrets kullanıyor; SHA-256 `manifest.sha256` içeriği göreli dosya yolu + checksum. Offsite `scripts/dr/nexus-dr.sh` arşiv `manifest.json` ve şifreleme kullanıyor. PR denetleyicisi bu scriptleri çağırmayacak; sadece yapılandırılmış, izin listeli yerel path'ten manifest/checksum okuyacak.
- `vps-update.sh` yedekten sonra health, image ve rollback kapıları yönetiyor; `sec-all.sh` de servis/root bağlamlı komutlar içeriyor. Her ikisi yalnız incelendi, çalıştırılmayacak/değiştirilmeyecek. Secret düzeni Docker `/run/secrets` ve uygulama kasasıdır; Codex'e erişim verilmeyecek.
- Üretim VPS durumu bilinmiyor ve bu görevde incelenmeyecek. Codex CLI sürüm/kimlik doğrulama resmi kaynağa göre teyit edilmediğinden ilk sürümde model çağrısı kapalı adapter olacak.
- Faz 1 tasarımı `ARCHITECTURE.md` ve `OPERATIONS.md` içinde tamamlandı; modül/veri akışı, runtime izin sınırı, threat model, backup format sınırı ve sonraki kurulum onay kapıları yazıldı.
- Faz 2 iskeleti eklendi: Zod config (loopback health allowlist), observe-only policy, report/types/redaction, disabled Codex/release adapters, README, example config ve unit test harness.
- Faz 2 ilk test koşusunda 4 testten 3'ü geçti; nested Zod default davranışı düzeltildi. Tekrar koşusunda özel testler 4/4 geçti, `npm.cmd run type-check` exit 0.
- Faz 3 checker'ları eklendi: HTTP readiness (body discard), host statfs/RAM/CPU load, güvenli backup checksum profili, allowlisted log summary, injectable/disabled Docker reader, bounded retry/timeout ve exclusive lock.
- Faz 3: özel suite 10/10 geçti; `npm.cmd run type-check` exit 0. İlk suite denemesinde lock testindeki yarış düzeltildi ve tekrar başarılı oldu.
- Faz 4 tamamlanan kapsam: Telegram outgoing-only HTTP sender, named environment secret lookup, fixed notification templates, fake sender, TTL/bounded event dedup, daily summary timezone helper ve delivery orchestrator.
- Faz 4 doğrulama: özel suite 15/15 geçti; `npm.cmd run type-check` exit 0.
- Faz 5 güvenlik kapsamı: gerçek Telegram delivery çağrı bazında açık onay ister; runtime checkpoint allowlist/atomic write eklendi; readiness/live ve DB readiness ayrıldı; secret/shell source scan ve runtime tests eklendi.
- Kullanıcı isteğiyle admin-panel yönetimi kapsamı eklendi: admin-only `codex_monitor_config` API, strict allowlist şeması, privilege escalation dışı izin/özellik toggles ve dedicated admin tab. Generic settings endpoint'inden config okuma/yazma kapatıldı; agent kurulum/çalıştırma yok.
- Admin panel tercihleri yalnız güvenli feature flags içindir: Codex analizi ve Docker adapter kilitli, release/shell/DB/service/git/deploy yetkileri şemada yok. Gerçek Telegram delivery yine işlem bazında açık onay gerektirir.
- Uzak PR ucu sonradan `1c5648e` checkpoint-only commit'i aldı. Commit'teki SECURITY.md ve güvenlik politikası notu korunarak bu çalışma checkpoint'ine dahil edildi; yerel branch `fef936c` kaldı ve upstream 1 commit ileride.
- Admin panel bağlandı: yalnız admin navigation, `GET/PUT /api/system/codex/config` (`authenticateUser` + `requireAdmin`), strict config schema ve `createAdminConfiguredCheckers` policy bridge. Generic settings API config'i diğer rollerden saklar ve generic yazmayı reddeder.
- Faz 5 doğrulaması: özel Vitest suite 6 dosya / 23 test geçti; hedefli ESLint exit 0; tam type-check exit 0.
- Faz 6 dokümanlar ve örnek systemd unit/timer eklendi. Örnek ExecStart hedefi henüz paketlenmiyor; servis dosyaları kurulmamalı/etkinleştirilmemeli.
- Final `build:client` exit 0 (52.23 sn); Zod annotation, boş vendor-react chunk ve 2 MB üstü bundle uyarıları var. `git diff --check` temiz.
- Genişletilmiş yerel doğrulama: `npm.cmd test` exit 0; 85 dosya geçti, 2 atlandı; 691 test geçti, 26 atlandı (toplam 717, 272.47 sn).
- `npm.cmd run lint` exit 0; full ESLint ve TypeScript noEmit kontrolleri geçti.
- Yerel `npm.cmd run test:ci`: lint, type-check, provenance, full tests, production build ve parity geçti; smoke aşamasında exit 1. Smoke server'ı production modda `/run/secrets/encryption_key` dosyası bekler, bu Windows yerel ortamında yoktur; gerçek secret oluşturulmadı.
- Smoke testi `DATABASE_URL` bu shell'de unset iken yerel `data/db.json` içine bir reserved `dev_smk_01` test cihazı yazdı. Başarısız erken çıkış cleanup çağırmadığından dosyadaki yalnız bu fixture kaldırıldı, diğer collection'lar korundu; `scripts/smoke-test.mjs` erken health failure cleanup'ı eklendi.
- Kullanıcı yönlendirmesi: Codex yönetimi genel sistemde ayrı **Eklentiler** bölümüne taşınacak; Codex çıkarılabilir modül olacak ve panel içinde nasıl çalıştığı anlatılacak. Master switch default-off eklendi, switch kapalıysa bridge checker üretmiyor; `UNINSTALL.md` host kayıt noktalarını ve güvenli kaldırma adımlarını anlatıyor.
- Son kullanıcı yönlendirmesiyle genel sistemde **Eklentiler** bölümü eklendi; Codex bu bölümde kapalı varsayılan, açılıp kapatılabilir eklenti olarak görünür. Panel `Nasıl çalışır?` adımlarını ve izin/özellik ilişkisini açıklar.
- Eklentiler UX'i katalog + ayrıntı akışına ayrıldı: katalogda eklenti kartı, durum rozeti ve ayrıntılara geçiş; Codex ayarlarında tüm eklentilere geri dönüş düğmesi. Yeni eklentiler geldiğinde ayrı kart olarak eklenebilecek.
- Plugin sınırı: `plugin.ts` admin navigation kayıt noktası, `pluginMetadata.ts` UI dışı metadata, `admin/router.ts` admin-only API. Host app'teki dört küçük kayıt (App, Sidebar, permissions, system route) kaldırma belgesinde listeli.
- Smoke testi cleanup fix'i sonrasında tekrar denendi; beklenen health timeout devam etti ama `data/db.json` içinde reserved fixture sayısı 0 olarak doğrulandı, diğer collection'lara dokunulmadı.
- `npm.cmd run test:e2e` — 1 dosya, 15 test geçti.
- Üretim VPS'si incelenmiş değildir; sunucu durumu hakkında varsayım yapılmamalı.

## Tamamlanan adımlar

- [x] Uygulama talimatı ve kesinti sonrası devam sözleşmesi eklendi.
- [x] Git çalışma ağacı, aktif branch, son commit ve mevcut kullanıcı değişiklikleri incelendi; değişiklikler korundu.
- [x] Repository mimarisi ve mevcut test komutları keşfedildi.
- [x] Mevcut secrets, backup, rollback, update ve security-audit düzeni kaynak koddan incelendi.
- [x] Keşif raporu ve faz planı hazırlandı.
- [x] Faz 1 tasarımı ve threat model tamamlandı; `src/codex/ARCHITECTURE.md`, `src/codex/OPERATIONS.md`.
- [x] Faz 2 temel iskelet: özel testler 4/4 geçti ve type-check exit 0.
- [x] Faz 3 read-only checks, timeout/retry, backup/log safety ve testler.
- [x] Faz 4 fake/Telegram/dedup/daily summary.
- [x] Faz 5 policy, secret scan, runtime checkpoint, admin settings API/UI ve testler.
- [x] Faz 6 docs, uninstalled systemd examples, diff/test report; local implementation tamamlandı.
- [x] İhlal edilemez güvenlik sözleşmesi ve ayrı SECURITY.md eklendi.

## Sonraki tek somut adım

Uygulama main'e alındı. VPS kurulumu, servis etkinleştirme, gerçek Telegram gönderimi veya deployment yapılmadan önce ayrı, kapsamı belli kullanıcı onayı gerekir. Codex agent scheduler ve systemd unit'leri bu değişiklikle etkinleştirilmez.

## Değiştirilen dosyalar

- `src/codex/IMPLEMENTATION_PROMPT.md` — ana uygulama talimatı, güvenlik sınırları ve resume workflow.
- `src/codex/WORK_PROGRESS.md` — bu ilerleme kaydı.
- `src/codex/SECURITY.md` — PR dalındaki güvenlik sözleşmesi incelendi.
- `src/codex/ARCHITECTURE.md`, `src/codex/OPERATIONS.md` — tasarım, threat model ve runtime/rollback sınırları.
- `src/codex/{admin,approvals,codex,config,core,monitoring,notifications,operations,reports,systemd,tests,ui}` — policy/config, adapters, safe checks, tests, admin UI, example service units.
- `src/codex/plugin.ts`, `pluginMetadata.ts`, `UNINSTALL.md` — Eklentiler registration, optional-module removal guide.
- Main app integration: `src/App.tsx`, `src/components/Sidebar.tsx`, `src/lib/permissions.ts`, `src/server/routes/system.ts`.
- Faz 0 kaynaklar: package/TS/Vitest, Compose, health route, Nginx, DR backup/systemd, `vps-update.sh`, `sec-all.sh`, DR audit.
- `src/codex/SECURITY.md` — zorunlu güvenlik sınırları, onay kapıları ve olay durdurma kuralları.

## Güvenlik güncellemesi

- Varsayılan fail-closed, en az ayrıcalık, dış hedeflere zarar verebilecek işlemlerin yasaklanması, prompt injection savunması, açık onay kapıları, gizlilik/veri minimizasyonu, kaynak/maliyet sınırları ve acil durdurma kuralları eklendi.
- Bu kurallar prompt tek başına mutlak güvenlik garantisi vermez; teknik izin ve ağ izolasyonu da gerektirir.

## Test kanıtları

- `npm.cmd exec -- vitest run --config src/codex/vitest.config.ts` — Eklentiler/master-switch sonrası son koşu: 6 dosya, 24 test geçti.
- Katalog/ayrıntı UI değişikliğinden sonra aynı Codex suite tekrar çalıştırıldı: 6 dosya, 24 test geçti.
- Katalog/ayrıntı UI değişikliğinden sonra `npm.cmd run type-check` (exit 0), `npm.cmd exec -- eslint src/codex/ui/CodexControlPanel.tsx` (exit 0), `npm.cmd run build:client` (exit 0) ve `git diff --check` çalıştırıldı.
- `npm.cmd test` — 85 dosya geçti, 2 atlandı; 691 test geçti, 26 atlandı; exit 0, 272.47 sn.
- `npm.cmd run lint` — exit 0.
- `npm.cmd run test:ci` — exit 1 at `test:smoke`; missing local Docker secret file `/run/secrets/encryption_key`. Earlier chain steps succeeded; e2e step was not reached in this script.
- `npm.cmd run test:e2e` — 1 dosya / 15 test geçti.
- `npm.cmd run test:smoke` (cleanup fix sonrası) — yine beklenen secret-file sebebiyle health timeout/exit 1; reserved test fixture temizliği doğrulandı.
- Smoke cleanup hardening: `node --check scripts/smoke-test.mjs` — exit 0; leftover reserved fixture removed, other local DB collections preserved.
- `npm.cmd run type-check` — son koşu exit 0.
- `npm.cmd exec -- eslint src/codex src/App.tsx src/components/Sidebar.tsx src/lib/permissions.ts src/server/routes/system.ts` — son koşu exit 0.
- `npm.cmd run build:client` — Eklentiler değişiklikleri sonrası exit 0; Zod pure annotation, boş vendor-react chunk ve 2 MB üstü bundle uyarıları.
- `npm.cmd run build:server` — Eklentiler admin router ayrımı sonrası exit 0.
- `npm.cmd exec -- eslint src/codex src/App.tsx src/components/Sidebar.tsx src/lib/permissions.ts src/server/routes/system.ts scripts/smoke-test.mjs` — exit 0; smoke script ESLint yapılandırmasında ignore edildi uyarısı verdi.
- `git diff --check` — geçti.
- PR #29 için GitHub Actions Node 20/22 lint, type-check, test, smoke, build ve güvenlik entegrasyon kontrolleri geçti. Codex'e özel suite daha önce yerel olarak 6 dosya/24 test geçti; main branch CI bu birleştirmeden sonra yeniden çalıştırılmadı.
- VPS, gerçek Telegram, systemd parse/install ve üretim ortamı test edilmedi.

## Açık riskler / onay bekleyenler

- Üretim VPS'si salt okunur olarak dahi incelenmedi.
- Codex CLI sürümü, kimlik doğrulama, systemd entegrasyonu ve Telegram secret yöntemi doğrulanmadı.
- PR #27, PR #28 ve PR #29 main'e birleştirildi; tamamlanan uzak PR dalları silindi.
- Admin panel ayarları agent çalıştırmıyor. Modül default-off; canlıya bağlamak için paketleme, admin config bridge, dosya izinleri ve VPS aşaması ayrıca onaylanmalı.
- Docker status checker için gerçek daemon reader yok/kapalı. Backup checker mevcut secret kapsayan manifest biçimini `unsupported` sayar; restore edilebilirlik doğrulamaz.
- systemd örnekleri Windows'ta systemd ile doğrulanmadı; ExecStart hedefi paketlenmiş değil.
- Yeni Codex yönetim modülü için sürüm `1.50.0` bu birleştirme kapsamında `package.json`, `package-lock.json`, `src/config/version.ts` ve `CHANGELOG.md` içinde eşitlendi.
- Herhangi bir VPS kurulumu, servis etkinleştirme, gerçek Telegram mesajı veya deployment için ayrıca açık kullanıcı onayı gerekir.

## Oturum devir notu

Yeni oturum başladığında gerçek `git status`, aktif dal, son commit ve diff ile bu dosyadaki durumu karşılaştır. Uyuşmazlık varsa önce güvenli biçimde uzlaştır; hiçbir dosyayı resetleme veya üzerine yazma. Sonraki adım alanını her anlamlı ilerlemeden sonra güncelle.
