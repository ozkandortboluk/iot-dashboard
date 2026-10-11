# Güvenlik dalı — iş akış ağacı

> **📍 ŞU ANKİ KONUM: 14 — 72/72 doğrulandı; HTTP/WS, Nginx ve Docker hardening toplu doğrulama bekliyor**
>
> Dal: `security/abuse-prevention-audit-20261011`  
> Kapsam: Bu sohbette yürütülen Vault güvenliği ve doğrulama çalışmaları.  
> **Bu belge ilerleme kaydıdır; işaretli adımlar üretim onayı anlamına gelmez.**
>
> **Durumlar:** ✅ Tamamlandı · 🔄 Devam ediyor · ⏳ Bekliyor · ⚠️ Engelli / doğrulama gerekiyor

```text
📍 05 MASTER KEY KALICILIĞI — ŞU AN BURADAYIZ
│
├── 01. İlk teşhis ve risk analizi                         ✅
│   ├── Vault parola taşıma / erken temizleme riski         ✅
│   ├── Runtime config yazma sırası ve sessiz hatalar       ✅
│   └── İlk test sonucu: 25 geçti, 2 başarısız              ✅
│
├── 02. Vault parola kalıcılığı düzeltmeleri                ✅
│   ├── Legacy parolayı Vault'a yaz ve doğrula              ✅
│   ├── Runtime config öncesinde parolayı kaydet            ✅
│   └── Çift parola yazımını kaldır                        ✅
│       └── TypeScript kontrolü (d8ef5a6): başarılı        ✅
│
├── 03. Test izolasyonu                                     ✅
│   ├── Ayrı test veri dizini desteği (setup/Vault)         ✅
│   ├── Geçici dizin ve özel Vitest yapılandırması          ✅
│   ├── Test dosyalarının DB config yollarını ayır          ✅
│   ├── Dış bağlantı ortam değişkenlerini engelle           ✅
│   ├── db.ts veri dosyalarını da geçici dizine yönlendir   ✅
│   ├── Gerçek DB ve arka plan servislerini mock/izole et   🔄
│   ├── Testte DB başlatma ve zamanlayıcıları kapat         ✅
│   ├── Sahte PostgreSQL URL ihtiyacını kaldır              ✅
│   ├── Tanımsız test değişkenini düzelt                    ✅
│   ├── Testte PostgreSQL Pool oluşturmayı engelle         ✅
│   ├── Testte asenkron yerel DB yazmasını kapat            ✅
│   └── Test izolasyonunu yeniden doğrula                   ✅
│
├── 04. Hata senaryoları ve güvenli dosya işlemleri         🔄
│   ├── Legacy .db_config.json temizliğini atomik yap       ✅
│   ├── Normal config kaydını atomik yap                    ✅
│   ├── Atomik rename hatası regresyon testi               ✅
│   ├── Vault yazma hatasında eski parolayı koru            ✅
│   ├── Vault bozuk/okunamıyor durumunda fail-closed        ✅
│   ├── Metadata senkronizasyonu ve kısmi kayıt riski       🔄
│   └── Config yazma hatasında Vault parola rollback       ✅
│
├── 05. Doğrulama                                           🔄 📍
│   ├── npm run type-check (741b11e)                       ✅
│   ├── İzole Vault testleri (741b11e: 49/49)              ✅
│   ├── Üç yeni regresyon testi (34/34 geçti)              ✅
│   ├── İlk parola rollback testi (35/35 geçti)            ✅
│   ├── Master key kalıcılık kategorisi (2/2 geçti)        ✅
│   ├── Restart, yarış ve izin testleri (3/3 geçti)         ✅
│   ├── Üretim Docker secret testleri (3/3 geçti)           ✅
│   ├── Son yazma kuyruğu düzeltmesini tekrar test et       ✅
│   ├── Regresyon / güvenlik incelemesi                     ⏳
│   └── Kalan riskler ve kanıtlı sonuç raporu               ⏳
│
└── 06. Kullanıcı onayı ve yayına hazırlık                  ⏳
    ├── Değişikliklerin ve risklerin kullanıcıya sunumu    ⏳
    ├── main dalına birleştirme için açık onay              ⏳
    └── Üretim dağıtımı için ayrıca açık onay               ⏳
```

## Tamamlanan GitHub kilometre taşları

