# Codex VPS Yönetim Sistemi — İş İlerleme Kaydı

> Bu dosya kesinti sonrası devam edebilmek için tutulur. Her yeni Codex oturumu önce `IMPLEMENTATION_PROMPT.md` ve bu dosyayı okumalı, sonra Git durumuyla karşılaştırmalıdır. Secret, token, parola veya hassas üretim verisi yazmayın.

## Görev

- **Prompt:** `src/codex/IMPLEMENTATION_PROMPT.md`
- **Prompt sürümü:** 1
- **Durum:** NOT_STARTED
- **Aktif faz:** Faz 0 — Keşif
- **Branch:** docs/codex-vps-implementation-prompt (başlangıç talimatı PR dalı; uygulama aynı PR üzerinde devam eder)
- **Son bilinen commit:** fef936c3899db8787b8ae4b72be2a39dac05370e
- **Son güncelleme:** 2026-10-26; uygulama Codex'i her checkpoint'te gerçek zamanı güncellemeli.

## Keşif özeti

- Henüz yapılmadı. Antigravity Codex, repository'yi salt okunur inceleyip bulguları buraya eklemeli.
- Üretim VPS'si incelenmiş değildir; sunucu durumu hakkında varsayım yapılmamalı.

## Tamamlanan adımlar

- [x] Uygulama talimatı ve kesinti sonrası devam sözleşmesi eklendi.
- [x] İhlal edilemez güvenlik sözleşmesi ve ayrı SECURITY.md eklendi.
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
- `src/codex/SECURITY.md` — zorunlu güvenlik sınırları, onay kapıları ve olay durdurma kuralları.

## Güvenlik güncellemesi

- Varsayılan fail-closed, en az ayrıcalık, dış hedeflere zarar verebilecek işlemlerin yasaklanması, prompt injection savunması, açık onay kapıları, gizlilik/veri minimizasyonu, kaynak/maliyet sınırları ve acil durdurma kuralları eklendi.
- Bu kurallar prompt tek başına mutlak güvenlik garantisi vermez; teknik izin ve ağ izolasyonu da gerektirir.

## Test kanıtları

- Test çalıştırılmadı. Bu PR yalnızca talimat ve checkpoint dokümantasyonu içerir.
- GitHub üzerinde test çalıştırılmayacak.

## Açık riskler / onay bekleyenler

- Üretim VPS'si salt okunur olarak dahi incelenmedi.
- Codex CLI sürümü, kimlik doğrulama, systemd entegrasyonu ve Telegram secret yöntemi doğrulanmadı.
- Herhangi bir VPS kurulumu, servis etkinleştirme, gerçek Telegram mesajı, merge, push veya deployment için ayrıca açık kullanıcı onayı gerekir.

## Oturum devir notu

Yeni oturum başladığında gerçek `git status`, aktif dal, son commit ve diff ile bu dosyadaki durumu karşılaştır. Uyuşmazlık varsa önce güvenli biçimde uzlaştır; hiçbir dosyayı resetleme veya üzerine yazma. Sonraki adım alanını her anlamlı ilerlemeden sonra güncelle.
