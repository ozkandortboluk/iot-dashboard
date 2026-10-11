# Güvenlik dalı — iş akış ağacı

> **📍 ŞU ANKİ KONUM: 05 — Master key risk incelemesi; 40 test toplu doğrulama bekliyor**
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
│   ├── npm run type-check (99c4359)                       ✅
│   ├── İzole Vault testleri (99c4359: 37/37)              ✅
│   ├── Üç yeni regresyon testi (34/34 geçti)              ✅
│   ├── İlk parola rollback testi (35/35 geçti)            ✅
│   ├── Master key kalıcılık kategorisi (2/2 geçti)        ✅
│   ├── Restart, yarış ve izin testleri (3 yeni test)       ⏳
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

