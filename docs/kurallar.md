# NexusNode IoT — Denetim ve ortak çalışma kuralları

- **P0:** güvenlik açığı/erişim veya müşteri izolasyonu ihlali; önce kapatılır.
- **P1:** uygulamanın açılması, giriş, gerçek veri kalıcılığı, cihaz çalışması ve kurtarma. Çalışan uygulamayı korumak her değişiklik için zorunlu kabul şartıdır.
- **P2:** güvenilirlik, performans, kullanılabilirlik ve mevcut özelliklerin tamamlanması.
- **P3:** teknik borç ve stratejik genişleme. Güvenlik/çalışma engelinin önüne geçmez.
- **Her görev başında üç kutu bulunur; sıra değişmez: 1. AI Studio uygulama durumu, 2. Codex denetim/onay durumu, 3. Codex düzeltme/revizyon talebi.** Roadmap ve tamamlananlar dosyasında üç kutunun da görünür olması için `☐` (boş) ve `☑` (işaretli) kullanılır.
- `☐ ☐ ☐` → Henüz yapılmadı **veya Codex uygulamayı tamamen reddetti**. Tam ret halinde 1. kutu özellikle kaldırılır; görev açık iş olarak yeniden ele alınır.
- `☑ ☐ ☐` → AI Studio uyguladı, Codex incelemesi bekleniyor.
- `☑ ☐ ☑` → Codex uygulamayı kabul edilebilir buldu ancak **belirli düzeltme/revizyon istedi**. 1. kutu korunur; 3. kutu işaretlenir ve istenen düzeltme açıkça yazılır.
- `☑ ☑ ☐` → Codex onayladı (Kabul kriterleri başarıyla karşılandı).
- **Tam ret kuralı:** Kod/uygulama temel gereksinimi karşılamıyorsa, güvenlik politikasını ihlal ediyorsa, yanlış/eksik bir mimariyle çözmeye çalışıyorsa veya mevcut uygulama fiilen gereksinimi yerine getirmiyorsa Codex `☐ ☐ ☐` durumuna döner. 1. kutunun kaldırılmasının hemen altında/ilgili görevde **neden reddedildiği ve yeniden yapılması gerekenler** yazılır. Böylece AI Studio maddeyi “zaten uygulandı” kabul edip atlayamaz.
- **Hedefli düzeltme kuralı:** Uygulama esasen doğruysa ve sorun belirli, sınırlı değişikliklerle giderilebiliyorsa `☑ ☐ ☑` kullanılır. 1. kutu korunur; 3. kutu altında istenen düzenleme ve kabul testi açıkça belirtilir.
- AI Studio düzeltmeyi yaptıktan sonra durum: `☑ ☐ ☑` → `☑ ☐ ☐` (3. kutu kaldırılır) → Codex yeniden kontrol eder → `☑ ☑ ☐`.
- **Kritik ayrım:** Codex'in her düzeltme talebi tam ret değildir. Temel/başarısız uygulama = `☐ ☐ ☐`; mevcut ve büyük ölçüde doğru uygulamada hedefli revizyon = `☑ ☐ ☑`.
- AI Studio yaptığı işi ve kanıtını yazdıktan sonra **yalnız ilk kutuyu** işaretler (`☑ ☐ ☐`); ikinci kutuyu kendi kendine işaretlemez. Codex denetleyip onaylarsa ikinci kutuyu işaretler (`☑ ☑ ☐`).
- Henüz denetlenmemiş bir `☑ ☐ ☐` madde sırf bekliyor diye sıfırlanmaz. Önceden onaylı iş bozulmuşsa kutular yeniden açılır. Her ret/regresyon için SHA, gerekçe, istenen düzeltme ve tekrar kabul testi `docs/notlar.md` dosyasına ve ilgili göreve yazılır.
- İkinci kutu yalnız belirtilen kabul kapsamının onayıdır. Kod varlığı, birim test, gerçek DB testi ve saha kanıtı ayrı belirtilir; yapılmayan test yapılmış sayılmaz.
- Tamamlanan maddeler silinmez. Regresyonda aynı kimlik tekrar açılır; eski kanıt, yeni SHA ve gerekçe eklenir. Aynı metnin birebir tekrarları kaynak başlıkları birleştirilerek tekilleştirilmiştir.
- Önce grubun yeni bulgusu çözülür; aynı kapsamdaki eski kayıt ayrı ikinci iş yaratmaz. Eski sürüm/ortam ifadeleri güncel kanıtla birlikte okunur. Eski tek kutulu `[x]` kayıtları tarihsel uygulama bildirimi olarak `☑ ☐ ☐` biçiminde korunur; uygulayıcının kimliği geçmiş kayıttan ayrıca doğrulanmış sayılmaz. Önceki denetimde açık güncel doğrulama kanıtı bulunan dar kapsamlı kayıtlar `☑ ☑ ☐` olabilir. Bu biçim dönüşümü yeni bir kod/saha denetimi değildir.
- Her değişiklik küçük ve gözden geçirilebilir olmalı. Güvenlik bypass’ı açarak test/giriş sorunu çözülmez. Canlı DB’ye deneme verisi, test hesabı veya denetim amaçlı yıkıcı işlem uygulanmaz.
- Google AI Studio görev kimliğini, ilgili commit SHA’sını, kısa uygulama/test sonucunu ve Codex’ten beklediği yanıtı `docs/notlar.md` içindeki **AI Studio** alanına yazar. Codex yanıtını **Codex** alanına yazar, kabul ölçütünü kontrol edip ilgili görevde ikinci veya üçüncü kutuyu kanıta göre günceller; ilk kutu uygulama geçmişini korur. Başarısız/çalıştırılmamış testler açıkça kalır.
- Her yeni kod commit’inde diff + çağıran/çağrılan kod + schema/API/WS/cihaz örnekleri kontrol edilir. Yalnız değişen satıra bakılmaz. Main’de tamamlandı demek için düzeltme main’de bulunmalıdır.
- Yazmadan önce güncel HEAD ve dosya blob SHA tekrar okunur; AI Studio’nun eşzamanlı notları korunur. Conflict durumunda dosya yeniden okunup birleştirilir. Yalnız doküman değişikliğinde yeni bulgu yoksa yeni denetim commit’i üretilmez.