| Commit | Kısa açıklama |
|---|---|
| `d5e1006` | Legacy parola taşıma doğrulaması |
| `d08cbe7` | Legacy config taşıma akışı |
| `d12b2da` | Doğrulanmış senkron Vault parola yazma |
| `d8ef5a6` | Runtime config öncesi Vault yazımı |
| `52f45e5` | İki başarısız testin beklentileri |
| `4a3b4c8`, `2eada30` | Test dizini desteği |
| `25d4d5e`, `4c6716e` | Geçici dizin ve Vitest yapılandırması |
| `1f143bd`, `6bcc2d0` | Test dosyası yolları |
| `6791518` | DB bağlantı değişkeni korumaları |
| `8a8b0cf` | db.ts test verilerini geçici dizine yönlendirme |
| `df0c130`, `25229a7` | Testte DB başlangıcı ve arka plan zamanlayıcılarını devre dışı bırakma |
| `fe750c7`, `eed96bd` | İzole config okuma; sahte PostgreSQL URL kaldırma |
| `0df2533` | Vault testinde tanımsız değişkeni düzeltme |
| `9c81218` | İzole Vault testlerinde PostgreSQL Pool koruması |
| `c0dc864` | Testte asenkron yerel DB dosyası yazımını devre dışı bırakma |
| `010244f` | Runtime DB config ve legacy temizliği için atomik değiştirme (mevcut 27 test geçti) |
| `0fa8b3b` | Atomik rename hatasında eski config ve geçici dosya temizliği testi (28/28 geçti) |
| `0ee645d` | Bozuk Vault dosyasını fail-closed reddetme |
| `5a24e5b` | Bozuk Vault ve parola rollback testleri (30/30 geçti) |
| `f23ef13`, `841ea31` | Maskeli parola düzeltmesi ve regresyon testi (31/31 geçti) |

## Güncelleme kuralı

- Her anlamlı adımda bu dosyanın **en üstündeki 📍 konum** ve ağaçtaki durumlar güncellenir.
- Yalnızca kodun commit edilmesi **test geçti** anlamına gelmez; doğrulama ayrı işaretlenir.
- Engellenen değişiklikler tamamlandı olarak gösterilmez.
- Çalışmalar yalnızca bu güvenlik dalında sürer. `main` ve çalışan Docker ortamı kullanıcı onayı olmadan değiştirilmez.
- Kullanıcıya ilerleme bildirirken bu dosyanın yolu ve mevcut 📍 adımı belirtilir.

> Son doğrulama: `e89787d` — TypeScript başarılı, 31/31 Vault testi geçti. Metadata yazma hatası regresyon testi henüz eklenmedi.

> Toplu doğrulama tamamlandı: `b4397fa` — TypeScript kontrolü ve 34/34 izole Vault testi başarılı. Kalan risk: ilk kez parola oluşturulurken config kaydı başarısız olursa Vault'daki yeni parolanın geri alınması; ayrıca OTA/DB test uyarılarının ayrıştırılması.

> Doğrulama tamamlandı: `9f87ff1` — TypeScript kontrolü ve 35/35 izole Vault testi geçti. İlk parola rollback regresyonu başarılı. PostgreSQL havuzu/OTA/ENCRYPTION_KEY test uyarıları henüz ayrı değerlendirilmedi.

> OTA incelemesi: `1f479f2` — hatalı özel anahtar örneği yerine test sırasında geçerli, geçici Ed25519 anahtarı oluşturuluyor. Test sayısı değişmedi (35); yeni doğrulama bekleniyor. ENCRYPTION_KEY üretim fail-closed kuralı değiştirilmedi.

> `95c8a4f` testi: 34 geçti, 1 başarısız. OTA geçerli Ed25519 anahtarı artık ayrıştırılıyor; başarısızlık yalnızca PEM sondaki satır sonunun Vault'da trim edilmesinden kaynaklandı. `4ca7a99` test beklentisini normalize etti; yeniden doğrulama bekliyor. Üretim master key davranışı değiştirilmedi.

> `65d8fa5` doğrulaması: TypeScript ve 35/35 test başarılı; OTA ayrıştırma uyarısı giderildi. PostgreSQL havuzu uyarısının kaynağı `quickInitDocker` testinin `configureDatabase` içinde gerçek Pool oluşturmaya çalışmasıdır; izole test bunu engelliyor. Teste özel düzeltme yazma girişimi engellendi, henüz uygulanmadı. ENCRYPTION_KEY eksik uyarıları üretim modu taklit testinde görülüyor; üretim fail-closed politikası korunacak.

> Test düzenlemeleri: `9444adf` üretim-modu fixture'ında Docker master key secret mount'unu taklit eder; `a7dcda3` quickInitDocker testinde gerçek PostgreSQL Pool kurulumunu mock'lar. Üretim koduna dokunulmadı. 35 test yeniden çalıştırılmayı bekliyor.

