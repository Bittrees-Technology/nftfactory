#!/usr/bin/env bash
set -euo pipefail
export PATH=/opt/nftfactory-node24/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
[[ $EUID == 0 ]]
source_dir=${1:?Provide reviewed source directory}
install -d -o nftfactory-indexer -g nftfactory-indexer -m 0700 /var/lib/nftfactory-indexer/ipfs-seed
install -d /etc/systemd/system/nftfactory-indexer.service.d
cat > /etc/systemd/system/nftfactory-indexer.service.d/artwork-seeding.conf <<'UNIT'
[Service]
Environment=NFTFACTORY_SEED_QUEUE_DIR=/var/lib/nftfactory-indexer/ipfs-seed
UNIT
cat > /etc/systemd/system/nftfactory-artwork-seed.service <<'UNIT'
[Unit]
Description=Seed imported NFT artwork onto local IPFS storage
After=nftfactory-indexer.service ipfs-node.service ipfs-archive.service
[Service]
Type=oneshot
User=nftfactory-indexer
Group=nftfactory-indexer
WorkingDirectory=/opt/nftfactory-indexer
EnvironmentFile=/etc/nftfactory-indexer/service.env
Environment=NFTFACTORY_SEED_QUEUE_DIR=/var/lib/nftfactory-indexer/ipfs-seed
ExecStart=/opt/nftfactory-node24/bin/node --import tsx services/indexer/src/artworkSeedWorker.ts
TimeoutStartSec=900
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/nftfactory-indexer/ipfs-seed
MemoryMax=512M
UNIT
cat > /etc/systemd/system/nftfactory-artwork-seed.timer <<'UNIT'
[Unit]
Description=Retry pending artwork IPFS copies
[Timer]
OnBootSec=3min
OnUnitInactiveSec=5min
[Install]
WantedBy=timers.target
UNIT
cp -a /opt/ipfs-gateway/read-server.mjs /opt/ipfs-gateway/read-server.before-archive.mjs
install -m 0644 "$source_dir/read-server.mjs" /opt/ipfs-gateway/read-server.mjs
install -d /etc/systemd/system/ipfs-read-gateway.service.d
cat > /etc/systemd/system/ipfs-read-gateway.service.d/archive.conf <<'UNIT'
[Service]
Environment=IPFS_ARCHIVE_API=http://127.0.0.1:5002
Environment=IPFS_ARCHIVE_GATEWAY=http://127.0.0.1:8081
UNIT
systemctl daemon-reload
systemctl restart nftfactory-indexer ipfs-read-gateway
systemctl enable --now nftfactory-artwork-seed.timer
printf 'Artwork seeding queue and archive read fallback enabled.\n'
