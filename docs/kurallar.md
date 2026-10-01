# NexusNode IoT — Denetim ve ortak çalışma kuralları

## Çoklu ajan, context bütçesi ve başlangıç protokolü

- Tüm ajanlar için ana davranış sözleşmesi kökteki `AGENTS.md` dosyasıdır. `GEMINI.md` yalnız AI Studio/Gemini bootstrap dosyasıdır ve bağımsız kural seti oluşturmaz.
- Her görevde önce `docs/project-map.md` router'ından **tek ilgili `docs/maps/*.md`** seçilir; yalnız o alt harita okunduktan sonra `docs/working.md` claim/handoff durumu kontrol edilir.
- Repository varsayılan olarak baştan sona taranmaz. İlk inceleme yalnız görevin gerektirdiği dosyalarla sınırlıdır; mevcut kanıt yetersizse kapsam kontrollü genişletilir.
- Roadmap görevi biliniyorsa `PROJECT_ROADMAP.md` dosyasının tamamı yerine ilgili görev maddesi ve gerekli yakın bağlam okunur. `tamamlanan_islemler.md` yalnız geçmiş/regresyon/kimlik kontrolü gerektiğinde açılır.
- Yazmadan önce `working.md > Active Claims` alanına ajan, task, base SHA, kapsam ve dokunulacak dosyalar yazılır. Bu kayıt soft lock kabul edilir; başka ajanın aktif sahip olduğu aynı dosya paralel düzenlenmez.
- Uygulama sonunda aktif claim kaldırılır ve ilgili yönlü handoff'a commit SHA, değişen dosyalar, test sonucu, kısa özet, review isteği ve blocker yazılır.
- Yeni route/service/repository/ana component/worker/API-protokol/özellik akışı eklenir-taşınır veya çağrı zinciri değişirse ilgili `docs/maps/*.md` aynı değişiklikte güncellenir; yeni problem alanı oluşursa `project-map.md` router'ı da güncellenir. Küçük UI/CSS/metin değişiklikleri haritayı gereksiz yere değiştirmez.
- `working.md` geçici RAM'dir: sonuçlanan notlar temizlenir; kalıcı karar/kanıt roadmap veya tamamlananlara taşınır.

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
- **Pratik kanıt ve orantılı onay kuralı:** Codex denetiminde amaç kusursuz test kapsamı veya teorik olarak mümkün olan bütün iyileştirmeleri tamamlatmak değil, görevin gerçek gereksinimini güvenli ve çalışır biçimde karşılayıp karşılamadığını belirlemektir. Ek test yazılabilir, mimari daha da geliştirilebilir veya uç senaryo kapsamı genişletilebilir olması **tek başına onayı engellemez**.
- **Onayı bloke eden bulgu:** Yalnız doğrulanmış veya kod akışından somut biçimde gösterilebilen güvenlik açığı, veri kaybı/tutarsızlığı, yetki izolasyonu ihlali, production çalışma hatası, görevin ana gereksiniminin karşılanmaması veya mevcut davranışı bozabilecek gerçek regresyon riski ilgili görevi açık tutar. Teorik ihtimaller mümkün olduğunca “iyileştirme/QA” olarak ayrılır.
- **Kanıt → etki → nokta atışı düzeltme → minimum kabul:** Açık bırakılan her maddede mümkün olduğunca (1) dosya/fonksiyon/satır veya gerçek çalışma kanıtı, (2) bunun kullanıcı/production üzerindeki somut etkisi, (3) yalnız problemi giderecek hedefli değişiklik ve (4) onay için yeterli minimum doğrulama açıkça yazılır. “Daha fazla test et”, “daha güvenli yap”, “refactor et” gibi belirsiz talepler tek başına revizyon gerekçesi yapılmaz.
- **Testlerin orantılılığı:** Test kapsamı değişikliğin riskine göre seçilir. Güvenlik, auth, migration, veri kalıcılığı ve production failover gibi yüksek etkili alanlarda gerçek entegrasyon kanıtı gerekebilir; basit UI/deterministik servis değişikliklerinde odaklı unit/component testi veya açık kod kanıtı yeterli olabilir. İleri concurrency, fault-injection, performans veya geniş E2E testleri ana gereksinim bunlara bağlı değilse ilgili görevin onayını bloke etmez ve QA/iyileştirme kapsamına taşınır.
- **Mevcut doğru çözümü koruma:** Bir revizyonda daha önce kanıtla kabul edilmiş alt kapsam yeniden yaptırılmaz. Yeni bulgu yalnız belirli bir fonksiyon/yol ile sınırlıysa AI Studio’ya tüm sistemi yeniden tasarlatmak yerine o noktayı düzeltmesi söylenir. Böylece onay döngüsü gereksiz yere uzatılmaz.

