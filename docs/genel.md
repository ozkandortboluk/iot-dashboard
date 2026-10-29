# Genel Bekleyen İşler

> Bu dosyada yalnızca henüz tamamlanmamış işler bulunur. Tamamlanan maddeler buraya eklenmez. Canlı sistem veya yetkili operatör gerektiren işler kanıtsız biçimde kapatılmaz.
>
> Her PR kapatıldığında, o PR'dan kalan açık işler PR numarası veya bağlantısı olmadan buraya aktarılır. Tamamlanmış maddeler bu dosyadan çıkarılır; aktarılacak iş yoksa dosya değiştirilmez.

## Güvenlik ve Git geçmişi

- [ ] Yetkili operatör güvenli kanaldan doğrulasın: tarihsel Git commit'lerinde görülen PostgreSQL bağlantı bilgisi hâlen geçerli mi? Gerekirse credential'ı rotasyona tabi tut.
- [ ] Rotasyon sonrası erişilebilir Git ref'lerinde redakte edilmiş secret taraması yap. Secret değerini rapora/loglara koyma. Geçmişi yeniden yazma veya ref silme için ayrıca yetki al.

## VPS agent kilit kurtarma

- [ ] `origin/refactor/vps-agent-isolation` dalındaki `vps-agent/core/lock.ts` için stale lock'a karşı güvenli operatör kurtarma yolu veya eşzamanlılığa dayanıklı otomatik kurtarma tasarla.
- [ ] Ölü PID, canlı PID'nin korunması, eşzamanlı kurtarma ve süreç çökmesi senaryoları için test yazıp izole ortamda çalıştır.

## Veritabanı parola ve hedef yönetimi

- [ ] Başarısız parola veya aday bağlantı işlemlerinde PostgreSQL rolü, Vault, runtime yapılandırması ve pool tutarlılığını izole veritabanı testleriyle doğrula.
- [ ] Uygulama servisinin host secret dosyasına yazma yollarını ve hata raporlamasını gözden geçir; kapalı route'lar servis düzeyindeki diğer yazma davranışlarını kanıtlamaz.

## Kalıcı bildirim kuyruğu

- [ ] İki worker claim yarışı, lease bitişi, yeniden başlatma ve idempotency davranışını izole PostgreSQL ortamında doğrula; testlerin gerçek çalışma sonucunu kaydet.

## CI

- [ ] `.github/workflows/ci.yml` için otomatik CI sonucu gözlenmeli. GitHub Actions'ı elle çalıştırma; workflow tetikleyicilerini ayrıca karar verilmeden değiştirme.
