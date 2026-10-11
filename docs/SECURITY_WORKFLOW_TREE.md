# Güvenlik dalı — iş akış ağacı

> **📍 ŞU ANKİ KONUM: 04 — Güvenli dosya işlemleri ve hata senaryoları**
>
> Dal: `security/abuse-prevention-audit-20261011`  
> Kapsam: Bu sohbette yürütülen Vault güvenliği ve doğrulama çalışmaları.  
> **Bu belge ilerleme kaydıdır; işaretli adımlar üretim onayı anlamına gelmez.**
>
> **Durumlar:** ✅ Tamamlandı · 🔄 Devam ediyor · ⏳ Bekliyor · ⚠️ Engelli / doğrulama gerekiyor

```text
📍 04 GÜVENLİ DOSYA İŞLEMLERİ — ŞU AN BURADAYIZ
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
├── 04. Hata senaryoları ve güvenli dosya işlemleri         🔄 📍
│   ├── Legacy .db_config.json temizliğini atomik yap       ⚠️
│   ├── Normal config kaydını atomik yap                    ⚠️
│   ├── Vault yazma hatasında eski parolayı koru            ⏳
│   ├── Vault bozuk/okunamıyor durumunda fail-closed        ⏳
│   └── Metadata senkronizasyonu ve kısmi kayıt riski       ⏳
│
├── 05. Doğrulama                                           🔄
│   ├── npm run type-check (a7b3b91)                       ✅
│   ├── İzole Vault testleri (a7b3b91: 27/27)              ✅
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

## Güncelleme kuralı

- Her anlamlı adımda bu dosyanın **en üstündeki 📍 konum** ve ağaçtaki durumlar güncellenir.
- Yalnızca kodun commit edilmesi **test geçti** anlamına gelmez; doğrulama ayrı işaretlenir.
- Engellenen değişiklikler tamamlandı olarak gösterilmez.
- Çalışmalar yalnızca bu güvenlik dalında sürer. `main` ve çalışan Docker ortamı kullanıcı onayı olmadan değiştirilmez.
- Kullanıcıya ilerleme bildirirken bu dosyanın yolu ve mevcut 📍 adımı belirtilir.
