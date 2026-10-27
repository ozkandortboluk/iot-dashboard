# NexusNode IoT Setup Plugins & Extensibility Architecture

Bu dizin (`scripts/setup/plugins.d/`), NexusNode IoT Cloud kurulum sihirbazına yeni servisler, donanım köprüleri veya altyapı araçları eklemek için tasarlanmış modüler kanca (hook) mimarisidir.

---

## 🚀 Nasıl Çalışır?

Kurulum betiği (`./install.sh`), yaşam döngüsü boyunca belirli aşamalarda bu klasördeki tüm `*.sh` dosyalarını otomatik olarak çağırır:

1. **`pre-install`**: Sistem ve port kontrollerinden hemen önce çalışır.
2. **`pre-start`**: Secretlar, `.env` ve SSL sertifikaları üretildikten sonra, konteynerler ayağa kalkmadan önce çalışır.
3. **`post-start`**: Tüm Docker konteynerleri başarıyla ayağa kalkıp sağlık kontrollerini geçtikten sonra çalışır.

---

## 🛠️ Yeni Bir Eklenti Nasıl Yazılır?

Aşağıdaki şablonu kopyalayıp bu klasöre `20-benim-eklentim.sh` adıyla kaydedin:

```bash
#!/usr/bin/env bash
STAGE="$1"

case "$STAGE" in
  "pre-install")
    echo "Ön hazırlık yapılıyor..."
    ;;
  "pre-start")
    echo "Özel konfigürasyon dosyaları hazırlanıyor..."
    ;;
  "post-start")
    echo "Servis ayağa kalktıktan sonraki işlem (örn: bildirim gönderme)..."
    ;;
esac
```

---

## 💡 Gelecekte Eklenebilecek Örnek Modüller
- **Mosquitto MQTT Broker**: Yerel donanım cihazları için bağımsız MQTT servisi başlatma.
- **Cloudflare Tunnel / Ngrok**: Sabit IP olmayan yerlerde güvenli dış erişim açma.
- **Prometheus & Grafana**: İleri düzey sunucu ve IoT donanım metriği görselleştirme.
- **Telegram / Discord Webhook**: Kurulum veya yedekleme bittiğinde yöneticiye anlık bildirim atma.
