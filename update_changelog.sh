cat << 'INNER' > prepend.md
## v1.9.8
* **Bugfix (Critical):** Veritabanı (PostgreSQL) işlemlerindeki tüm sessiz yutulan hatalar (catch(() => {})) giderilmeye devam edildi. (Telemetry ve upsert işlemleri için).

INNER
cat CHANGELOG.md >> prepend.md
mv prepend.md CHANGELOG.md
