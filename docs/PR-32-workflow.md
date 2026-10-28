# PR #32 — İnceleme İş Akışı ve Biriken Kontrol Listesi

> Bu dosya PR #32 kapsamında inceleme ve doğrulama takibi içindir. Yeni bulgular aşağıya eklenir; tamamlanmayan maddeler silinmez veya yeniden yazılarak kaybedilmez. Bir madde yalnızca kanıtla doğrulandıktan sonra işaretlenir.
>
> Kural: GitHub Actions/testleri elle başlatma. Yerel Windows/Antigravity veya kullanıcı tarafından onaylanan izole test ortamında çalıştır. Üretime dağıtım, merge, canlı DB yazımı/migration/silme/restore yok.

## İnceleme 2026-10-28

### PR #32 — Bash xtrace ve sır koruması
- [ ] Yerel ortamda `src/tests/security/secret_recovery_trace.test.ts` çalıştır.
- [ ] Statik kaynak metni kontrolüyle yetinme: sahte/test parolasıyla izole bir Bash fixture'ını `bash -x` altında çalıştır ve stderr/trace çıktısında parolanın bulunmadığını doğrula.
- [ ] Secret kurtarma fonksiyonu xtrace'i kapattıktan sonra çağıran betiğin ilerleyen kısmında xtrace'in tekrar açılmadığını veya hassas değerler yazılmadan önce korumanın yeniden uygulandığını doğrula.
- [ ] İlgili test, lint, type-check ve build sonuçlarını gerçek komut çıktılarıyla kaydet; sonuçlar yokken başarılı işaretleme.

### Önceki incelemelerden açık bulgular
- [ ] **P1 / PR #28:** Tarihsel commit'teki kimlik bilgisi benzeri değerin gerçek/aktif olup olmadığını güvenli yoldan doğrula; gerçekse kimlik bilgisini yenile ve erişilebilir Git ref'lerini secret taramasından geçir. Geçmişi yeniden yazma veya ref silme için ayrı açık onay al.
- [ ] **P2 / PR #30:** `vps-agent/core/lock.ts` için stale-lock kurtarma veya açık operatör kurtarma yolu tasarla. Canlı kilit korunmalı; ölü PID, eşzamanlı kurtarma ve süreç çökmesi testleri eklenmeli.
- [ ] **P1 / PR #31:** Veritabanı parola akışında PostgreSQL rolü, Vault, runtime yapılandırması ve bağlantı havuzunun hata yollarında tutarlı kaldığını izole testlerle doğrula. PR açıklamasına göre rolü değiştiren `ALTER ROLE` otomasyonu kapsam dışına çıkarılmış; güncel diff ve testler bunu doğrulamalı.
- [ ] **P1 / PR #31:** Genel ayarlardan host/port/veritabanı hedefi değiştirme girişiminin reddedildiğini ve başarısız aday bağlantının aktif hedefi/Vault'u değiştirmediğini doğrula.
- [ ] **P2 / PR #31:** Uygulama konteynerinin host secret dosyasını sessizce yazmaya çalışmadığını ve hata durumunda yanlış başarı bildirmediğini diff üzerinde doğrula.
- [ ] **P2 / CI politikası:** `.github/workflows/ci.yml` push ve pull_request olaylarında otomatik çalışacak şekilde yapılandırılmış. GitHub'da test çalıştırmama tercihiyle uyum için bu davranışın sahibiyle kontrollü karar ver; workflow tetikleyicilerini sessizce değiştirme.

### Önceki bulgular — kodda mevcut görünüyor, test kanıtı ayrıca gerekli
- [ ] WebSocket bootstrap ve canlı ayar yayınında `service_config` redaksiyonunu yerel regresyon testiyle doğrula.
- [ ] `.env` bulunmadığında yedek manifest/doğrulamasını; dosya varsa manifestte yer aldığını izole testle doğrula.
- [ ] Kalıcı bildirim kuyruğunda iki worker claim yarışı, lease süresi dolması, yeniden başlatma ve idempotency davranışını izole PostgreSQL testlerinde doğrula.

## 2026-10-28 inceleme notu
- PR #32 açık/taslak; bu incelemede PR merge edilmedi ve GitHub Actions manuel çalıştırılmadı.
- PR #32 head commit'i için erişilebilen workflow run veya combined status bulunamadı. Bu, testlerin geçtiği anlamına gelmez.
- Yerel checkout/test çalıştırma olanağı bu oturumda yok; test, lint, type-check ve build sonuçları doğrulanmadı.
- Yeni gözlem: `src/tests/security/secret_recovery_trace.test.ts` mevcut haliyle kaynak metninde `set +x` bulunduğunu denetliyor; gerçek Bash xtrace çıktısında sahte sırrın sızmadığını çalıştırarak kanıtlamıyor. Yukarıdaki runtime regresyon maddesi bu nedenle açık bırakıldı.


## Güncel PR #31 diff doğrulaması — 2026-10-28 (ek kayıt)
- [ ] **P1 / PR #31 — gerçek parola rotasyonu hâlâ ALTER ROLE çalıştırıyor:** Güncel dal dosyası `src/server/routes/system.ts` içindeki `/rotate-password` akışında `ALTER ROLE` ve eski parola ile kurtarma denemesi hâlâ mevcut. PR açıklamasında rol değiştirme otomasyonunun kapsam dışı olduğu yazmasına rağmen diff bunu doğrulamıyor. Güvenli geri alma ve tüm hata yollarında Vault/runtime/pool tutarlılığı kanıtlanmadan birleştirme.
- [ ] **P1 / PR #31 — hedef geçiş endpoint'i hâlâ var:** `/switch-target` host/port/database hedefi kabul ediyor ve tablo/rol izin kontrollerinden sonra Vault/runtime/db URL'sini değiştirip pool'u yeniliyor. Aynı isimli tablolar hedefin doğru veri kaynağı olduğunu kanıtlamaz. Genel ayarlardan hedef değiştirmeyi kapatma iddiası, bu endpoint'in ve arayüz erişiminin gerçekten kaldırıldığı/engellendiği güncel diff ile doğrulanmalı.
- [ ] **P2 / PR #31 — host secret dosyasına yazma denemesi hâlâ mevcut:** `/rotate-password` `/opt/nexusnode-iot/secrets/postgres_password` ve çalışma dizinindeki `secrets/postgres_password` yollarını yazmayı deniyor; hatalar sessizce yutuluyor. Uygulama konteynerinin host secret dosyasını güncellediği garanti değil. Bu yolu kaldır veya güvenli ayrı rotasyon arayüzü kur; kısmi hata durumunu test et.
- [ ] PR #31'in gerçek diff'ini PR açıklamasıyla karşılaştır; açıklamadaki yapılmış sayılan değişiklikleri dosya ve test kanıtı olmadan tamamlandı olarak işaretleme.

## CI doğrulaması — ek kayıt
- [ ] PR #32 head `56fb8779b913d6304ce81c7e87bed23ebd470c4a` için Actions run listesi ve combined status boş döndü; CI geçişi doğrulanmış değil.
- [ ] `.github/workflows/ci.yml` tüm branch push ve PR olaylarında otomatik çalışır. Kullanıcının GitHub'da test çalıştırmama tercihi geçerli; bu PR'da manuel run yapılmadı. [skip ci] yalnızca ilgili commit tetiklemesini engellemeye yönelik, test sonucu yerine geçmez.
