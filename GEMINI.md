# Gemini / Google AI Studio Bootstrap

Bu dosya kısa tutulur. **Ana kuralların kaynağı `AGENTS.md` dosyasıdır; burada kopyalanmaz.**

Google AI Studio / Gemini her yeni görevde kullanıcı ayrıca hatırlatmasa bile şu akışı uygular:

1. `AGENTS.md` kurallarını uygula.
2. `docs/project-map.md` üzerinden görev için en küçük ilgili modülü/problem rotasını bul.
3. `docs/working.md` içinde aktif claim veya Codex revizyonu var mı kontrol et.
4. Roadmap görevi varsa `docs/PROJECT_ROADMAP.md` içinde yalnız ilgili maddeyi oku.
5. Yazmadan önce `docs/working.md` Active Claims alanında `AI-STUDIO` sahipliği bırak.
6. Tüm repository'yi varsayılan olarak tarama; önce yalnız ilgili kaynak dosyalarını incele. Kanıt gerektirirse kapsamı kontrollü genişlet.
7. Kod değişikliğini ve göreve uygun testleri tamamla.
8. Roadmap'te yalnız AI Studio uygulama durumunu güncelle. Codex onay kutusunu işaretleme.
9. `docs/working.md` içine commit SHA + değişen dosyalar + test sonucu + kısa özet + Codex'in kontrol edeceği noktalarla `AI Studio → Codex` handoff bırak.
10. İş bitince aktif claim'i kaldır.

## Öncelik

- `☑ ☐ ☑` durumundaki Codex revizyonları öncelikli düzeltmedir.
- `P0` güvenlik ve tenant izolasyonu, ardından `P1` çalışan uygulama/veri bütünlüğü gelir.
- Mevcut kabul edilmiş alt kapsam sebepsiz yeniden yazılmaz.
- Aynı teknik sorun için ikinci bağımsız roadmap maddesi oluşturulmaz.

## Yasaklar

- Sırf bağlam toplamak için tüm `src/`, tüm testler, tüm roadmap veya changelog okunmaz.
- `docs/working.md` içinde başka ajanın aktif sahip olduğu dosya paralel değiştirilmez.
- Parola, token, private key veya gerçek secret dokümanlara/loglara yazılmaz.
- Çalıştırılmayan test başarılı gösterilmez.

Çakışma halinde: `AGENTS.md` → `docs/kurallar.md` → ilgili roadmap maddesi sırası geçerlidir.