## Dosya düzeni ve taşıma döngüsü

- `docs/kurallar.md`: Denetim, öncelik, üç kutu ve kabul kurallarının kaynağıdır. Her çalışma başında okunur.
- `docs/PROJECT_ROADMAP.md`: Yalnız açık işler; konu grupları, yapılacaklar ve kabul şartları bulunur. `☐ ☐ ☐`, `☑ ☐ ☐` ve `☑ ☐ ☑` burada kalır.
- `docs/tamamlanan_islemler.md`: Codex kabulü tamamlanan `☑ ☑ ☐` görevler, aynı kimlik ve kanıtıyla taşınır. AI Studio’nun ilk kutuyu işaretlemesi tek başına taşıma gerekçesi değildir.
- `docs/notlar.md`: Yalnız iki geçici iletişim alanı bulunur: **AI Studio** ve **Codex**. Denetim geçmişi veya uzun rapor deposu olarak kullanılmaz; kalıcı karar ve kabul kanıtları görev dosyalarında, önceki sürümler Git geçmişinde korunur.
- Her görev güncel kayıt olarak yalnız bir yerde bulunur: açık iş roadmap’te, onaylanmış iş tamamlananlarda. Bir madde kapanınca önce tamamlananlara kimliği/kanıtıyla aktarılır, ardından roadmap’ten kaldırılır; bu taşıma geçmişi silmek değildir.
- Tamamlanan iş bozulursa aynı kimlikle roadmap’e geri taşınır; yeni duruma göre kutular açılır. Tamamlananlar dosyasında eski onay/regresyon tarihi not olarak korunur; iki aktif görev kaydı oluşturulmaz.
- İşe başlamadan dört dosya birlikte okunur. Kurallar roadmap içine tekrar kopyalanmaz; rapor/ortak notlar açık iş listesini şişirmez.
- Dosya taşıması uygulama denetimi veya yeni onay değildir; mevcut durum ve kabul kapsamı korunur. Canlı test yapılmadıysa yapılmış sayılmaz.
- Her yazmadan önce değiştirilecek dosyaların güncel blob SHA’sı ve HEAD okunur. Karşı tarafın yeni uygulama veya notları üzerine yazılmaz; eşzamanlı düzenleme varsa yeniden birleştirilir.

