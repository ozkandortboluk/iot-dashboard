# NexusNode IoT — Yapılacak işler

[Kurallar](kurallar.md) · [Tamamlanan işlemler](tamamlanan_islemler.md) · [Ortak notlar ve denetim geçmişi](notlar.md)

## Kullanıcı istekleri

İsteklerini bu alana serbest metin olarak ekleyebilirsin. AI Studio uygular; Codex ilgili konu grubunda `USR-*` kodlu kontrol maddesi açar ve üç kutulu kurala göre denetler.

- **USR-01 — Kullanıcı isteği:** Firmware sayfasında karo veya tek satır gösterim modu olsun. **Kontrol maddesi:** Arayüz, performans ve ürün geliştirme grubunda.

- **USR-02 — Kullanıcı isteği (kalan açık kapsam):** AI Studio/VPS ayrımının gerçek deployment matrisi, VPS DB hedef izolasyonu ve kalan auth/WS/DB hata senaryolarını doğrula. 401/session temel akışı tamamlandı ve tamamlanan işlemlere taşındı. **Kanonik kontrol:** `RUN-04`.

- **USR-03 — Kullanıcı isteği:** VPS'de görülen `Migration Drift Warning` uyarılarının kodsal kök nedenini kalıcı olarak düzelt; uygulanmış migration geçmişini güvenilir hale getir ve migration dışı otomatik şema değişikliklerinin drift üretmesini engelle. **Kanonik kontrol:** `DB-01`.

<!-- Yeni isteklerini bu satırın altına yazabilirsin. Kod vermen gerekmez; Codex uygun konu grubunda sıradaki USR kodunu oluşturur. -->

## 1. Güvenlik — erişim, SSH, sırlar ve müşteri izolasyonu

- ☑ ☐ ☑ **SEC-01 | P0 | SSH yönetiminde kimlik doğrulama atlamasını kapat** — Doğrulanmış kod bulgusu.
  - **Yapılacak:** DB’den bağımsız, yerel olarak doğrulanan setup/recovery anahtarı veya geçerli yönetici oturumu iste. DB kesintisi yetki vermesin. Tünel kapalı politikasını status dışındaki bütün işlemlerde uygula; hedef/port doğrulama, hız sınırı ve audit ekle. Public preview için de doğrulama zorunlu.
  - **Kabul:** DB up/down × setup açık/kilitli × production/development/AI_STUDIO matrisinde anonim ve müşteri istekleri 401/403; yetkili recovery ile bağlantı kurulabilmeli. Her iki route prefix’i test edilmeli.
  - **Sonraki işlem:** Number.isInteger ve tüm port sınırları; remote DB hostname/IP ve izinli profil doğrulaması ekle. Tünel probe/test/connect/disconnect iki prefix’inde anonim/customer/admin/recovery × DB up/down × setup açık/kilitli testlerini gerçek router ile çalıştır. Geçerli development SSH bağlantısı korunmalı.

- ☑ ☐ ☑ **SEC-03 | P0 | Geliştirme bağlantısının canlı DB’ye test yöneticisi eklemesini engelle** — Doğrulanmış kod bulgusu.
  - **Yapılacak:** Test fixture’larını uygulama migration/seed yolundan çıkar. Test için ayrı DB ve ayrı sınırlı rol kullan; hedef ortamını sunucu tarafında doğrula. Production hedefinde flag ile dahi test seeding yasak olsun. Önceden oluşmuş kayıtları gerçek hesaplarla karıştırmadan denetle.
  - **Kabul:** Development uygulama → production olarak işaretlenmiş boş/upgrade DB testinde hiçbir test yönetici/cihaz oluşmamalı; production + ENABLE_TEST_ACCOUNT=true da reddedilmeli. Gerçek kullanıcılar silinmemeli.
  - **Sonraki işlem:** Bütün runtime fixture/admin auto-provision yollarını çıkar veya doğrulanmış izole test DB/role’a taşı; VITEST='false' truthy olmamalı. Test-runner→production hedefi ve production/development+flag kombinasyonları gerçek DB negatif testiyle reddedilmeli; mevcut gerçek hesaplar korunmalı.