- AI Studio düzeltmeyi yaptıktan sonra durum: `☑ ☐ ☑` → `☑ ☐ ☐` (3. kutu kaldırılır) → Codex yeniden kontrol eder → `☑ ☑ ☐`.
- **Kritik ayrım:** Codex'in her düzeltme talebi tam ret değildir. Temel/başarısız uygulama = `☐ ☐ ☐`; mevcut ve büyük ölçüde doğru uygulamada hedefli revizyon = `☑ ☐ ☑`.
- AI Studio yaptığı işi ve kanıtını yazdıktan sonra **yalnız ilk kutuyu** işaretler (`☑ ☐ ☐`); ikinci kutuyu kendi kendine işaretlemez. Codex denetleyip onaylarsa ikinci kutuyu işaretler (`☑ ☑ ☐`).
- Henüz denetlenmemiş bir `☑ ☐ ☐` madde sırf bekliyor diye sıfırlanmaz. Önceden onaylı iş bozulmuşsa kutular yeniden açılır. Her ret/regresyon için SHA, gerekçe, istenen düzeltme ve tekrar kabul testi `docs/working.md` dosyasına ve ilgili göreve yazılır.
- İkinci kutu yalnız belirtilen kabul kapsamının onayıdır. Kod varlığı, birim test, gerçek DB testi ve saha kanıtı ayrı belirtilir; yapılmayan test yapılmış sayılmaz.
- Tamamlanan maddeler silinmez. Regresyonda aynı kimlik tekrar açılır; eski kanıt, yeni SHA ve gerekçe eklenir. Aynı metnin birebir tekrarları kaynak başlıkları birleştirilerek tekilleştirilmiştir.
- Önce grubun yeni bulgusu çözülür; aynı kapsamdaki eski kayıt ayrı ikinci iş yaratmaz. Eski sürüm/ortam ifadeleri güncel kanıtla birlikte okunur. Eski tek kutulu `[x]` kayıtları tarihsel uygulama bildirimi olarak `☑ ☐ ☐` biçiminde korunur; uygulayıcının kimliği geçmiş kayıttan ayrıca doğrulanmış sayılmaz. Önceki denetimde açık güncel doğrulama kanıtı bulunan dar kapsamlı kayıtlar `☑ ☑ ☐` olabilir. Bu biçim dönüşümü yeni bir kod/saha denetimi değildir.
- Her değişiklik küçük ve gözden geçirilebilir olmalı. Güvenlik bypass’ı açarak test/giriş sorunu çözülmez. Canlı DB’ye deneme verisi, test hesabı veya denetim amaçlı yıkıcı işlem uygulanmaz.
- Google AI Studio kısa claim/handoff'u `docs/working.md` içindeki **AI Studio → Codex** alanına; Codex yanıtını **Codex → AI Studio** alanına yazar. Kalıcı kabul/ret ve test kanıtı ilgili görevde tutulur; başarısız/çalıştırılmamış testler açıkça kalır.
- Her yeni kod commit’inde diff + çağıran/çağrılan kod + schema/API/WS/cihaz örnekleri kontrol edilir. Yalnız değişen satıra bakılmaz. Main’de tamamlandı demek için düzeltme main’de bulunmalıdır.
- Yazmadan önce güncel HEAD ve dosya blob SHA tekrar okunur; AI Studio’nun eşzamanlı notları korunur. Conflict durumunda dosya yeniden okunup birleştirilir. Yalnız doküman değişikliğinde yeni bulgu yoksa yeni denetim commit’i üretilmez.