> Son VPS izole checkout doğrulaması: `fa584de` — TypeScript başarılı, 35/35 test geçti. PostgreSQL havuzu, OTA PEM ve ENCRYPTION_KEY eksik test uyarıları artık görünmüyor. Kasıtlı bozuk Vault / disk hatası / plaintext reddi logları beklenen negatif test çıktılarıdır. Bu sonuçlar üretim ortamı doğrulaması değildir.

> `7cf7d0f`: geliştirmede mevcut `.vault_key` bozuk/okunamazsa fail-closed; anahtar sessizce yeniden üretilmez. `4ea69a2`: ayrı `master_key_persistence.test.ts` kategorisi; `3fe1605`: Vitest kapsamına eklendi. 37 test ve type-check doğrulaması bekleniyor. Üretim Docker secret politikası değiştirilmedi.

> `99c4359` izole VPS checkout doğrulaması: TypeScript geçti; 3 test dosyasında toplam 37/37 test geçti (Vault 25, canonical 10, master key 2). Üretim entegrasyon testi değildir. Kalan: kalıcı anahtarın restart ve izin davranışları ile dosya yarışları için ilave risk değerlendirmesi.

> `7e90f86`: geliştirmede kalıcı anahtar oluşturma `wx` ile özel; eşzamanlı EEXIST halinde var olan anahtarı kullanır; yazma hatasında ephemeral anahtar üretmez. `9fd3bb2`: yeniden başlatma, yarış ve izin hatası için 3 Master Key testi. TypeScript ve 40/40 hedefi henüz doğrulanmadı. Üretim Docker secret yolu değişmedi.

## Master Key — sonraki çalışma paketi için risk kaydı

- **Öncelik P1:** Üretim Docker secret dosyası yokken veya geçersizken alternatif kaynağa düşülmediği ayrıca regresyon testiyle doğrulanmalı. Mevcut kod bunu amaçlıyor; yeni test henüz eklenemedi.
- **Öncelik P1:** Geliştirme ortamında üst öncelikli Docker/yerel secret dosyası mevcut ama okunamazsa alt öncelikli kaynağa geçişin, önceki şifreli Vault verilerini erişilemez bırakma riski incelenmeli.
- **Öncelik P1:** Master key dosyası için sembolik bağlantı, sahiplik ve dosya izinleri değerlendirmesi gerekiyor; yalnızca `mode: 0o600` ile oluşturma tüm tehditleri kapsamaz.
- **Öncelik P2:** Eşzamanlı oluşturma yarışında `EEXIST` sonrası mevcut dosya içeriği okunurken kısmi yazım ihtimali ve güvenli yeniden deneme politikası incelenmeli.
- **Doğrulama:** Son başarılı sonuç 37/37; sonraki 3 Master Key testiyle toplam 40 test henüz çalıştırılmadı. Üretim Docker secret testlerini ekleme girişimi engellendi, tamamlandı olarak işaretlenmedi.


> Paket genişletmesi: `3a76c83` eksik üretim Docker secret durumunda ortam anahtarına düşmeme; `00b2219` geçersiz üretim secret'ını reddetme; `a86df99` üretim anahtarının cache sıfırlamada korunması. Master Key 8 test; genel toplam 43 test. Bu 6 yeni test henüz çalıştırılmadı; sonuç bekleniyor.

> VPS izole checkout doğrulaması (`afce214`): `npm run type-check` başarılı; Vitest 3 dosya, 43/43 test başarılı (Vault 25, canonical 10, Master Key 8). Hata logları beklenen negatif senaryolardır. Gerçek Docker/PostgreSQL üretim entegrasyonu henüz doğrulanmadı.

> İkinci paket: `1986f46` — `.db_config.json` atomik yazımında dosya fsync + desteklenen dosya sistemlerinde dizin fsync; `markSetupCompleted()` artık atomik yazıcıyı kullanıyor. `dde14d9` — fsync, 0600 izin ve JSON içeriği regresyon testi. Son başarılı test 43/43; yeni hedef 44/44, henüz doğrulanmadı.

> İkinci paket devamı: `a53d302` kurulum tamamlandı durumunu yalnızca geçerli runtime config atomik biçimde kaydedildikten sonra işaretler, hata durumunda istisna yükseltir. `27eaa9b` eksik config ve rename başarısızlığı için iki regresyon testi ekler. Toplam hedef 46 test, henüz çalıştırılmadı. Davranış değişikliği nedeniyle kurulum akışının entegrasyon testi ayrıca gereklidir.

