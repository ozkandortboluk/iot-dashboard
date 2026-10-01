# NexusNode IoT — Agent Contract

Amaç: **az token, doğru dosya, çakışmasız çoklu ajan çalışması.**

## Zorunlu akış
1. `docs/project-map.md` içinden görev alanını seç.
2. Yalnız seçilen `docs/maps/*.md` haritasını oku.
3. `docs/working.md` içinde aktif claim/handoff kontrol et.
4. Roadmap görevi varsa `PROJECT_ROADMAP.md` içinde yalnız ilgili maddeyi oku.
5. Önce haritadaki en küçük kaynak kümesini incele; gerekirse hedefli genişlet. Tüm repo/test/roadmap/changelog taraması varsayılan değildir.
6. Yazmadan önce `working.md` içine claim bırak; aynı dosyada başka aktif claim varsa paralel yazma.
7. Bitince claim'i kaldır; commit SHA + değişen dosyalar + test + kısa özet + review isteğiyle handoff bırak.

## Claim / handoff
```text
CLAIM: <task> | <agent> | <base-sha> | <status> | <files/scope>
HANDOFF: <task> | <commit-sha> | <changed> | <tests> | <summary> | <review/blocker>
```

`working.md` geçici RAM'dir; geçmiş tutmaz. Kalıcı karar/kanıt roadmap veya `tamamlanan_islemler.md` içine gider.

## Project Map freshness — zorunlu
Yeni route, service, repository, ana component, worker, API/protokol veya özellik akışı eklenir/taşınır ya da çağrı zinciri değişirse aynı değişiklikte:
- ilgili `docs/maps/<alan>.md` güncellenir;
- yeni alan/problem sınıfı oluştuysa `docs/project-map.md` router'ı da güncellenir.

Sadece CSS/metin veya rota değiştirmeyen küçük refaktör map güncellemesi gerektirmez. Harita kod özeti değil navigasyondur; kısa tutulur.

## Roadmap
Ayrıntılı kural: `docs/kurallar.md`.
- `☐ ☐ ☐` açık/ret
- `☑ ☐ ☐` AI Studio uyguladı, Codex bekliyor
- `☑ ☐ ☑` Codex hedefli revizyon istedi
- `☑ ☑ ☐` Codex kabul etti

AI Studio ikinci kutuyu işaretlemez. `☑ ☐ ☑` revizyonları önceliklidir. Aynı teknik sorun için ikinci aktif görev açılmaz.

## Değişmezler
- P0 güvenlik/tenant izolasyonu; P1 çalışan uygulama/veri bütünlüğü önceliklidir.
- Production'da demo/test seeding ve güvenlik bypass'ı yok.
- Secret/parola/token/private key doküman veya loga yazılmaz.
- Çalıştırılmayan test geçmiş sayılmaz; test kapsamı riske orantılıdır.
- API/telemetri/cihaz protokolü değişirse ilgili Help/OpenAPI/örnek istemciler kontrol edilir.
- Küçük bug/UI/CSS için otomatik version bump yok; bump yapılırsa version kaynakları senkron tutulur.
- Yazmadan önce güncel HEAD/blob SHA kontrol edilir; başka ajanın değişikliği ezilmez.

Çakışma önceliği: `AGENTS.md` → `docs/kurallar.md` → ilgili roadmap maddesi → kaynak kod/test.
