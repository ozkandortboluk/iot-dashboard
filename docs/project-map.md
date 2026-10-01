# NexusNode IoT — Project Router

> Yalnız doğru alt haritayı seç. Bu dosya kaynak kod özeti değildir.

| Sorun / görev | Oku |
|---|---|
| Login, session, cookie, setup, recovery | [maps/auth.md](maps/auth.md) |
| PostgreSQL, migration, schema, SSH tunnel, backup | [maps/database.md](maps/database.md) |
| Telemetry, WebSocket, cihaz, command | [maps/iot.md](maps/iot.md) |
| Offline algılama, alarm, notification, email | [maps/notifications.md](maps/notifications.md) |
| Firmware, compiler, OTA | [maps/ota.md](maps/ota.md) |
| Docker, Nginx, health, runtime, secrets, CI | [maps/deployment.md](maps/deployment.md) |
| React UI, dashboard, navigation, component | [maps/frontend.md](maps/frontend.md) |

## Router kuralı
- Önce tek alt haritayı aç; çapraz alan kanıtı varsa ikinci haritaya geç.
- Dosyanın yeri bilinmiyorsa alt haritadan sonra hedefli sembol/isim araması yap.
- `app/applet/` kopyalarını aktif import/build kanıtı olmadan ana `src/` ile eşdeğer sayma.
- Yeni ana problem alanı oluşursa bu tabloya ekle.

## Map freshness
Yeni route/service/repository/ana component/worker/API-protokol/özellik akışı ekleme-taşıma veya çağrı zinciri değişikliğinde ilgili `maps/*.md` aynı committe güncellenmelidir. Yeni problem alanı oluşursa bu router da güncellenir. CSS/metin ve rota değiştirmeyen küçük refaktörlerde güncelleme gerekmez.