> VPS izole checkout doğrulaması (`73523f0`): TypeScript başarılı; 3 Vitest dosyası, 46/46 test geçti (Vault 28, canonical 10, Master Key 8). Eksik config ve rename hatası stack trace'leri kasıtlı negatif test senaryolarıdır. Canlı dağıtım veya kurulum entegrasyon testi yapılmadı.

> Üçüncü paket ön inceleme: kurulum tamamlanması için bozuk JSON, eksik DB koordinatları ve başarılı kayıtta plaintext parolanın temizlenmesi senaryolarına regresyon testleri önerildi. GitHub'a test ekleme işlemi güvenlik kontrolü tarafından engellendi; hiçbir test eklenmiş sayılmıyor. Son doğrulanan sayı 46/46, yeni test çalıştırma talebi yok. Önceki kod değişiklikleri korunuyor.

> Yeni toplu regresyon paketi: `1c5cdbd` dosya fsync hatasında mevcut runtime config ve geçici dosya temizliği; `b3532f0` bozuk JSON ile kurulum tamamlanmasının reddi; `1f30b5a` eksik host bilgisinde kurulum tamamlanmasının reddi. Son başarılı 46/46, yeni hedef 49/49. Bu üç yeni test henüz çalıştırılmadı. Canlı sunucu ve main değişmedi.

> VPS izole checkout doğrulaması (`741b11e`): TypeScript başarılı; Vitest 3 dosya, 49/49 test başarılı (Vault 31, canonical 10, Master Key 8). Bozuk JSON, eksik DB koordinatları, disk fsync ve rename başarısızlığı logları beklenen negatif test çıktılarıdır. Üretim entegrasyon testi ve canlı dağıtım yapılmadı.

> Dördüncü paket: `443e72a` kurulumun başarılı tamamlanması ve runtime config içinden legacy plaintext parolanın çıkarılması; `3b26772` kurulum tamamlama commit hatasında disk üzerinde completed=true yazılmaması. Önceki doğrulama 49/49, yeni hedef 51/51. Yeni testler henüz çalıştırılmadı. Canlı kurulum entegrasyonu ayrıca bekliyor.

> VPS izole checkout (`b9e7d08`) doğrulaması: `npm run type-check` başarılı; Vitest 3 dosya, 51/51 başarılı (Vault 33, canonical 10, Master Key 8). Loglardaki hatalar beklenen negatif test senaryolarıdır. Canlı dağıtım ve uçtan uca kurulum entegrasyon testi yapılmadı.

> Beşinci paket: `bc91801` Vault migration sırasında `.db_config.json` scrub işlemi atomik geçici dosya, fsync ve rename ile yapılıyor; `b543507` scrub hatasının sessizce yutulmasını kaldırıp hata yükseltiyor. Son doğrulanan test sayısı 51/51 (`b9e7d08`); yeni değişiklikler için TypeScript ve 51 test yeniden çalıştırılmalı. **Bu kod yolu için doğrudan hata enjeksiyonu testi henüz eklenmedi; ayrıca entegrasyon doğrulaması gerekiyor.** Canlı Docker ve main değişmedi.

> VPS izole checkout doğrulaması (`7c7126d`): TypeScript başarılı; Vitest 3 dosya, 51/51 başarılı (Vault 33, canonical 10, Master Key 8). Yeni migration scrub kodu mevcut testlerle uyumlu; scrub rename/fsync başarısızlığına özel yeni regresyon testi henüz yok. Canlı dağıtım yapılmadı.

> Altıncı toplu paket: `f0a2900` metadata korunması; `6a8252f` kurulum fsync hatasında eski config korunması; `0467eeb` fsync hatasında temp dosya temizliği; `ac372fd` null config reddi; `d4aad25` boş veritabanı adının reddi. Son doğrulanan 51/51; yeni hedef 56/56. Yeni testler henüz çalıştırılmadı. Vault migration scrub için doğrudan hata enjeksiyonu testleri ayrıca bekliyor.

> İzole VPS checkout `4ae9493`: `npm run type-check` başarılı; Vitest 3 dosya, 56/56 başarılı (System Secrets 38, Canonical 10, Master Key 8). Beş yeni test doğrulandı. Vault migration scrub hata enjeksiyonu testleri henüz bekliyor. Canlı Docker veya main değiştirilmedi.

> Yedinci paket (`1b1249b`): array, number, boolean, eksik database ve eksik host içeren runtime config girdileri için 5 regresyon testi eklendi. Önceki 56/56 doğrulandı, yeni hedef 61/61. Vault migration scrub hata enjeksiyonu testleri hâlâ yapılacak; bu paket doğrudan o yolu sınamıyor. Canlı ortam ve main değişmedi.

