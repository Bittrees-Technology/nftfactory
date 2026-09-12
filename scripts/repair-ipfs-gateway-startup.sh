#!/usr/bin/env bash
set -euo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
[[ $EUID == 0 ]] || { echo 'Run as Acer administrator.'; exit 1; }
install -d /etc/systemd/system/ipfs-node.service.d
cat > /etc/systemd/system/ipfs-node.service.d/gateways.conf <<'UNIT'
[Unit]
Wants=ipfs-app-gateway.service ipfs-read-gateway.service
UNIT
systemctl daemon-reload
systemctl start ipfs-node ipfs-app-gateway ipfs-read-gateway
systemctl is-active --quiet ipfs-node ipfs-app-gateway ipfs-read-gateway
# No token is read: a 401 confirms the restricted listener is responding.
for attempt in {1..15}; do
 status=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 2 -X POST http://127.0.0.1:8788/api/v0/version || true)
 if [[ $status == 401 ]]; then echo 'Upload gateway restored; authentication remains required.'; exit 0; fi
 sleep 1
done
echo 'Gateway did not return the expected authenticated-service response.'; exit 1