## Dosya düzeni ve taşıma döngüsü

- `AGENTS.md`: Tüm ajanların kısa ve zorunlu davranış sözleşmesidir; her görevde uygulanır.
- `docs/project-map.md`: Küçük problem router'ıdır; yalnız doğru `docs/maps/*.md` dosyasına yönlendirir, kaynak kod otoritesi değildir.
- `docs/maps/*.md`: Alan bazlı kısa dosya/akış/test haritalarıdır; yalnız ilgili alan gerektiğinde okunur.
- `docs/kurallar.md`: Denetim, öncelik, üç kutu ve kabul kurallarının ayrıntılı kaynağıdır; görev roadmap/denetim akışına dokunuyorsa ilgili bölümleri okunur.
- `docs/PROJECT_ROADMAP.md`: En üstte açık kullanıcı istekleri; altında konu grupları, yapılacaklar ve kabul şartları bulunur. `☐ ☐ ☐`, `☑ ☐ ☐` ve `☑ ☐ ☑` burada kalır.
- `docs/tamamlanan_islemler.md`: Codex kabulü tamamlanan `☑ ☑ ☐` görevler, aynı kimlik ve kanıtıyla taşınır. AI Studio’nun ilk kutuyu işaretlemesi tek başına taşıma gerekçesi değildir.
- **Kısmi tamamlama / alt kapsam taşıma kuralı:** Tek görev birden fazla bağımsız kabul alt konusu içeriyorsa, Codex tarafından kanıtla tamamlanan alt konular roadmap’te tekrar tutulmaz. Görev bütünü açık kalabilir; doğrulanmış alt kapsam `tamamlanan_islemler.md` içinde aynı kanonik kimlik altında **“kısmen tamamlandı”** kaydıyla, tamamlanan kapsam ve kanıtı belirtilerek tutulur. Roadmap’te aynı kimlik altında yalnız henüz yapılmamış, doğrulanmamış veya revizyon isteyen kısımlar kalır.
- Kısmi taşıma yeni görev kimliği üretmez ve aynı konuyu iki aktif göreve bölmez. `USR-*` bir mevcut kanonik göreve bağlıysa (`USR-02 → RUN-04` gibi), tamamlanan alt kapsam tamamlananlar dosyasında bu ilişkiyle birlikte yazılır; roadmap’in kullanıcı isteği satırı yalnız **kalan açık kapsamı** özetleyecek şekilde güncellenir.
- Tamamlanan alt kapsam tekrar roadmap’e açıklama/başarı geçmişi olarak kopyalanmaz. Regresyon olursa yalnız bozulan alt kapsam aynı kanonik görev altında roadmap’e geri açılır; önceki tamamlanma kanıtı tamamlananlar dosyasında tarihsel kayıt olarak korunur.
- `docs/working.md`: **Active Claims**, **AI Studio → Codex** ve **Codex → AI Studio** geçici alanlarını içerir. Aktif sahiplik ve kısa handoff dışında rapor deposu olarak kullanılmaz; kalıcı karar ve kabul kanıtları görev dosyalarında, önceki sürümler Git geçmişinde korunur.
- Her görev güncel kayıt olarak yalnız bir yerde bulunur: açık iş roadmap’te, onaylanmış iş tamamlananlarda. Bir madde kapanınca önce tamamlananlara kimliği/kanıtıyla aktarılır, ardından roadmap’ten kaldırılır; bu taşıma geçmişi silmek değildir.
- Tamamlanan iş bozulursa aynı kimlikle roadmap’e geri taşınır; yeni duruma göre kutular açılır. Tamamlananlar dosyasında eski onay/regresyon tarihi not olarak korunur; iki aktif görev kaydı oluşturulmaz.
- İşe başlarken büyük dokümanlar topluca okunmaz. Küçük akış: `project-map.md` → tek ilgili `maps/*.md` → `working.md`; ardından yalnız ilgili roadmap maddesi/kural bölümü ve gerekli kaynak dosyalar açılır. Kurallar roadmap içine tekrar kopyalanmaz.
- Dosya taşıması uygulama denetimi veya yeni onay değildir; mevcut durum ve kabul kapsamı korunur. Canlı test yapılmadıysa yapılmış sayılmaz.
- Her yazmadan önce değiştirilecek dosyaların güncel blob SHA’sı ve HEAD okunur. Karşı tarafın yeni uygulama veya notları üzerine yazılmaz; eşzamanlı düzenleme varsa yeniden birleştirilir.

