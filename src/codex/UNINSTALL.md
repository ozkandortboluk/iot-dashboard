# Codex eklentisini ayırma

Codex özellikleri `src/codex/` altında tutulur. Ana uygulamadaki kayıt noktaları özellikle az tutulmuştur:

1. `src/App.tsx` içindeki `ADMIN_PLUGINS_TAB` importunu, tab title kaydını ve render satırını kaldırın.
2. `src/components/Sidebar.tsx` içindeki `ADMIN_PLUGINS_TAB` importunu ve Eklentiler navigation item'ını kaldırın. `src/lib/permissions.ts` içindeki admin tab ID kaydını da kaldırın.
3. `src/server/routes/system.ts` içindeki `codexAdminRouter` import/mount satırını ve `codex_monitor_config` generic settings görünürlük/yazma korumalarını kaldırın.
4. `src/codex/` dosyalarını silmeden önce `rg "codex_monitor_config|ADMIN_PLUGINS_TAB|CODEX_PLUGIN_NAME|codexAdminRouter" src` ile başka referans kalmadığını doğrulayın. Bu PR yeni npm dependency, DB migration, servis veya package script eklemez.

DB'de daha önce kaydedilmiş `codex_monitor_config` varsa onu otomatik silmeyin; ayar etkisiz orphan olarak kalabilir. Silmek gerekirse ayrı, backup doğrulaması ve kullanıcı onayı olan bir data-cleanup işlemi planlayın.

`scripts/smoke-test.mjs` içindeki erken hata cleanup düzeltmesi Codex eklentisine bağlı değildir; eklentiyi kaldırırken bu genel smoke-test iyileştirmesini koruyun. Bu PR herhangi bir systemd servisi kurmadığı için durdurulacak/disable edilecek Codex servisi yoktur.