- ☑ ☐ ☐ **SEC-04 | P0 | WebSocket varsayılan yayınından müşteri verisi sızmasını engelle** — Doğrulanmış kod bulgusu.
  - **Yapılacak:** Olay bazlı açık izin listesi ve payload şeması kullan; tanımsız olayları reddet. Kuyruk, gönderim, firmware ve yeni eklenen bütün olayları tenant/rol kapsamına göre filtrele.
  - **Kabul:** İki ayrı müşteri WebSocket’i açıkken A’ya ait kuyruk/dispatch/firmware olayını tetikle; B’ye hassas payload gitmemeli. Tanımsız olay testi ekle.
  - **Sonraki işlem:** İki gerçek tenant socket’iyle kuyruk/dispatch/firmware ve tanımsız event negatif E2E; REST görünürlüğü ile yayın kapsamı karşılaştırması ve yeni event şema/whitelist testi ekle. Mock socket sonucu gerçek WS saha sonucu olarak sunulmasın.

- ☑ ☐ ☐ **SEC-05 | P0 | Parola sıfırlamayı tek kullanımlı ve atomik yap** — Doğrulanmış kod bulgusu.
  - **Yapılacak:** Tek DB transaction içinde koşullu token tüketimi/row lock, parola güncelleme ve oturum iptali uygula. Production DB hatasında bellek fallback yapma. Bildirim gönderimini commit sonrasına al.
  - **Kabul:** Aynı tokenla paralel iki istekten yalnız biri başarılı; DB hata enjeksiyonunda atomik rollback; restart sonrası token durumu aynı; kullanılan/süresi biten token reddedilir.
  - **Sonraki işlem:** İzole gerçek PG’de paralel iki isteğin yalnız biri başarılı olmalı; token/password/session atomikliği ve process restart testi ekle. SEC-06 logout/session revocation kabulü de tamamlanmalı.

- ☑ ☐ ☑ **SEC-06 | P0 | Oturum iptali ve rol değişiminde açık WebSocket yetkisini kaldır** — Doğrulanmış kod bulgusu.
  - **Yapılacak:** Kullanıcı/socket indeksini tut; revoke/role/suspend olayında ilgili socket’leri kapat ve periyodik süre/oturum doğrulaması ekle. DB iptal hatasını başarılı gösterme.
  - **Kabul:** Açık admin ve müşteri socket’leriyle logout/reset/suspend/role downgrade testi; iptalden sonra veri/komut erişimi yok; geçerli diğer kullanıcı etkilenmez.
  - **Sonraki işlem:** Logout’u async yap, authoritative silme sonucunu await et ve hatayı açık yakala; token/DB hata durumunda 'sunucuda sonlandırıldı' sahte başarısı verme. Gerçek açık WS’yle logout/reset/suspend/role downgrade/other-session expiry; PG delete hata enjeksiyonunda process yaşamı ve eski oturum erişimi testlerini çalıştır.

- ☑ ☐ ☐ **SEC-07 | P1 | DB parolasını tarayıcı kalıcı depolamasından kaldır** — Doğrulanmış kod bulgusu.
  - **Yapılacak:** Yalnız maskelenmiş host/port/database sakla; parolayı sunucudaki Vault’a gönder. Eski localStorage anahtarını temizleyen geçiş ekle; API’nin secret içermeyen yanıtını kullan.
  - **Kabul:** URL girme/kaydetme/test/çıkış/yenileme sonrası localStorage, sessionStorage ve istemci loglarında parola bulunmamalı.
  - **Sonraki işlem:** Browser regression’da localStorage/sessionStorage/client logs ve maskelenmiş API config yanıtını kontrol et; legacy profil geçişini de test et.

- ☑ ☐ ☑ **SEC-08 | P1 | Uzak PostgreSQL TLS doğrulamasını varsayılan güvenli yap** — Doğrulanmış kod bulgusu.
  - **Yapılacak:** Doğrudan uzak bağlantıda CA/hostname doğrulamasını zorunlu kıl; TLS’siz Docker iç bağlantı ve doğrulanmış SSH loopback profilini ayrı tanımla. Sessiz insecure fallback yapma.
  - **Kabul:** Geçerli CA kabul; yanlış CA/hostname reddi; Docker iç ağı ve doğrulanmış SSH akışı çalışır.
  - **Sonraki işlem:** Setup Pool dahil bütün çağıranlar aynı etkili profile/TLS policy’yi kullansın; dış remote için sslMode disable kısa devresi kaldırılmalı. Gerçek PG CA/hostname negatif matrisi, encrypted negotiation ve Docker/SSH profile pozitif testleri ekle; helper unit çıktısını gerçek TLS handshake sonucu sayma.