## Kullanıcı istekleri ve USR kontrol maddeleri

- Roadmap’in en üstünde **Kullanıcı istekleri** alanı bulunur. Kullanıcı isteklerini serbest metinle yazabilir; kimlik, öncelik veya kutu vermesi gerekmez.
- Codex her yeni isteği inceler; ilgili konu grubunda somut yapılacaklar ve ölçülebilir kabul şartlarıyla `USR-01`, `USR-02` şeklinde bir kontrol maddesi oluşturur. Kullanıcının kaynak metni anlamı değiştirilmeden korunur ve kontrol maddesiyle eşleştirilir.
- `USR` kullanıcı isteği kaynaklı görev kodudur. Görev uygun mevcut gruba yerleştirilir; sırf kullanıcı isteği olduğu için ayrı bir konu grubu açılmaz. Aynı konuya ait mevcut görev varsa bağlantı kurulur; aynı iş iki bağımsız uygulama işi olarak çoğaltılmaz.
- **Tek kanonik görev kuralı:** Aynı teknik sorun/özellik roadmap içinde yalnız **bir aktif görev maddesi** olarak tutulur. Konu güvenlik, veritabanı, WebSocket, CI veya arayüz gibi birden fazla alanı etkileyebilir; bu durum ikinci/üçüncü görev kopyası oluşturma gerekçesi değildir. En uygun ana grupta tek görev tutulur, diğer gruplarda gerekiyorsa yalnız kısa `Bkz. <GÖREV-ID>` referansı verilir; aynı yapılacak/kabul metni tekrar edilmez.
- Yeni kullanıcı isteği mevcut bir görevin kapsamına giriyorsa yeni bağımsız `USR-*` kontrol görevi açılmaz. Kullanıcı isteği satırı mevcut kanonik görev kimliğine (`USR-xx → RUN-04` gibi) bağlanır ve gerekli yeni kabul şartları o tek görevde birleştirilir. `USR-*` istek kimliği geçmiş/audit için korunur ancak ikinci aktif görev yaratmaz.
- Bir denetimde iki veya daha fazla açık maddenin fiilen aynı kök nedeni ve aynı kabul testini anlattığı görülürse maddeler tek kanonik görevde birleştirilir. Kapatılan/eritilen kimlikler tekrar kullanılmaz; Git geçmişi iz olarak kalır. Roadmap'te aynı konunun ayrıntılı metni birden fazla bölümde tutulmaz.
- Yeni kimlik verilmeden önce roadmap, tamamlananlar ve Git geçmişindeki USR kayıtları kontrol edilir. Kimlikler tekrar kullanılmaz; numara artan sırayla devam eder.
- Üstteki alan isteğin kaynağıdır; üç kutulu güncel kontrol durumu yalnız ilgili konu grubundaki USR maddesinde tutulur. Kaynak satırında ikinci bir görev/kutu kaydı oluşturulmaz.
- AI Studio isteği uygulayıp kanıtını bırakır ve yalnız ilk kutuyu işaretler. Codex kodu, çağıran/çağrılan akışı ve kabul testlerini denetler; aynı onay, hedefli revizyon ve tam ret kuralları USR maddelerine de uygulanır.
- Öncelik güvenlik ve çalışan uygulama şartlarına göre verilir. Kullanıcı isteği mevcut P0/P1 güvenlik/çalışma engellerini otomatik olarak geçmez.
- İstek değişirse yeni kapsam ve kabul şartları aynı kimlik altında güncellenir; önceki karar Git geçmişinde korunur. İstek gerçekten ayrı bir işse yeni kimlik verilir.
- USR maddesi `☑ ☑ ☐` ile kapanınca görev ve kullanıcının kaynak isteği birlikte tamamlananlar dosyasına taşınır; roadmap’in üst alanı da yalnız açık istekleri gösterir. Regresyonda aynı kimlikle geri açılır.
- Göreve aktarılan geçici kullanıcı notu working.md’den temizlenebilir. Kısa yanıt/engel kendi AI Studio veya Codex alanına yazılır; kalıcı istek ve kontrol işi roadmap’te kalır.