## İki alanlı yaz-boz ve sıfırlama kuralı

- `docs/notlar.md` yalnız **AI Studio** ve **Codex** başlıklarını içerir. Her taraf kendi alanına kısa not yazar; boş alan “Yanıt bekleyen not yok.” biçiminde kalır.
- Bir not mümkün olduğunca görev kimliği, tam veya kısa SHA, sonuç/engel ve beklenen sonraki adımdan oluşur. Yalnız yeni soruyu veya düzeltme isteğini açıklayan ayrıntı tutulur; uzun diff, tekrarlanan test çıktısı ve eski raporlar eklenmez.
- Codex, AI Studio’nun notuna yanıt verdiyse ilgili **AI Studio** notunu temizleyebilir. AI Studio, Codex’in notuna yanıt verdiyse ilgili **Codex** notunu temizleyebilir. Karşı alanı yalnız okumak, notun yanıtlandığı anlamına gelmez.
- Her denetim sonunda yanıtlanan veya sonuçlanmış eski kayıtlar temizlenir; yeni tur için yalnız güncel yanıt/soru ve kalan engeller bırakılır. Yanıtlanmamış konu sırf yeni denetim yapıldı diye kaybolmaz; kısa tek bir bekleyen not olarak korunur.
- Temizlemeden önce kalıcı görev durumu, kabul/ret gerekçesi, gerekli test kanıtı ve sonraki iş `PROJECT_ROADMAP.md` veya `tamamlanan_islemler.md` içindeki ilgili maddeye aktarılır. Yaz-boz alanı görev kayıtlarının yerine geçmez.
- Görev olmayan kullanıcı önerisi cevaplanana veya ilgili göreve aktarılana kadar kısa not olarak tutulur. Tamamlanmış görevler yaz-boz sıfırlamasıyla silinmez.
- Eski iletişim ve denetim raporları tekrar bu dosyaya taşınmaz; gerektiğinde Git geçmişinden okunur. Notların silinmesi kodun onaylandığı veya bir testin geçtiği anlamına gelmez.
- Eşzamanlı yazmadan önce güncel dosya/HEAD okunur. Karşı tarafın yeni notu yanlışlıkla silinmez. Notlarda parola, token, private key, tam credential URL veya kişisel müşteri verisi bulunmaz.

## Tamamlama ve yayın kapısı

Bir görev yalnız kendi kabul testi için kanıt varsa ve Codex onayı verilmişse (`☑ ☑ ☐`) kapanır. Doküman değişikliği sürüm artırmayı gerektirmez; anlamlı yayınlarda AGENTS.md sürüm kuralları uygulanır. Uygulama değişiklikleri için temiz kurulum, lint/type-check/unit/build ve etkilenen gerçek entegrasyon testi raporlanır. Schema değişikliğinde boş DB ve upgrade; auth değişikliğinde negatif yetki matrisi; telemetri değişikliğinde idempotency/replay; OTA değişikliğinde gerçek hedef cihaz testi gerekir. Başarısız kritik gate varken release hazır sayılmaz. Issue veya başka takip aracı ilgili görev kimliği ve görev dosyasına referans verir.