> Sekizinci paket: `3d87e44` için izole VPS TypeScript ve Vitest 61/61 başarılı. Nginx hassas dosya probe engelleme regexindeki iki kat ters eğik çizgi `7069a1f` ile düzeltildi; 5 bağımsız statik regresyon testi `ba5d319` ile eklendi ve `adebf9f` ile güvenlik test paketine alındı. Hedef 66 test. Nginx gerçek konfigürasyon doğrulaması (`nginx -t`) ve HTTP entegrasyon testi ayrıca gerekli. Canlı VPS/main değişmedi.

> Dokuzuncu paket: izole VPS `ebb310e` üzerinde TypeScript ve 66/66 test başarılı. `TRUST_PROXY=true` VPS üretiminde herkesi güvenilir proxy sayma riskini önlemek üzere `trustProxyPolicy.ts` eklendi ve `server.ts` bağlandı (`cacde04`). Altı yeni regresyon testi (`a4de443`) test paketine dahil (`b71a29d`). Hedef 72 test; henüz doğrulanmadı. Kalan öncelik: istek başına IP rate limit, WebSocket yetkilendirme, SSRF ve gerçek HTTP/Nginx entegrasyon testleri. Canlı ortam/main değişmedi.

> Toplu HTTP koruma paketi: kullanıcı `98b231b` sürümünde 72/72 testin geçtiğini bildirdi. `fe2674c` HTTP/WS Origin ayrıştırmasını katılaştırdı; `b94580f` 9 senaryo ekledi; `9649003` Nginx API/WS IP bazlı istek ve bağlantı sınırları getirdi; `479b7ec` 4 yeni statik regresyon testi ekledi. Toplam hedef 85 test. Bunlar henüz çalıştırılmadı; `nginx -t` ve gerçek HTTP yük testi ayrıca gerekli. Açık incelemeler: SSRF/dış bağlantılar, WebSocket protokolü ve yetkilendirme, Docker çalışma zamanı/SSH kontrolleri. `main` ve canlı sistem değiştirilmedi.

> WebSocket endpoint paketi: `c57e5d0` ile sunucuda yalnızca `/ws` ve `/api/ws` upgrade yolları kabul ediliyor; `29522f7` Nginx rotasını aynı kural ile eşledi; `cd47c02` 7 regresyon testi ekledi, `2120710` test konfigürasyonuna aldı. Önceki doğrulanmış 72 test üzerine 20 yeni test eklenmiş durumda (hedef 92). Bu paket henüz test edilmedi. SSRF ve Docker/SSH üretim çalışma zamanı incelemeleri açık; gerçek Nginx ve HTTP entegrasyon testleri ayrıca gerekli. Canlı/main değiştirilmedi.

> Docker/Nginx paketi: `9e46f5d` Nginx konfigürasyonuna yanlışlıkla yazılan literal `\\n` karakterlerini gerçek satır sonuna çevirdi ve genel HTTP `location /` sınırlarını ekledi. Bu hata düzeltilmeden `nginx -t` başarısız olabilirdi. `b468dda` app için `no-new-privileges`, `cap_drop: ALL`, PID limiti ve init; proxy için daraltılmış yetkiler ekledi. `d7e0349` sekiz Docker regresyon testi ekledi; `f13286e` test paketine aldı. Son doğrulanan 72 üzerine 28 yeni test, hedef 100. Henüz derleme, Nginx veya Docker Compose çalışma zamanı testi yapılmadı. `nginx -t`, `docker compose config -q`, container başlatma ve ağ kontrolleri üretim öncesi zorunlu. SSRF/dış bağlantı ve SSH konuları hâlâ açık; sağlayıcı abuse nedeni kanıtlanmış değil. `main` ve canlı sunucu değişmedi.

> SSH tüneli kritik düzeltme (2026-10-11): `4ed897d` SSH yönetim uç noktalarında dev/preview, DB kesintisi veya kurulum tamamlanmaması nedeniyle anonim erişim istisnasını kaldırdı. Yalnızca geçerli setup/recovery token veya admin oturumu yetkilidir. `aa81972` ve `45d450a` iki ayrı `isSshTunnelAllowed()` uygulamasında VPS/production için `ENABLE_SSH_TUNNEL=true` gibi override'ları da reddeder. Bu değişiklikler **henüz type-check/entegrasyon testinden geçmedi**. SSH tüneli test ve kurulum akışı, gerçek dev bağlantıları ve olası SSRF/outbound tarama yüzeyi ayrıca kontrol edilmeli. Son doğrulanmış durum 100/100 + Nginx syntax başarılıdır; son üç commit doğrulanmadı. `main` ve canlı sistem değiştirilmedi.