- ☑ ☐ ☑ **SEC-09 | P1 | Yetkiyi sabit kullanıcı kimliğinden değil rolden türet** — Doğrulanmış kod bulgusu.
  - **Yapılacak:** Tek yetkilendirme fonksiyonu kullan; rol, aktif hesap ve aktif tenant üyeliğini denetle. Kimlik sabitlerini yalnız veri geçiş eşlemesi için kullan.
  - **Kabul:** Aynı ID admin/customer/askıya alınmış rollerinde test edilmeli; rol düşürülünce ayrıcalık kalmamalı.
  - **Sonraki işlem:** isAdminUser ve tüm admin kestirmelerinde aktif hesap sözleşmesini tek predicate ile uygula; user.status='inactive' için list/simulator/REST/WS ret. Üyelik ve account state matrix’ini aynı ID’de admin/customer/suspended/inactive/deleted için çalıştır; geçerli aktif admin davranışı korunmalı.

- ☑ ☐ ☑ **SEC-11 | P1 | CI smoke testindeki sabit cihaz API anahtarını kaldır** — **Yeniden uygulandı (Header handshake + DB Fixture).**
  - **Kabul:** Temiz CI ortamında smoke test deterministik çalışır; kaynak kodda sabit cihaz API key bulunmaz; header handshake kullanılır.
  - **Sonraki işlem:** Test hedef kimliği ve sınırlı rolü zorunlu doğrula; live/production hedefini fixture yazmadan reddet. PostgreSQL smoke profilinde PG hata→fail, JSON fallback yalnız ayrı açık standalone profilinde. Job’a özel fixture ID ve sahiplikli cleanup kullan; gerçek header WS ve negatif query testini SHA’ya bağlı raporla.

- ☑ ☐ ☑ **SEC-12 | P1 | Production DB parolası eksikse güvenlik kapısını fail-closed yap** — **Uygulandı (Fail-Closed DB Credential Gate).**
  - **Kabul:** missing/empty DB password → startup policy error; valid secret → geçer; parola loglanmaz.
  - **Sonraki işlem:** Statik node:fs import kullan; validator ve runtime connection resolver aynı etkili credential sonucunu paylaşsın. Env/URL/structured/Vault/db_password mount-only ve ESM/CJS matrisi, valid bootstrap ve missing/empty/default ret testleriyle doğrula; kullanıcı parolasını loglama.

- ☐ ☐ ☐ **SEC-13 | P0 | Production secret policy negatif test kapısını tamamla** — Codex tam ret; yeniden yapılacak.
  - **Kabul:** insecure/missing → non-zero; secure random → geçer; eski bypass env'leri hiçbir kontrolü gevşetmez; secret değerleri loglanmaz.
  - **Sonraki işlem:** Production sınıflandırmasını provider metadata ile gevşetme. Preview izni açık ayrı profil ve kalıcı anahtar kaynağı gerektirsin. Validator/crypto resolver tek ortak effective-key sonucu/kaynak sırası kullansın; ESM statik fs import. CloudRun production, weak mounted+higher/lower priority sources, restart/decrypt ve non-zero startup negatiflerini CI gate yap. İlk kutu yeniden uygulanınca işaretlenebilir.

## 2. Uygulamanın çalışması — kurulum, bağlantı ve dağıtım

- ☑ ☐ ☑ **RUN-01 | P1 | Production CI başlangıcına gerekli Vault anahtarını sağla** — **Uygulandı (Dinamik Vault Key & Test Pipeline).**
  - **Kabul:** Node 20/22 smoke+E2E geçer; kaynakta sabit encryption key kalmaz; anahtar job başına değişir; gerçek secret loglanmaz.
  - **Sonraki işlem:** Önce require importlarını ESM uyumlu düzelt ve SEC-13 yeni negatiflerini koru. Node 20/22 aynı kod SHA’sında lint/type/unit/build/smoke/E2E zinciri yeşil olsun. DB_CONNECTING/SETUP smoke başarısı ayrı bootstrap sonucu; ready lifecycle ve authenticated cihaz testini başarılı geçilmiş sayma. Connection error olmasını HTTP401 yerine yeterli kabul etme.

- ☑ ☐ ☑ **RUN-02 | P1 | Kurulum rehberini güvenli ve çalışır Compose ile eşitle** — **Uygulandı (Canonical Compose Sync).**
  - **Kabul:** Arayüzden kopyalanan kurulum asıl Compose ile birebir eşleşir; dış ağa varsayılan olarak DB portu açılmaz.
  - **Sonraki işlem:** Tek kaynaklı template veya semantic parity gate; özel karakterli parolayı uygun encode/quote et. Yeni anahtar yalnız ilk kurulumda güvenli oluşturulup kalıcı tutulmalı; mevcut Vault anahtarı değiştirilmemeli. Secret dosyası/env bootstrap, UID izinleri ve tek TLS deployment seçeneği ile UI kopyasından temiz kurulum/login/restart kabulünü çalıştır.

