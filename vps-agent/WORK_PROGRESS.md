# VPS Agent — İlerleme durumu

## Durum
- Aşama: bağımsızlaştırma ve adlandırma.
- Durum: IN_PROGRESS — kod değişiklikleri hazırlanıyor; yerel doğrulama henüz yapılmadı.
- Üretim VPS'sine erişilmedi; canlı değişiklik yapılmadı.
- GitHub üzerinde test çalıştırılmadı.

## Bu değişiklikte hedeflenenler
- NexusNode Codex adını VPS Agent olarak değiştirmek.
- Kod ve belgeleri src/codex yerine repository kökündeki vps-agent/ altında toplamak.
- Ana uygulama UI/API/permission/DB ayar bağlantılarını kaldırmak.
- VPS Agent için ayrı paket ve test yapılandırması eklemek.
- Yetkinlikler, olmayan özellikler, güvenlik sınırları ve kaldırma yöntemini belgelemek.

## Sonraki adım
Yerel Windows/Antigravity çalışma alanında branch'i al; diff'i incele; bağımsız test ve ana uygulama type-check/build'i yerel ortamda çalıştır. Gerçek sonuçları bu dosyaya kaydet. Hiçbir şeyi merge veya canlıya dağıtma.
