# NexusNode IoT VPS Deployment

This guide deploys the application at:

- Application: `https://www.nexusnodeiot.com.tr`
- Database administration: `https://db.nexusnodeiot.com.tr`
- PostgreSQL/TimescaleDB: private by default, reachable through an SSH tunnel

Never commit the VPS `.env`, PostgreSQL password, Adminer Basic Auth file, TLS private keys, or OTA signing keys.

## 1. DNS

Create A records for `@`, `www`, and `db`, all pointing to the VPS public IPv4 address. Add AAAA records only when IPv6 firewall rules are also configured.

## 2. VPS prerequisites

The examples assume Ubuntu/Debian with Docker Engine, the Compose plugin, UFW, Certbot, and `apache2-utils` installed.

Allow only SSH and web traffic permanently:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Do not permanently allow ports 3000, 5432, or 8080.

## 3. Production environment

```bash
cp .env.example .env
chmod 600 .env
```

Set a strong value for `POSTGRES_PASSWORD` in `.env`. Keep these loopback bindings:

```dotenv
APP_URL=https://www.nexusnodeiot.com.tr
PORT_BIND=127.0.0.1:3000:3000
POSTGRES_PORT_BIND=127.0.0.1:5432:5432
ADMINER_PORT_BIND=127.0.0.1:8080:8080
SETUP_REQUIRED=true
```

Validate interpolation without publishing the output:

```bash
docker compose config --quiet
```

## 4. Start private services

The production Nginx configuration requires certificates and the Adminer password file, so start the private services first:

```bash
docker compose up -d timescaledb
docker compose ps
docker compose logs --tail=100 timescaledb
docker compose up -d --build app adminer
```

Check the application locally:

```bash
curl --fail http://127.0.0.1:3000/api/health/live
curl http://127.0.0.1:3000/api/setup/status
```

## 5. TLS certificates

Make sure DNS is already pointing to the VPS and port 80 is free. Obtain one certificate lineage with the exact name expected by Nginx:

```bash
sudo certbot certonly --standalone \
  --cert-name nexusnodeiot.com.tr \
  -d nexusnodeiot.com.tr \
  -d www.nexusnodeiot.com.tr \
  -d db.nexusnodeiot.com.tr
```

Certificates must then exist at:

```text
/etc/letsencrypt/live/nexusnodeiot.com.tr/fullchain.pem
/etc/letsencrypt/live/nexusnodeiot.com.tr/privkey.pem
```

Test automatic renewal:

```bash
sudo certbot renew --dry-run
```

After a renewal, reload the proxy with `docker compose exec proxy nginx -s reload`. Automate that reload with a Certbot deploy hook on the VPS.

## 6. Protect Adminer

Create a separate HTTP Basic Auth credential. This password must be different from the PostgreSQL password:

```bash
sudo install -d -m 750 /etc/nexusnode
sudo htpasswd -c /etc/nexusnode/adminer.htpasswd dbadmin
sudo chmod 640 /etc/nexusnode/adminer.htpasswd
```

The Docker daemon must be able to read this file. If rootless Docker is used, adjust ownership for the rootless Docker account without making the file world-readable.

Start the reverse proxy:

```bash
docker compose up -d proxy
docker compose ps
curl --fail http://127.0.0.1/healthz
```

Verify:

```text
https://www.nexusnodeiot.com.tr
https://db.nexusnodeiot.com.tr
```

Adminer connection fields:

```text
System: PostgreSQL
Server: timescaledb
Username: value of POSTGRES_USER
Password: value of POSTGRES_PASSWORD
Database: value of POSTGRES_DB
```

Adminer is intentionally protected twice: Nginx Basic Auth first and the PostgreSQL login second.

## 7. First-run setup

Open the main site, test the TimescaleDB connection, run the application migrations, verify the canonical schema, and create the real administrator account.

After the setup status reports ready, update the VPS `.env`:

```dotenv
SETUP_REQUIRED=false
```

Then recreate only the application:

```bash
docker compose up -d --force-recreate app
curl --fail https://www.nexusnodeiot.com.tr/api/health/ready
```

Do not run `ddl.sql` or `src/db/timescaledb.sql` manually on a new installation. Use the built-in migration runner.

## 8. Temporary external PostgreSQL access

### Recommended: SSH tunnel

Keep PostgreSQL bound to `127.0.0.1` and run this command from the client computer:

```bash
ssh -L 5433:127.0.0.1:5432 VPS_USER@VPS_IP
```

Connect DBeaver/pgAdmin to:

```text
Host: 127.0.0.1
Port: 5433
Database: iot_dashboard
User: iot_user
SSL: disabled for the local tunnel
```

The database traffic is protected by SSH and port 5432 is never exposed publicly.

### Direct TCP access when absolutely required

First determine the client's fixed public IP. Change only the VPS `.env`:

```dotenv
POSTGRES_PORT_BIND=0.0.0.0:5432:5432
```

Allow exactly that address in both the VPS firewall and the hosting provider firewall:

```bash
sudo ufw allow from CLIENT_PUBLIC_IP to any port 5432 proto tcp
docker compose up -d --force-recreate timescaledb
```

Never add a general `ufw allow 5432/tcp` rule. The current database container does not configure a publicly trusted PostgreSQL TLS certificate, so SSH tunneling remains the preferred method.

Remove direct access immediately after use:

```bash
sudo ufw delete allow from CLIENT_PUBLIC_IP to any port 5432 proto tcp
```

Restore:

```dotenv
POSTGRES_PORT_BIND=127.0.0.1:5432:5432
```

Then:

```bash
docker compose up -d --force-recreate timescaledb
```

## 9. PostgreSQL password rotation

Enter PostgreSQL interactively so the replacement password is not placed directly in shell history:

```bash
docker compose exec timescaledb psql -U postgres -d postgres
```

In `psql`:

```text
\password iot_user
\q
```

Update `POSTGRES_PASSWORD` in the VPS `.env`, then recreate the application:

```bash
docker compose up -d --force-recreate app
```

The official PostgreSQL image uses `POSTGRES_PASSWORD` only while initializing an empty data directory. Changing the environment variable alone does not change the password in an existing database.

## 10. Operational checks

```bash
docker compose ps
docker compose logs --tail=100 app
docker compose logs --tail=100 proxy
curl --fail https://www.nexusnodeiot.com.tr/api/health/live
curl --fail https://www.nexusnodeiot.com.tr/api/health/ready
```

Back up the named TimescaleDB volume regularly and test restoration before relying on those backups.