- ☑ ☐ ☑ **RUN-03 | P1 | Nginx dağıtım modelini ve healthcheck sözleşmesini düzelt** — **Uygulandı (Fail-Closed Probe & Ready Probe).**
  - **Kabul:** Proxy probe hatasında exit non-zero; app readiness probe veritabanı hazır durumunu doğrular.
  - **Sonraki işlem:** Tek gerçek HTTPS/WSS modelini kur ve container/host proxy çakışmasını çöz; hazır olmayan DB için trafik readiness gate’i ayrı olsun, recovery liveness korunmalı. Trust proxy bilinen proxy/subnet ile sınırlı ve dokümanla aynı. Sertifika, secure-cookie/X-Forwarded-Proto, WSS upgrade ve DB up/down/probe hata integration testini çalıştır.

- ☑ ☐ ☑ **RUN-04 | P1 | Kalan ortam/DB/oturum izolasyonunu gerçek deployment üzerinde doğrula** — **USR-02 kısmen tamamlandı; roadmap yalnız açık kapsamı içerir.**
  - **Kalan yapılacak:** AI Studio ve VPS gerçek deployment’larında merkezi runtime sınıflandırmasının doğru ortamı seçtiğini doğrula. VPS’de SSH servisi/tünel durumu ne olursa olsun etkili PostgreSQL hedefinin production resolver sonucu olduğunu ve `127.0.0.1:5432` yönlendirmesine düşmediğini gerçek çalışan container/config ile kanıtla.
  - **Kalan yapılacak:** Auth/DB hata matrisini gerçek akışta tamamla: yanlış PG parolası, migration/schema failure, setup eksik ve DB kesintisinde UI/API state’leri doğru ayrışmalı; local/demo fallback production veya remote-PG profilinde başarılı veri kaynağı gibi görünmemeli.
  - **Kalan yapılacak:** Mevcut supertest/Node WS testlerinin ötesinde gerçek browser/deployment doğrulaması ekle. Cookie elle request’e enjekte edilmeden login sonrası oturum korunmalı; gerçek browser WebSocket bağlantısı aynı HttpOnly session ile açılmalı. AI Studio embedded preview ile doğrudan preview URL topolojisi farklıysa ikisini ayrı doğrula.
  - **Kalan kabul:** (1) Gerçek VPS runtime’da environment=vps ve DB hedefi production PostgreSQL; aktif/stale SSH state bunu loopback’e çevirmiyor. (2) Gerçek AI Studio runtime’da environment=aistudio ve SSH açıkken DB transport yalnız tunnel localPort’a yönleniyor. (3) PG parola/migration/schema/setup/DB-down senaryoları doğru readiness/auth/UI durumunu üretiyor. (4) Gerçek browser login → korumalı REST → state-changing istek → WebSocket zinciri cookie elle taşınmadan başarılı. (5) `npm run type-check`, `npm run lint`, `npm run test`, `npm run build` ve ilgili deployment/E2E kanıtları aynı SHA için başarılı.
  - **Codex yeniden denetimi:** Yalnız yukarıdaki açık kapsam kontrol edilir; merkezi APP_ENV helper, `apiFetch credentials: include`, login sonrası `/api/auth/me`, temel cookie/CSRF unit-integration testleri ve kullanıcının doğruladığı AI Studio 401 düzeltmesi tekrar açık iş olarak yazılmaz. Regresyon görülürse ilgili alt kapsam yeniden açılır.

- ☑ ☐ ☐ **RUN-05 | P1 | Yakalanmamış hatalarda belirlenmiş kapanış politikasını uygula** — **Yeniden uygulandı (Sistemsel Graceful Shutdown Zinciri).**
  - **Kabul:** HTTP, WS, workers ve PG pool aynı graceful shutdown zincirinde kapatılır; kapanış sırasında yeni istekler 503 alır; uncaughtException non-zero exit üretir.
  - **Sonraki işlem:** Gerçek server subprocess’inde açık HTTP/WS/PG client ile SIGTERM, uncaughtException ve unhandledRejection;503, deadline, worker/tunnel kapanışı, non-zero crash exit ve restart testi çalıştır. Smoke shutdownPromise sonucunu incelemeli; forced SIGKILL veya hatalı exit’i clean success yazmamalı.

