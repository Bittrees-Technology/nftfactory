#!/usr/bin/env bash
# Install the separately staged, locked indexer runtime. Never reset existing data.
set -euo pipefail
[[ $(id -u) = 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
stage=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
[[ -f "$stage/indexer-release/node_modules/.prisma/client/index.js" ]]
[[ -s "$stage/nftfactory-indexer.env" ]]
[[ $(stat -c %a "$stage/nftfactory-indexer.env") = 600 ]]
printf '%s  %s\n' fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6 "$stage/nftfactory-runtime/node.tar.xz" | sha256sum -c -
[[ ! -e /opt/nftfactory-indexer && ! -e /etc/nftfactory-indexer ]] || {
  echo 'An installation already exists. Refusing to overwrite it; inspect and upgrade explicitly.' >&2; exit 1;
}
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y --no-install-recommends postgresql-16 postgresql-client-16
systemctl start postgresql
if runuser -u postgres -- psql -Atqc "SELECT 1 FROM pg_database WHERE datname='nftfactory_app' UNION ALL SELECT 1 FROM pg_roles WHERE rolname='nftfactory_app'" | grep -q 1; then
  echo 'An NFTFactory database or role already exists. Nothing will be reset.' >&2; exit 1
fi
id nftfactory-indexer >/dev/null 2>&1 || useradd --system --home-dir /var/lib/nftfactory-indexer --no-create-home --shell /usr/sbin/nologin nftfactory-indexer
install -d -m 0700 /etc/nftfactory-indexer
install -m 0600 "$stage/nftfactory-indexer.env" /etc/nftfactory-indexer/service.env
install -d -m 0755 /opt/nftfactory-indexer /opt/nftfactory-node24
tar -xJf "$stage/nftfactory-runtime/node.tar.xz" -C /opt/nftfactory-node24 --strip-components=1
cp -a "$stage/indexer-release/." /opt/nftfactory-indexer/
chown -R root:root /opt/nftfactory-indexer /opt/nftfactory-node24
chmod -R go-w /opt/nftfactory-indexer /opt/nftfactory-node24
install -d -m 0750 -o nftfactory-indexer -g nftfactory-indexer /var/lib/nftfactory-indexer /var/lib/nftfactory-indexer/data
install -d -m 0700 /var/backups/nftfactory-indexer
# Generated hex password is validated before being passed to the local database.
set -a
source /etc/nftfactory-indexer/service.env
set +a
db_password=${DATABASE_URL#postgresql://nftfactory_app:}
db_password=${db_password%@127.0.0.1:5432/nftfactory_app}
[[ "$db_password" =~ ^[a-f0-9]{64}$ ]]
runuser -u postgres -- psql -v ON_ERROR_STOP=1 <<SQL
CREATE ROLE nftfactory_app LOGIN PASSWORD '$db_password';
CREATE DATABASE nftfactory_app OWNER nftfactory_app;
SQL
export PATH=/opt/nftfactory-node24/bin:/usr/bin:/bin
cd /opt/nftfactory-indexer
runuser -u nftfactory-indexer --preserve-environment -- node node_modules/prisma/build/index.js migrate deploy --schema services/indexer/prisma/schema.prisma
cat > /etc/systemd/system/nftfactory-indexer.service <<'UNIT'
[Unit]
Description=NFTFactory profile and discovery API
After=network-online.target postgresql.service
Wants=network-online.target
Requires=postgresql.service
[Service]
User=nftfactory-indexer
Group=nftfactory-indexer
WorkingDirectory=/var/lib/nftfactory-indexer
EnvironmentFile=/etc/nftfactory-indexer/service.env
Environment=PATH=/opt/nftfactory-node24/bin:/usr/bin:/bin
ExecStart=/opt/nftfactory-node24/bin/node --import /opt/nftfactory-indexer/node_modules/tsx/dist/loader.mjs /opt/nftfactory-indexer/services/indexer/src/indexer.ts
Restart=on-failure
RestartSec=5
UMask=0027
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
CapabilityBoundingSet=
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
ReadWritePaths=/var/lib/nftfactory-indexer
MemoryMax=768M
[Install]
WantedBy=multi-user.target
UNIT
install -m 0700 "$stage/backup-acer-indexer.sh" /usr/local/sbin/nftfactory-indexer-backup
cat > /etc/systemd/system/nftfactory-indexer-backup.service <<'UNIT'
[Unit]
Description=Back up NFTFactory database and profile files locally
After=postgresql.service
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/nftfactory-indexer-backup
UMask=0077
UNIT
cat > /etc/systemd/system/nftfactory-indexer-backup.timer <<'UNIT'
[Unit]
Description=Daily NFTFactory local backup
[Timer]
OnCalendar=*-*-* 04:30:00
Persistent=true
RandomizedDelaySec=15m
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now nftfactory-indexer.service nftfactory-indexer-backup.timer
curl --fail --silent --show-error --retry 15 --retry-connrefused --retry-delay 1 --retry-max-time 30 --max-time 10 http://127.0.0.1:8787/health -o /dev/null
/usr/local/sbin/nftfactory-indexer-backup
rm -f "$stage/nftfactory-indexer.env"
echo 'NFTFactory profile service is running; first local backup completed.'
