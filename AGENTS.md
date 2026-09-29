# Project Guidelines & Autonomous Developer Rules

## KURAL 1: Anlamlı ve Planlı Sürümleme Politikası (Selective Semantic Versioning)

1. **Küçük Değişikliklerde Sürüm Yükseltme Yapılmaz**:
   - Her küçük UI düzeltmesi, CSS/stil rötuşu, ufak hata giderimi (bugfix) veya tekil refaktör için **ayrı bir sürüm numarası yükseltilmez**.
   - Küçük düzeltmeler ve ara ayarlamalar, sürüm yükseltilmesi gereken anlamlı kilometre taşlarının (büyük özellikler, yeni modüller, mimari güncellemeler veya konsolide yayınlar) altına iliştirilir.
2. **Sürüm Yükseltme Kriterleri**:
   - Sürüm yükseltme yalnızca aşağıdaki durumlarda gerçekleştirilir:
     - **PATCH bump (`x.y.Z`)**: Kritik güvenlik yamaları veya toplu/konsolide hata düzeltme paketleri yayınlandığında.
     - **MINOR bump (`x.Y.0`)**: Yeni bir özellik, yeni bir API uç noktası, yeni bir görünüm veya kapsamlı işlevsellik eklendiğinde.
     - **MAJOR bump (`X.0.0`)**: Geriye dönük uyumsuz köklü mimari veya veritabanı şema değişikliklerinde.
3. **Senkronize Sürüm Güncelleme**:
   - Bir sürüm yükseltildiğinde `package.json`, `src/config/version.ts` ve `CHANGELOG.md` dosyaları birbiriyle tam senkron tutulur.
   - `CHANGELOG.md` gereksiz mikro-girdilerle şişirilmez; yapılan işler sade, derli toplu ve anlamlı başlıklar altında özetlenir.
4. **Bileşenlerde Sabit Sürüm Metni Bulunamaz**:
   - Tüm UI bileşenleri sürüm bilgisini `src/config/version.ts` dosyasından içe aktarır.

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