- ☑ ☐ ☑ **RUN-06 | P1 | Secrets mount bootstrap ve izinlerini doğrula** — **AI Studio uyguladı.**
  - **Kabul:** Üretim ortamında `data/.vault_key` üretimi engellenir; dedicated secrets mount ve env zorunlu kılınır.
  - **Sonraki işlem:** CloudRun production’da da random replacement yasak olsun; tek etkili key kaynağını koru. node UID için izin bootstrap komutlarını belgeye koy; valid/missing/unreadable mount, container recreate/restart ve mevcut ciphertext decrypt’i gerçek Docker’da doğrula. İlk kurulum key oluşturmayı mevcut encrypted data key migration’dan ayır.

## 3. Veritabanı — şema, migration ve bütünlük

- ☑ ☐ ☑ **DB-01 | P1 | Migration hata yutma, checksum drift ve şema otoritesi çakışmasını kapat** — **USR-03; üçüncü revizyonda historical allowlist bypass kapatıldı, ancak provenance ve gerçek DB doğrulaması eksik.**
  - **Codex ONAYLANAN alt kapsam:** `fe9ee41a9d758435aea108d4f0a3164f53157379` ile source-integrity ve DB-history iki ayrı katmana ayrıldı. `isMigrationChecksumValid`, önce current source hash'in `canonicalSourceHash` ile eşleşmesini zorunlu tutuyor, sonra DB historical checksum'ı doğruluyor. Historical checksum artık mutated source'u tek başına geçiremiyor. Migration name contract, 022 forward migration ve production migration-dışı inline DDL/auto-heal kaldırımı korunuyor. Mutation regression testi, historical DB checksum geçerli olsa bile mutated source için false bekliyor.
  - **KALAN 1 — historical provenance gerçek değil/kanıtsız:** Manifestte historical kayıtların büyük bölümü `verifiedGitCommitOrTag: ca7b679b12c1ac3f04b602181a86fe7c05945697` değerine topluca bağlanmış. Bu commit migration contract/reconciliation'ın sonradan eklendiği commit; örneğin migration 019 daha önce `548b188...` ile eklenmiş ve `bc950392...` ile sonradan değiştirilmişti. Dolayısıyla historical DB checksum'ın hangi gerçek historical migration source'undan üretildiğini `ca7b679...` yazmak kanıtlamaz. Her historical checksum için gerçekten o source sürümünü içeren commit/tag bulunmalı; o committeki migration dosyasından aynı algoritmayla sourceArtifactHash yeniden üretilebilmeli. Doğrulanamayan checksum “verified” işaretlenmemeli; saha gözlemi ayrı `observed` statüsünde tutulmalı veya açık reconciliation prosedürü uygulanmalı.
  - **KALAN 2 — provenance otomatik doğrulanmalı:** Manifestte commit/hash stringlerinin bulunması yeterli değildir. CI script/test ilgili Git blob/commit kaynağından artifact hash'i yeniden hesaplayıp manifestteki `sourceArtifactHash` ile karşılaştırmalı; yanlış commit, yanlış source hash veya var olmayan provenance fail etmelidir. Runtime'ın Git erişimine bağımlı olması gerekmez; bu kontrol CI/release gate olabilir.
  - **KALAN 3 — gerçek PostgreSQL/Timescale testleri hâlâ yok:** `src/tests/migration_runner_and_schema_drift.test.ts` concurrency testinde `vi.fn` mock client kullanıyor; Timescale hypertable failure testi de mock query kullanıyor. Bu testler unit regression için yararlı ve korunmalı, fakat roadmap kabulündeki “iki gerçek connection/process advisory-lock”, gerçek Timescale failure ve gerçek upgrade kanıtının yerine geçmez.
  - **KALAN 4 — gerçek clean/upgrade/drift CLI/readiness matrisi:** Docker/CI üzerinde gerçek Timescale/PostgreSQL instance ile (a) boş DB 001→son migration, (b) saha-benzeri 001–021 historical `schema_migrations` + şema → 022/son sürüm upgrade, (c) iki ayrı process/connection migration yarışı, (d) pending/unknown/name/checksum/source-integrity drift için gerçek `verify:schema` non-zero, (e) migration/drift halinde readiness 503, (f) Timescale zorunlu işlem hatasında migration version'ın başarıyla kaydedilmemesi otomatik test edilmelidir.
  - **KALAN 5 — tsx↔production bundle parity gate'e bağlanmalı:** `test-parity.ts` eklenmiş ve bundle karşılaştırma mantığı içeriyor; ancak `package.json` içinde bunu çalıştıran bir script/CI gate görünmüyor. Geçici `dist/test-mig.mjs` üretimi dahil deterministik bir test scripti oluşturulmalı ve `test:ci`/release gate içinde çalıştırılmalı. Parity mismatch non-zero exit üretmeli; yalnız console mesajı yeterli değildir.
  - **Kabul:** (1) Applied migration mutasyonu historical DB checksum geçerli olsa bile fail-closed — **kod/unit düzeyinde sağlandı**. (2) Historical checksum → gerçek historical Git source provenance zinciri yeniden üretilebilir ve CI tarafından doğrulanır. (3) Eski migration'lar immutable kalır; yeni davranış yalnız forward migration ile gelir. (4) Gerçek PostgreSQL/Timescale clean install + saha-benzeri upgrade + gerçek concurrency + failure + drift CLI/readiness testleri aynı SHA'da geçer. (5) `tsx`↔production bundle parity otomatik CI gate'tir ve mismatch non-zero döner.
