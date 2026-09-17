#!/usr/bin/env bash
set -euo pipefail
[[ $EUID == 0 ]] || { echo 'Run with sudo on Acer.'; exit 1; }
export PATH=/opt/nftfactory-node24/bin:/usr/sbin:/usr/bin:/sbin:/bin
stage=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
cd "$stage"
sha256sum -c SHA256SUMS
printf '%s  %s\n' c384148ad810f0ac8b869690969052553978c7b86a30749fa987c81f497ec972 /opt/nftfactory-indexer/services/indexer/src/indexer.ts | sha256sum -c -
systemctl is-active --quiet nftfactory-indexer
for chain in 8453 4663; do
 [[ ! -e /etc/nftfactory-indexer/$chain.env && ! -e /etc/systemd/system/nftfactory-indexer-$chain.service ]] || { echo 'A chain installation exists; inspect before proceeding.'; exit 1; }
done
[[ ! -e /etc/systemd/system/nftfactory-indexer.service.d/mainnet-routing.conf && ! -e /etc/systemd/system/nftfactory-chain-router.service ]]
for port in 8790 8791 8792; do
 if ss -lntH | awk '{print $4}' | grep -q ":$port$"; then echo "Port $port already occupied"; exit 1; fi
done
for db in nftfactory_base nftfactory_robinhood; do
 [[ $(runuser -u postgres -- psql -Atqc "SELECT count(*) FROM pg_database WHERE datname='$db'") == 0 ]] || { echo "Database $db already exists; it will not be overwritten."; exit 1; }
done
backup=/var/backups/nftfactory-indexer/mainnet-$(date -u +%Y%m%dT%H%M%SZ)
install -d -m 0700 "$backup"
cp /etc/nftfactory-indexer/service.env "$backup/sepolia.env"
systemctl cat nftfactory-indexer > "$backup/sepolia.unit"
runuser -u postgres -- pg_dump -Fc nftfactory_app > "$backup/sepolia.dump"
pg_restore --list "$backup/sepolia.dump" > "$backup/sepolia.contents"
node "$stage/configure.mjs" "$stage"
route_changed=0
rollback(){
 code=$?; trap - ERR
 systemctl stop nftfactory-chain-router nftfactory-indexer-8453 nftfactory-indexer-4663 2>/dev/null || true
 if [[ $route_changed == 1 ]]; then
  rm -f /etc/systemd/system/nftfactory-indexer.service.d/mainnet-routing.conf
  systemctl daemon-reload
  systemctl restart nftfactory-indexer
 fi
 echo "Installation stopped. Sepolia restored; retain $backup and the new databases for inspection."; exit "$code"
}
trap rollback ERR
for pair in '8453 nftfactory_base' '4663 nftfactory_robinhood'; do
 read -r chain db <<< "$pair"
 runuser -u postgres -- createdb --owner=nftfactory_app "$db"
 install -d -m 0750 -o nftfactory-indexer -g nftfactory-indexer "/var/lib/nftfactory-indexer-$chain" "/var/lib/nftfactory-indexer-$chain/data"
 node --env-file="/etc/nftfactory-indexer/$chain.env" /opt/nftfactory-indexer/node_modules/prisma/build/index.js migrate deploy --schema /opt/nftfactory-indexer/services/indexer/prisma/schema.prisma
 cat > "/etc/systemd/system/nftfactory-indexer-$chain.service" <<UNIT
[Unit]
Description=NFTFactory indexer chain $chain
After=network-online.target postgresql.service
Wants=network-online.target
Requires=postgresql.service
[Service]
User=nftfactory-indexer
Group=nftfactory-indexer
WorkingDirectory=/var/lib/nftfactory-indexer-$chain
EnvironmentFile=/etc/nftfactory-indexer/$chain.env
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
ReadWritePaths=/var/lib/nftfactory-indexer-$chain
MemoryMax=768M
[Install]
WantedBy=multi-user.target
UNIT
done
systemctl daemon-reload
systemctl start nftfactory-indexer-8453 nftfactory-indexer-4663
for port in 8790 8791; do
 curl --fail --silent --show-error --retry 15 --retry-connrefused --retry-delay 1 --max-time 10 "http://127.0.0.1:$port/health" -o "$backup/health-$port.json"
done
node "$stage/check-health.mjs" "$stage" "$backup"
install -d -m 0755 /opt/nftfactory-chain-router /etc/systemd/system/nftfactory-indexer.service.d
install -m 0644 "$stage/indexerChainRouter.mjs" /opt/nftfactory-chain-router/server.mjs
printf 'INDEXER_PORT=8792\n' > /etc/nftfactory-indexer/sepolia-routing.env
printf '[Service]\nEnvironmentFile=/etc/nftfactory-indexer/sepolia-routing.env\n' > /etc/systemd/system/nftfactory-indexer.service.d/mainnet-routing.conf
cat > /etc/systemd/system/nftfactory-chain-router.service <<'UNIT'
[Unit]
Description=NFTFactory network API router
After=nftfactory-indexer.service nftfactory-indexer-8453.service nftfactory-indexer-4663.service
[Service]
User=nftfactory-indexer
Group=nftfactory-indexer
ExecStart=/opt/nftfactory-node24/bin/node /opt/nftfactory-chain-router/server.mjs
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
CapabilityBoundingSet=
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
MemoryMax=128M
[Install]
WantedBy=multi-user.target
UNIT
route_changed=1
systemctl daemon-reload
systemctl restart nftfactory-indexer
curl --fail --silent --retry 15 --retry-connrefused --retry-delay 1 --max-time 10 http://127.0.0.1:8792/health -o /dev/null
systemctl start nftfactory-chain-router
for path in health _chains/8453/health _chains/4663/health; do curl --fail --silent --retry 10 --retry-connrefused --retry-delay 1 --max-time 10 "http://127.0.0.1:8787/$path" -o /dev/null; done
systemctl enable nftfactory-chain-router nftfactory-indexer-8453 nftfactory-indexer-4663
trap - ERR
echo "Both mainnet indexers are installed. Sepolia is preserved. Backup: $backup"