## Active Claims, iki yönlü handoff ve sıfırlama kuralı

- `docs/working.md` geçici olarak **Active Claims**, **AI Studio → Codex** ve **Codex → AI Studio** alanlarını içerir. Her taraf kendi handoff alanına kısa not yazar; aktif claim yoksa “Aktif claim yok.” biçiminde kalır.
- Bir not mümkün olduğunca görev kimliği, tam veya kısa SHA, sonuç/engel ve beklenen sonraki adımdan oluşur. Yalnız yeni soruyu veya düzeltme isteğini açıklayan ayrıntı tutulur; uzun diff, tekrarlanan test çıktısı ve eski raporlar eklenmez.
- Codex, AI Studio’nun notuna yanıt verdiyse ilgili **AI Studio** notunu temizleyebilir. AI Studio, Codex’in notuna yanıt verdiyse ilgili **Codex** notunu temizleyebilir. Karşı alanı yalnız okumak, notun yanıtlandığı anlamına gelmez.
- Her denetim sonunda yanıtlanan veya sonuçlanmış eski kayıtlar temizlenir; yeni tur için yalnız güncel yanıt/soru ve kalan engeller bırakılır. Yanıtlanmamış konu sırf yeni denetim yapıldı diye kaybolmaz; kısa tek bir bekleyen not olarak korunur.
- Temizlemeden önce kalıcı görev durumu, kabul/ret gerekçesi, gerekli test kanıtı ve sonraki iş `PROJECT_ROADMAP.md` veya `tamamlanan_islemler.md` içindeki ilgili maddeye aktarılır. Yaz-boz alanı görev kayıtlarının yerine geçmez.
- Görev olmayan kullanıcı önerisi cevaplanana veya ilgili göreve aktarılana kadar kısa not olarak tutulur. Tamamlanmış görevler yaz-boz sıfırlamasıyla silinmez.
- Eski iletişim ve denetim raporları tekrar bu dosyaya taşınmaz; gerektiğinde Git geçmişinden okunur. Notların silinmesi kodun onaylandığı veya bir testin geçtiği anlamına gelmez.
- Eşzamanlı yazmadan önce güncel dosya/HEAD okunur. Karşı tarafın yeni notu yanlışlıkla silinmez. Notlarda parola, token, private key, tam credential URL veya kişisel müşteri verisi bulunmaz.

## Tamamlama ve yayın kapısı

Bir görev yalnız kendi kabul testi için kanıt varsa ve Codex onayı verilmişse (`☑ ☑ ☐`) kapanır. Doküman değişikliği sürüm artırmayı gerektirmez; anlamlı yayınlarda AGENTS.md sürüm kuralları uygulanır. Uygulama değişiklikleri için temiz kurulum, lint/type-check/unit/build ve etkilenen gerçek entegrasyon testi raporlanır. Schema değişikliğinde boş DB ve upgrade; auth değişikliğinde negatif yetki matrisi; telemetri değişikliğinde idempotency/replay; OTA değişikliğinde gerçek hedef cihaz testi gerekir. Başarısız kritik gate varken release hazır sayılmaz. Issue veya başka takip aracı ilgili görev kimliği ve görev dosyasına referans verir.
