
-------güvenli güncellme-----------

cd /opt/iot-dashboard/iot-dashboard || exit 1

git status --short  
sudo bash ./vps-update.sh --check
---------------