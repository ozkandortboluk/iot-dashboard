# NexusNode IoT — AI Agent Operating Contract

Bu dosya tüm kod ajanları için **tek ana başlangıç sözleşmesidir**. Amaç; aynı projede birden fazla AI ajanının çakışmadan çalışması, gereksiz repository taramasının ve token tüketiminin azaltılması, yapılan işin denetlenebilir şekilde diğer ajana devredilmesidir.

## 1. Zorunlu başlangıç sırası

Yeni bir görev geldiğinde varsayılan davranış:

1. Bu `AGENTS.md` dosyasındaki kuralları uygula.
2. `docs/project-map.md` içinden görevin ait olduğu modülü ve problem rotasını bul.
3. `docs/working.md` içinden aktif sahiplik/çakışma ve bekleyen handoff olup olmadığını kontrol et.
4. Görev bir roadmap maddesine bağlıysa `docs/PROJECT_ROADMAP.md` içinde **yalnız ilgili görev maddesini ve gerekli yakın bağlamı** oku.
5. Yalnız görevi çözmek için gereken kaynak dosyaları aç. Tüm repository'yi varsayılan olarak tarama.
6. Yazmadan önce `docs/working.md` içine görev sahipliği bırak; değişiklikten sonra commit SHA, değişen dosyalar, testler ve sonraki ajan eylemini handoff olarak yaz.
7. Kalıcı görev/karar bilgisi `working.md` içinde tutulmaz; uygun roadmap veya tamamlananlar kaydına aktarılır.

### Context-budget kuralı

- `project-map.md` kaynak kodun yerine geçmez; yalnız doğru kaynak dosyaya götüren indeks/navigasyondur.
- İlk inceleme halkasını mümkün olduğunca dar tut. Tipik bir düzeltmede önce ilgili 3–8 dosya yeterli olabilir; sayı katı sınır değildir.
- Yeni dosya yalnız mevcut kanıt sorunu açıklamıyorsa açılır. Kapsam genişletildiğinde neden genişletildiği kısa olarak belirtilir.
- Büyük `PROJECT_ROADMAP.md`, `tamamlanan_islemler.md`, changelog veya geniş test klasörleri baştan sona sırf “bağlam olsun” diye okunmaz.
- Bir sembolün/akışın yeri bilinmiyorsa önce `project-map.md`, sonra hedefli arama kullanılır; kör klasör taraması son çaredir.

## 2. Çoklu ajan sahipliği ve çakışma önleme

Kod veya kalıcı doküman yazmadan önce `docs/working.md` içindeki **Active Claims** bölümünde şu bilgiler bulunmalıdır:

- görev kimliği veya kısa görev adı,
- ajan adı,
- başlangıç/base commit SHA,
- amaç,
- dokunulacak dosyalar veya dar kapsam,
- durum: `ANALYZING`, `IMPLEMENTING`, `REVIEWING` veya `BLOCKED`.

Bu kayıt bir **soft lock**tır. Başka ajan aynı dosya/kapsam üzerinde aktif görünüyorsa:
- aynı dosyayı paralel düzenleme,
- mevcut ajanın handoff'unu bekle veya çakışmayan alt kapsama geç,
- zorunlu çakışmayı `working.md` içinde açıkça bildir.

GitHub blob SHA/HEAD her yazmadan önce yeniden kontrol edilir. Eski SHA ile başka ajanın değişikliği ezilmez.

## 3. Handoff sözleşmesi

İşi bırakan ajan `docs/working.md` içindeki kendi yönüne kısa bir handoff yazar:

```text
TASK: DB-01
AGENT: AI-STUDIO
BASE: <sha>
COMMIT: <sha>
STATUS: READY_FOR_REVIEW
CHANGED: path/a, path/b
TESTS: komut -> sonuç
SUMMARY: yapılan değişiklik
REVIEW: diğer ajanın özellikle kontrol edeceği noktalar
BLOCKERS: yok | açıklama
```

- Uzun diff, tam log veya eski rapor buraya kopyalanmaz.
- Yanıtlanan handoff temizlenebilir; Git geçmişi kalıcı geçmişi korur.
- Aktif iş bitince claim kaldırılır.
- Kalıcı kabul/ret gerekçesi roadmap veya `tamamlanan_islemler.md` içinde tutulur.

## 4. Doküman otoritesi

Çakışma halinde öncelik:

1. `AGENTS.md` — ajan davranış sözleşmesi.
2. `docs/kurallar.md` — roadmap/denetim/kabul ve ayrıntılı ortak çalışma kuralları.
3. `docs/PROJECT_ROADMAP.md` — güncel açık işler ve kabul şartları.
4. `docs/tamamlanan_islemler.md` — kabul edilmiş tarihçe.
5. `docs/project-map.md` — navigasyon; iş mantığı için otorite değildir.
6. `docs/working.md` — geçici aktif çalışma/handoff alanıdır.

`GEMINI.md` bağımsız kural kaynağı değildir; Gemini/AI Studio için bu sözleşmeye giriş dosyasıdır.

## 5. Roadmap durum modeli

Ayrıntıların kanonik kaynağı `docs/kurallar.md` dosyasıdır.

- `☐ ☐ ☐`: açık / uygulanmamış veya tamamen reddedilmiş.
- `☑ ☐ ☐`: AI Studio uyguladı, Codex denetimi bekliyor.
- `☑ ☐ ☑`: uygulama esasen var, Codex hedefli revizyon istiyor.
- `☑ ☑ ☐`: Codex kabul etti.

AI Studio yalnız uygulama kutusunu yönetir; Codex kutusunu kendi kendine işaretlemez. Üçüncü kutusu işaretli maddeler AI Studio için öncelikli revizyon işidir.

## 6. Proje genel değişmezleri

### Sürümleme
- Küçük UI/CSS rötuşu veya tekil bugfix için otomatik sürüm bump yapılmaz.
- PATCH: kritik güvenlik veya konsolide hata paketi.
- MINOR: yeni özellik/API/görünüm.
- MAJOR: geriye uyumsuz mimari/şema değişimi.
- Bump yapılırsa `package.json`, `src/config/version.ts` ve `CHANGELOG.md` senkron tutulur.
- UI sabit sürüm metni taşımamalı; sürümü merkezi config'ten almalıdır.

### API / Help merkezi
API, telemetri formatı veya cihaz protokolü değişirse `src/components/HelpView.tsx`, ilgili OpenAPI sözleşmesi ve gerekli ESP/istemci örnekleri birlikte kontrol edilir.

### Test ve production verisi
- Production'da demo/test seeding yasaktır.
- Canlı credential, parola, API key, private key veya müşteri verisi `AGENTS.md`, `GEMINI.md`, `project-map.md`, `working.md` veya roadmap'e yazılmaz.
- Test verileri test/fixture kapsamıyla sınırlanır.
- Güvenlik bypass'ı açarak test veya giriş sorunu çözülmez.

## 7. Bitirme kriteri

Kod değişikliğinde ajan:
- göreve uygun en dar testi çalıştırır,
- riskli/auth/DB/migration/security değişikliklerinde ilgili entegrasyon veya negatif testleri de değerlendirir,
- çalıştırmadığı testi geçmiş gibi yazmaz,
- değişen dosyaları ve test sonucunu handoff'a ekler,
- mimari rota değiştiyse `docs/project-map.md` dosyasını da günceller.

Sırf dokümantasyon değişikliği uygulama sürümünü artırmaz.