- ☑ ☐ ☐ **DB-02 | P1 | Başarılı PostgreSQL hydration boş kümeleri de uygulamalı** — **AI Studio uyguladı.**
  - **Yapılacak:** Başarılı boş sonuç ile sorgu hatasını ayır; başarılı snapshot’ı boş olsa da atomik uygula. Cache kimliğini DB/tenant ile ilişkilendir; eski credential cache’ini temizle.
  - **Kabul:** Önce dolu DB, sonra boş authoritative snapshot ve DB değişimi testinde hayalet kayıt kalmamalı; sorgu hatası boş başarı sayılmamalı.

- ☐ ☐ ☐ **DB-03 | P0 | Migration başarısızken PostgreSQL readiness/READY durumunu true göstermeyi engelle** — **Yeni Codex bulgusu.**
  - **Kabul:** Migration failure/pending/drift → live 200, ready 503; migration+schema doğrulaması tam → ready 200; Docker healthcheck bu sözleşmeyi kullanır.

## 4. Telemetri — kalıcılık, tekrar işleme ve kapasite

- ☐ ☐ ☐ **TEL-01 | P1 | WAL kuyruğa alındı yanıtından önce disk yazımını doğrula** — Doğrulanmış kod bulgusu.
  - **Yapılacak:** Tek sıralı WAL writer ve append/rotation kilidi kullan; kalıcılık sözleşmesine göre await+fsync yap. Disk hatasında başarısız ACK döndür; yeni paketleri flush RAM güncellemesinde kaybetme; replay idempotent olsun.
  - **Kabul:** ENOSPC, append failure, append sırasında rotate, process kill, .processing recovery, duplicate ve out-of-order paket testleri; kabul edilmiş paketlerin hiçbiri kaybolmamalı.

## 5. Yedekleme, geri yükleme ve felaket kurtarma

- ☐ ☐ ☐ **DR-01 | P1 | Production yedek ve restore gerçek PostgreSQL üzerinde çalışmalı** — Doğrulanmış kod bulgusu.
  - **Yapılacak:** Ortak connection resolver ve uygun pg_dump/restore araçlarını kullan; metadata/export ile tam yedeği ayır. Restore bakım/transaction/uyumluluk kontrolleriyle gerçek DB’ye uygulanmalı; dosya yolu backup dizinine sınırlanmalı.
  - **Kabul:** Vault-only config ile üretim benzeri DB dump → boş DB restore → kayıt/tenant/telemetry/komut sayıları ve uygulama açılışı doğrulanmalı; JSON fallback tam yedek başarısı vermemeli.

- ☐ ☐ ☐ **DR-02 | P1 | Firmware, yedek ve imzalama anahtarı kalıcılığını tamamla** — Doğrulanmış kod bulgusu.
  - **Yapılacak:** Firmware ve backup için kalıcı volume/harici hedef tanımla; anahtarı ayrı güvenli secret olarak yönet. Anahtar kurtarma ve firmware metadata/dosya tutarlılığı prosedürü ekle.
  - **Kabul:** Recreate sonrası eski firmware indirilebilir ve doğrulanabilir; yedek geri yüklenebilir; sabit public key kullanan cihaz OTA doğrulamasını sürdürebilir.

