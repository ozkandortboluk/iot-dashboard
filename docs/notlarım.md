
-------güvenli güncellme-----------

cd /opt/iot-dashboard/iot-dashboard || exit 1

git status --short  
sudo bash ./vps-update.sh --check
---------------



bir saha cihazı mybattery adında bir metrik gönderiyorsa o cihaz pile baglı çalışan bir cıhaz oldugu anlaşılmalı ve cihazlar ekranında ona göre fiş işareti yerine batarya işareti cıkmalı