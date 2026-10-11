# VPS abuse prevention — safe deployment plan

Status: **preparation only**. This branch does not remediate an already-compromised host.

## Incident gate (mandatory)
- Ask provider for timestamped outbound flow samples, IP allocation history, and isolated rescue access.
- Preserve disk and logs before cleanup; never assume the provider.tools reputation report proves compromise.
- If compromise is established, rebuild from a trusted image and rotate SSH credentials, application secrets, database credentials and tokens from a clean workstation. Restore only reviewed data.
- Never reconnect a suspect VPS to production merely because a firewall rule was added.

## Existing controls confirmed in repository
- Dockerfile runtime uses unprivileged `node` user.
- Compose publishes app, PostgreSQL and Adminer to localhost by default; verify deployed overrides.
- Docker services share a bridge network; further isolation needs application connectivity testing.

## Safe implementation sequence
1. Run `bash scripts/security/audit-host.sh` **only on a trusted/recovered host**; inspect results privately. It is read-only.
2. Review Docker capabilities, read-only filesystem feasibility, resource limits, healthchecks, volumes, exposed ports and reverse proxy configuration.
3. Design outbound allowlists based on observed legitimate DNS, NTP, update, telemetry, SMTP, SSH tunnel and application requirements. Include IPv4/IPv6, Docker FORWARD and DOCKER-USER/nftables. Start in log-only mode; never apply blanket OUTPUT DROP remotely.
4. Harden SSH with keys and tested secondary console access, then enable changes with an automatic rollback timer and explicit confirmation.
5. Add alerting for anomalous outbound connections and container changes, with off-host delivery.
6. Validate with `docker compose config`, build/tests, DNS, HTTPS, database connectivity, backups, SSH reconnection, and negative outbound tests before production rollout.

## Guardrails
- No Docker socket mount into the app, no privileged containers, no secrets in Git or diagnostic output.
- Do not automatically mutate host firewall/SSH rules from app startup or routine `docker compose up`.
- Review the live host separately; code review cannot establish the origin of the abuse report.