## 6. Cihaz, WebSocket, komut ve otomasyon

- ☑ ☐ ☐ **IOT-01 | P1 | Otomasyon komutlarını kalıcı ortak komut servisine geçir** — **AI Studio uyguladı.**
  - **Kabul:** Üretim DB’de otomasyon → kalıcı pending → tek delivery → ACK → final state; commandService hatasında `lastTriggered` değişmez; restart, cihaz devri ve eşzamanlı tekrar tetiklemede yetkisiz veya çift komut oluşmaz.

- ☐ ☐ ☐ **IOT-02 | P1 | WebSocket örnekleri ve smoke istemcisini gerçek auth protokolüne eşitle** — Doğrulanmış kod bulgusu.
  - **Yapılacak:** Cihazda x-api-key/Authorization desteklenen handshake’i, tarayıcıda HttpOnly cookie’yi kullan. Query token kabulünü geri açma. OpenAPI/HelpView/ESP örneğini birlikte güncelle.
  - **Kabul:** Gerçek ESP8266/ESP32 örneği derlenip WSS bağlanmalı; doğru header kabul, query-only token reddi; smoke hem boş setup hem hazır DB dalını çalıştırmalı.

## 7. Alarm, bildirim ve e-posta

- ☐ ☐ ☐ **ALM-01 | P1 | Yanlış çevrimdışı bildirimi için saha zaman çizelgesini doğrula** — Saha doğrulaması gereken risk.
  - **Yapılacak:** Sunucu alma zamanı, son heartbeat/telemetry, effective interval, grace süresi ve incident ID’yi ilişkilendir. Gönderim öncesi güncel incident durumunu kontrol et; bakım/uyku/recovery senaryolarını kaydet.
  - **Kabul:** Sanal saatle jitter/sleep/reboot/geç paket testleri ve gerçek cihaz soak kaydı: tek offline + tek recovery; çevrimiçi olaydan sonra eski offline gönderilmez.

- ☑ ☐ ☐ **ALM-02 | P2 | Resend ve bildirim tesliminde zaman aşımı/tekrar politikasını tamamla** — **Düzeltme Uygulandı.**
  - **Kabul:** Timeout/429/5xx/başarı testleri; aynı bildirim için tekrar mail fırtınası yok; başarısız teslim görünür; reset bağlantısı doğru HTTPS domaine gider.

## 8. Firmware, derleme ve OTA

- ☐ ☐ ☐ **OTA-01 | P1 | Sentetik firmware’i gerçek derleme ve OTA yayınından çıkar** — Doğrulanmış kod bulgusu.
  - **Yapılacak:** Gerçek izole Arduino CLI/PlatformIO derlemesi gelene kadar build/publish işlevini açıkça kullanılamaz yap; sentetik çıktıları test fixture’ına sınırla. İmza, çalışabilirlik kanıtı değildir.
  - **Kabul:** Geçersiz C++ reddedilir; gerçek hedef board için derleme kanıtı ve donanım boot/telemetry/rollback testi olmadan OTA registry’ye aktif yayın yok.

## 9. CI, test kanıtı, sürüm ve dokümantasyon

- ☐ ☐ ☐ **QA-01 | P1 | CI kanıtını gerçek production akışına genişlet** — Doğrulanmış kod bulgusu.
  - **Yapılacak:** Birim, gerçek PostgreSQL entegrasyon, production bundle, Docker/proxy ve saha testlerini ayrı raporla. CI Timescale 2.14.2-pg16 ile Compose 2.30.1-pg16 sürümünü uyumlu test politikasına getir; verify:schema, güvenlik/secret taraması ve upgrade gate ekle.
  - **Kabul:** Her kanıt tam SHA/ortam/komut/sonuç taşımalı; smoke ve güvenlik E2E dahil başarılı run; gerçek DB testinde local fallback yasak.

- ☐ ☐ ☐ **QA-02 | P2 | Kaynak tekrarlarını ve paket kurulum farkını azalt** — Doğrulanmış kod bulgusu.
  - **Yapılacak:** Aktif kaynak yolunu belirt; kullanılmayan kopyaları kontrollü temizle veya üretim kaynağına bağla. CI/Docker aynı kilitli kurulum politikasını kullansın. API ve schema doğrulamasını tek otoriteden üret.
  - **Kabul:** Temiz checkout + CI + Docker aynı bağımlılık ağacı; örnek endpoint/protokol sözleşme testi; tek aktif SSH uygulaması.

