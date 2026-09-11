#!/usr/bin/env bash
set -euo pipefail
# Installs only the public-content filter. It does not change routers or expose Kubo RPC.
[[ $(id -u) = 0 ]] || { echo 'Run this prepared installer with sudo.' >&2; exit 1; }
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
[[ -f "$source_dir/read-server.mjs" ]] || { echo 'Place read-server.mjs beside this installer.' >&2; exit 1; }
id ipfs-gateway >/dev/null
/usr/bin/node --check "$source_dir/read-server.mjs"
install -m 0644 "$source_dir/read-server.mjs" /opt/ipfs-gateway/read-server.mjs
cat > /etc/systemd/system/ipfs-read-gateway.service <<'UNIT'
[Unit]
Description=NFTFactory pinned-content read gateway
After=ipfs-node.service
Requires=ipfs-node.service
[Service]
User=ipfs-gateway
Group=ipfs-gateway
ExecStart=/usr/bin/node /opt/ipfs-gateway/read-server.mjs
Restart=on-failure
MemoryMax=256M
CPUQuota=50%
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
CapabilityBoundingSet=
IPAddressDeny=any
IPAddressAllow=localhost
InaccessiblePaths=/srv /var/mail /var/lib/ipfs-node /var/lib/local-ai /etc/samba
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now ipfs-read-gateway.service
# systemctl returns before Node necessarily starts listening. Bound the readiness wait.
curl --fail --silent --show-error --retry 10 --retry-connrefused --retry-delay 1 --retry-max-time 20 --max-time 5 http://127.0.0.1:8789/ipfs/bafkreifql7zx5tfo4mns6t6zgajvxagyg7feo6s2h2oilzpc7bclbd2uaa
printf '\nPinned-content filter installed on loopback port 8789. No public ingress was changed.\n'
