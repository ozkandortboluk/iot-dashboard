# Codex VPS Yönetim Sistemi — İş İlerleme Kaydı

> Bu dosya kesinti sonrası devam edebilmek için tutulur. Her yeni Codex oturumu önce `IMPLEMENTATION_PROMPT.md` ve bu dosyayı okumalı, sonra Git durumuyla karşılaştırmalıdır. Secret, token, parola veya hassas üretim verisi yazmayın.

## Görev

- **Prompt:** `src/codex/IMPLEMENTATION_PROMPT.md`
- **Prompt sürümü:** 1
- **Durum:** NOT_STARTED
- **Aktif faz:** Faz 0 — Keşif
- **Branch:** docs/codex-vps-implementation-prompt (başlangıç talimatı PR dalı; uygulama çalışması ayrı feature branch üzerinde yapılmalı)
- **Son bilinen commit:** 5af609ec6973bc8882050e1cf12f6190121d3adc
- **Son güncelleme:** PR oluşturulurken başlatıldı; uygulama Codex'i gerçek zamanı kaydetmeli.

## Keşif özeti

- Henüz yapılmadı. Antigravity Codex, repository'yi salt okunur inceleyip bulguları buraya eklemeli.
- Üretim VPS'si incelenmiş değildir; sunucu durumu hakkında varsayım yapılmamalı.

## Tamamlanan adımlar

- [x] Uygulama talimatı ve kesinti sonrası devam sözleşmesi eklendi.
- [ ] Git çalışma ağacı ve branch durumu doğrulandı.
- [ ] Repository mimarisi ve mevcut test komutları keşfedildi.
- [ ] Mevcut secrets, backup, rollback, update ve security-audit düzeni kaynak koddan incelendi.
- [ ] Keşif raporu ve uygulama planı hazırlandı.
- [ ] Faz 1–6 tamamlandı ve yerel test kanıtları raporlandı.

## Sonraki tek somut adım

Antigravity içindeki Codex, bu dosya ve `IMPLEMENTATION_PROMPT.md` dosyasını okuyup repository durumunu salt okunur incelemeli. Önceki kullanıcı değişikliklerini korumalı; keşif raporu oluşturmadan dosya değiştirmemeli.

## Değiştirilen dosyalar

- `src/codex/IMPLEMENTATION_PROMPT.md` — ana uygulama talimatı, güvenlik sınırları ve resume workflow.
- `src/codex/WORK_PROGRESS.md` — bu ilerleme kaydı.

## Test kanıtları

- Test çalıştırılmadı. Bu PR yalnızca talimat ve checkpoint dokümantasyonu içerir.
- GitHub üzerinde test çalıştırılmayacak.

## Açık riskler / onay bekleyenler

- Üretim VPS'si salt okunur olarak dahi incelenmedi.
- Codex CLI sürümü, kimlik doğrulama, systemd entegrasyonu ve Telegram secret yöntemi doğrulanmadı.
- Herhangi bir VPS kurulumu, servis etkinleştirme, gerçek Telegram mesajı, merge, push veya deployment için ayrıca açık kullanıcı onayı gerekir.

## Oturum devir notu

Yeni oturum başladığında gerçek `git status`, aktif dal, son commit ve diff ile bu dosyadaki durumu karşılaştır. Uyuşmazlık varsa önce güvenli biçimde uzlaştır; hiçbir dosyayı resetleme veya üzerine yazma. Sonraki adım alanını her anlamlı ilerlemeden sonra güncelle.