- ☑ ☐ ☑ **QA-04 | P1 | Son CI kırılmalarını gider ve release gate'i gerçekten yeşil yap** — **Yeni Codex bulgusu.**
  - **Kabul:** Node 20/22 npm ci → type-check → lint → unit/integration → build → smoke → E2E tamamı başarılı; readiness negatif testleri geçer; high vulnerability çözülür veya gerekçeli istisna kaydedilir.

- ☐ ☐ ☐ **QA-03 | P3 | Her doğrudan push için otomatik denetim kapsamını tamamla** — Platform kapsam sınırı.
  - **Yapılacak:** AI Studio değişikliklerini PR üzerinden gönder. Doğrudan push şartsa desteklenen push tetikleyicisi/ayrı entegrasyon seçilince ayrıca kur; kullanıcı istemeden periyodik polling ile ikame etme.
  - **Kabul:** PR’ye yeni commit olayında doğru SHA denetlenip yalnız roadmap güncellenir; kendi doküman commit’i sonsuz döngü oluşturmaz.

## 10. Arayüz, performans ve ürün geliştirme

- ☑ ☐ ☐ **USR-01 | P2 | Firmware sayfasında karo ve tek satır görünümünü denetle** — **AI Studio uyguladı.**
  - **Kullanıcı isteği:** Firmware listesi için karo ve tek satır gösterim modu.
  - **Uygulandı:** `src/components/FirmwareView.tsx` bileşeninde `viewMode` state'i (`'grid' | 'list'`), `localStorage` kalıcılığı (`firmware_view_mode`), `LayoutGrid`/`List` ikonlu görünüm modu anahtarı, karo (grid) ve responsive tek satır (table/list) görünüm dalları eksiksiz uygulandı. Her iki modda da aynı filtreleme/arama kuralları, SHA-256 kopyalama, indirme ve OTA dağıtım butonları çalışır durumdadır. `src/tests/firmware_view_modes.test.ts` testleri başarıyla geçmektedir.
  - **Kabul:** İki görünüm arasında geçiş çalışır; aynı filtre/sıralama altında aynı kayıtlar gösterilir; boş liste ve dar ekran davranışı düzgündür; mevcut firmware işlemleri ve erişim izinleri bozulmaz. Codex değişen kodu ve ilgili arayüz/test kanıtını denetler.


- ☐ ☐ ☐ **UX-01 | P2 | Büyük ekranları böl ve durum/erişilebilirlik standardı uygula** — Ölçüm ve iyileştirme görevi.
  - **Yapılacak:** Ekran bazlı lazy-load, liste sanallaştırma, abonelik seçicileri ve ölçümlü render optimizasyonu yap; erişilebilir odak/klavye/touch hedefleri ve net loading/error/empty durumları kullan.
  - **Kabul:** Önce/sonra bundle ve mobil ölçüm; tenant değişimi/logout sonrası eski veri görünmez; klavye/ekran okuyucu kritik akışı tamamlar.

## Stratejik geliştirmeler — güvenlik ve çalışma kapılarından sonra

- ☐ ☐ ☐ STR-01 Command Center — IOT grubunun kalıcı komut yaşam döngüsü üzerine.

- ☐ ☐ ☐ STR-02 Device Health Center 2.0 — saha health timeline ve bakım/replacement.

- ☐ ☐ ☐ STR-03 Alarm Management Center — ALM yaşam döngüsü, suppression ve teslim kanıtı.

- ☐ ☐ ☐ STR-04 OTA Deployment Manager — gerçek firmware, staged rollout ve rollback.

- ☐ ☐ ☐ STR-05 Device Credential Center — rotasyon, revoke ve en az yetki.

- ☐ ☐ ☐ STR-06 Audit & Security Center — tenant kapsamı ve değiştirilemez iz.

- ☐ ☐ ☐ STR-07 Telemetry Explorer — sorgu/aggregation/veri kalitesi.

- ☐ ☐ ☐ STR-08 Sites / Groups / Locations — tenant kontrollü hiyerarşi.

- ☐ ☐ ☐ STR-09 Dashboard Templates — müşteri verisi taşımayan şablonlar.

- ☐ ☐ ☐ STR-10 System Observability Center — error/request/device/tenant correlation.

- ☐ ☐ ☐ STR-11 Backup & Disaster Recovery Center — doğrulanmış restore kanıtı.

- ☐ ☐ ☐ STR-12 Reporting & Integration Center — scoped entegrasyonlar ve kotalar.
