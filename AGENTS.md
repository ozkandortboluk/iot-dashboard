# Project Guidelines & Autonomous Developer Rules

## KURAL 1: Sürümlendirme ve Ortam/GitHub Takip Politikası (Continuous Patch Versioning & Environment Sync)

1. **Dal içi değişiklikler ve ana dala birleştirme sürümü**:
   - Dal içindeki geliştirme ve düzeltmelerde PATCH (`z`) hanesini artır (`x.y.z` -> `x.y.(z+1)`).
   - Bir dal ana dala birleştirilirken MINOR (`y`) hanesini artır ve PATCH hanesini sıfırla (`x.y.z` -> `x.(y+1).0`).
   - Yalnız kapsamlı değişikliklerde veya kullanıcı açıkça istediğinde MAJOR (`x`) hanesini artır (`x.y.z` -> `(x+1).0.0`).
   - Birleştirme öncesinde sürüm artışını bir kez uygula; her commit için ayrı artış yapma.
2. **Senkronize Sürüm Güncelleme**:
   - Her sürüm yükseltildiğinde `package.json`, `package-lock.json`, `src/config/version.ts` ve `CHANGELOG.md` dosyaları birbiriyle tam senkron tutulur.
   - `CHANGELOG.md` dosyasına yapılan işler derli toplu ve anlamlı başlıklar halinde yeni sürüm başlığı altına eklenir.
3. **Bileşenlerde Sabit Sürüm Metni Bulunamaz**:
   - Tüm UI bileşenleri sürüm bilgisini `src/config/version.ts` dosyasından içe aktarır.
4. **Sol Alt Sürüm Kartında Ortam ve GitHub Sürümü Görünür**:
   - Sayfanın sol altındaki sürüm kartında hem o anki çalışma ortamının (Yerel Geliştirme / VPS Sunucu) aktif sürüm numarası hem de GitHub deposundaki son sürüm numarası açıkça gösterilir.
   - Kullanıcı veya operatör, sunucu ya da çalışma ortamında hangi sürümün çalıştığını ve GitHub ile olan farkını (`Yerel +1`, `GitHub ile Eşit` vb.) anında görebilir.

---

## KURAL 2: Yardım & Bilgi Merkezi Canlı Kod Örnekleri (Yardım & Bilgi Merkezi)

1. **Her Zaman Çalışır Kod Blokları (`HelpView.tsx`)**:
   - "Yardım & Bilgi Merkezi" (`HelpView.tsx`), donanım geliştiricileri ve sistem entegratörleri için 100% çalışan, sözdizimi doğrulanmış ve üretime hazır kod bloklarını korumaya devam eder:
     - **ESP32 & NodeMCU (ESP8266) HTTP Telemetri Gönderimi ve Downlink Komut Yanıtı**
     - **ESP32 Periyodik Heartbeat / Ping (`/api/telemetry/ping`)**
     - **ESP32 / ESP8266 Canlı WebSocket İstemcisi**
     - **Kompakt Virgülle Ayrılmış Hızlı Veri Akışı (`/api/v1/telemetry`)**
     - **JSON Telemetri Yükleme (`/api/telemetry`)**
     - **Cihaz Çıkış Kontrol API'si (`/api/devices/:id/control`)**
     - **Python IoT Ajanı ve Node.js / cURL Entegrasyon Scriptleri**
2. **API Güncellemelerinde Senkronizasyon**:
   - Sistemde yeni bir API uç noktası, telemetri formatı veya protokol eklendiğinde `HelpView.tsx` içindeki örnek kodlar güncellenir.

---

## KURAL 3: Test Verisi İzolasyonu ve Production Seeding Koruması

1. **Sabit Kimlik Bilgilerinin Kılavuz/Prompt Dosyalarında Bulunmaması**:
   - `AGENTS.md`, `GEMINI.md` veya proje kök dokümanlarında asla sabit kullanıcı şifreleri, statik API anahtarları veya canlı hesap bilgileri tutulmaz.
2. **Test Verileri Yalnızca CI Fixture'larında Yer Alır**:
   - Test kullanıcıları, sahte cihazlar ve simülasyon parametreleri yalnızca `tests/`, `e2e/` veya CI test fixture ortamlarında tutulmalıdır.
3. **Production Seeding Kesin Olarak Kapalıdır**:
   - Üretim ortamında (`NODE_ENV === 'production'`) veritabanına otomatik demo veya test verisi tohumlama (seeding) yapılması kesin olarak engellenir.
   - Canlı üretim veritabanına yalnızca operatör tarafından yetkilendirilmiş gerçek kullanıcı ve cihaz kayıtları girebilir.

---

## KURAL 4: Yol Haritası (Roadmap) 3 Kutu Durum Takip Sistemi ve Denetim Döngüsü

1. **3 Kutu Durum Anlamları**:
   - `☐ ☐ ☐` → Henüz yapılmadı (Açık iş kalemi).
   - `☑ ☐ ☐` → AI Studio uyguladı, Codex incelemesi bekleniyor.
   - `☑ ☐ ☑` → Codex inceledi ve düzeltme / revizyon istedi (3. kutu denetçinin düzeltme beklediğini, AI Studio'nun bu maddeye tekrar bakması gerektiğini belirtir).
   - `☑ ☑ ☐` → Codex onayladı (Kabul kriterleri başarıyla karşılandı).

2. **Düzeltme ve Tarihçe Koruma Kuralı**:
   - Codex düzeltme istediğinde AI Studio'nun ilk kutucuktaki işareti asla silinmez; 3. kutu işaretlenerek `☑ ☐ ☑` durumuna getirilir. Bu sayede "AI Studio bunu uyguladı" geçmişi korunurken "Codex düzeltme istiyor" durumu net biçimde görünür.
   - AI Studio istenen düzeltmeyi yaptıktan sonra durumu `☑ ☐ ☑` → `☑ ☐ ☐` yapar (3. kutu temizlenir, Codex'in yeniden denetlemesi beklenir).
   - Codex yeniden kontrol edip onay verdiğinde durum `☑ ☑ ☐` olarak tescillenir.
   - AI Studio, 3. kutusu işaretli (`☑ ☐ ☑`) olan tüm maddeleri öncelikli düzeltme bekleyen işler olarak ele alır ve bu maddeleri eksiksiz inceler/düzeltir.

