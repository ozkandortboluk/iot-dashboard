# VPS Agent — Uygulama talimatı

Bu belge VPS Agent üzerinde çalışan geliştirici ajan için görev sözleşmesidir.

## Değişmez kurallar
- GitHub üzerinde test çalıştırma veya GitHub Actions test workflow'u ekleme.
- Ana uygulamaya entegrasyon ekleme: src/App.tsx, Sidebar, permissions, server routes, root package scripts, Compose, Nginx veya DB schema değişiklikleri bu ajan için yapılmaz.
- VPS Agent yalnız vps-agent/ içinde tutulur; kendi package/config/docs/tests dosyaları dışında değişiklik yapma.
- Canlı VPS'ye erişme, üretimde değişiklik yapma, servis kurma, gerçek Telegram mesajı gönderme, push/merge/deploy, DB/volume/yedek değişikliği yapma.
- Secret, müşteri telemetrisi veya hassas logları dışarı gönderme.
- Shell/process execution, sınırsız sudo/root veya Docker socket erişimi ekleme.
- Şüphede BLOCKED durumunda dur; kullanıcı değişikliklerini reset/clean ile silme.

## Çalışma sırası
1. Git durumu, dal, son commit ve diff'i incele.
2. CAPABILITIES.md, SECURITY.md, ARCHITECTURE.md ve WORK_PROGRESS.md dosyalarını oku.
3. Kaynakta gerçekten var olan yeteneklerle planlanan özellikleri ayır.
4. Yalnız VPS Agent kapsamındaki dosyalarda küçük, gözden geçirilebilir değişiklik yap.
5. Uygun testleri geliştirici makinesinde veya izole ortamda çalıştır; çalıştırılmadıysa başarılı diye raporlama.
6. Sonuç, değişen dosyalar, gerçek test kanıtı, kalan risk ve bir sonraki adımı WORK_PROGRESS.md içine yaz.
7. PR açma/push/merge ve üretim işlemleri için ayrı açık onay bekle.

## Kabul kriterleri
- Ana uygulama hiçbir VPS Agent modülünü import etmez.
- VPS Agent ana uygulamanın modül, veritabanı veya ayar API'sini import etmez.
- Ana uygulama derlemesi ve lifecycle'ı VPS Agent'ın varlığına bağlı değildir.
- Varsayılan mod read-only'dir; başarısız sağlık kontrolü otomatik düzeltme yapmaz.
- Secret ve kişisel veri sızıntısı yoktur.
- Yeteneği olmayan CLI, scheduler, UI veya deploy desteği varmış gibi belgelenmez.
