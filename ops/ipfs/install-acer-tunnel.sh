#!/usr/bin/env bash
set -euo pipefail
[[ $(id -u) = 0 ]] || { echo 'Run with sudo after the named tunnel is configured.' >&2; exit 1; }
stage=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
[[ -s "$stage/nftfactory-tunnel.token" ]] || { echo 'Missing private named-tunnel token file; no changes made.' >&2; exit 1; }
[[ $(stat -c %a "$stage/nftfactory-tunnel.token") = 600 ]] || { echo 'Token file must have mode 0600.' >&2; exit 1; }
printf '%s  %s\n' '53b7a7a5420d188758d24341294acb0d1bca54296548ac05e38811a694ac6134' "$stage/cloudflared-2026.9.0" | sha256sum -c -
systemctl is-active --quiet ipfs-app-gateway.service
systemctl is-active --quiet ipfs-read-gateway.service
id nftfactory-tunnel >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin nftfactory-tunnel
install -d -m 0700 /etc/cloudflared
install -m 0600 "$stage/nftfactory-tunnel.token" /etc/cloudflared/nftfactory-token
install -m 0755 "$stage/cloudflared-2026.9.0" /usr/local/bin/cloudflared
cat > /etc/systemd/system/nftfactory-tunnel.service <<'UNIT'
[Unit]
Description=NFTFactory Acer named Cloudflare connector
After=network-online.target ipfs-app-gateway.service ipfs-read-gateway.service
Wants=network-online.target
[Service]
User=nftfactory-tunnel
LoadCredential=tunnel-token:/etc/cloudflared/nftfactory-token
ExecStart=/usr/local/bin/cloudflared tunnel --no-autoupdate --protocol http2 run --token-file %d/tunnel-token
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
CapabilityBoundingSet=
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
MemoryMax=256M
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now nftfactory-tunnel.service
systemctl is-active nftfactory-tunnel.service
