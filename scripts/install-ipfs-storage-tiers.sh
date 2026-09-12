#!/usr/bin/env bash
set -euo pipefail
export PATH=/opt/nftfactory-node24/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
[[ $EUID == 0 ]] || { echo 'Run as Acer administrator.'; exit 1; }
mountpoint -q /srv/storage
[[ $(findmnt -n -o FSTYPE /srv/storage) == ext4 ]]
# Trigger the existing encrypted, quota-limited MyCloud automount.
timeout 30 stat /srv/network-storage/. >/dev/null
# The automount and its mounted CIFS share both appear in findmnt output.
# Select the actual filesystem so the autofs entry cannot fail validation.
[[ $(findmnt -rn -t cifs -o SOURCE --mountpoint /srv/network-storage) == //192.168.1.164/acer-storage ]] || { echo 'Expected MyCloud CIFS share is not mounted.'; exit 1; }
[[ $(df --output=avail -B1 /srv/storage | tail -1) -gt 80000000000 ]]
install -d -o raging -g raging -m 0700 /srv/network-storage/nftfactory-ipfs-archive
runuser -u raging -- python3 - <<'CHECK'
import tempfile,os
with tempfile.NamedTemporaryFile(dir='/srv/network-storage/nftfactory-ipfs-archive') as f:
 f.write(b'NFTFactory durable storage check');f.flush();os.fsync(f.fileno())
CHECK
stamp=$(date -u +%Y%m%dT%H%M%SZ)
cp -a /etc/fstab /etc/fstab.before-nftfactory-ipfs-$stamp
install -d -o ipfs-node -g ipfs-node -m 0700 /srv/storage/nftfactory-ipfs-blocks
if ! mountpoint -q /var/lib/ipfs-node/blocks; then
 systemctl stop ipfs-node
 trap 'systemctl start ipfs-node ipfs-read-gateway || true' ERR
 cp -a /var/lib/ipfs-node/config /var/lib/ipfs-node/config.before-storage-$stamp
 rsync -a --checksum /var/lib/ipfs-node/blocks/ /srv/storage/nftfactory-ipfs-blocks/
 [[ -z $(rsync -anic /var/lib/ipfs-node/blocks/ /srv/storage/nftfactory-ipfs-blocks/) ]]
 # Keep the existing directory and blocks beneath the mount for rollback.
 grep -q '^/srv/storage/nftfactory-ipfs-blocks ' /etc/fstab || printf '
/srv/storage/nftfactory-ipfs-blocks /var/lib/ipfs-node/blocks none bind,x-systemd.requires-mounts-for=/srv/storage 0 0
' >> /etc/fstab
 systemctl daemon-reload
 mount /var/lib/ipfs-node/blocks
 runuser -u ipfs-node -- env IPFS_PATH=/var/lib/ipfs-node ipfs config Datastore.StorageMax 80GB
 install -d /etc/systemd/system/ipfs-node.service.d
 cat > /etc/systemd/system/ipfs-node.service.d/storage.conf <<'UNIT'
[Unit]
RequiresMountsFor=/var/lib/ipfs-node/blocks
[Service]
ExecStartPre=/usr/bin/mountpoint -q /var/lib/ipfs-node/blocks
UNIT
 systemctl daemon-reload
 systemctl start ipfs-node ipfs-read-gateway
 trap - ERR
fi
systemctl stop ipfs-archive 2>/dev/null || true
install -d -o raging -g raging -m 0700 /var/lib/ipfs-archive
if [[ ! -f /var/lib/ipfs-archive/config ]]; then
 runuser -u raging -- env IPFS_PATH=/var/lib/ipfs-archive ipfs init --profile=server
 runuser -u raging -- env IPFS_PATH=/var/lib/ipfs-archive ipfs config Addresses.API /ip4/127.0.0.1/tcp/5002
 runuser -u raging -- env IPFS_PATH=/var/lib/ipfs-archive ipfs config Addresses.Gateway /ip4/127.0.0.1/tcp/8082
 runuser -u raging -- env IPFS_PATH=/var/lib/ipfs-archive ipfs config --json Addresses.Swarm '["/ip4/127.0.0.1/tcp/4002"]'
 runuser -u raging -- env IPFS_PATH=/var/lib/ipfs-archive ipfs config Datastore.StorageMax 1500GB
 runuser -u raging -- env IPFS_PATH=/var/lib/ipfs-archive ipfs bootstrap rm --all
fi
runuser -u raging -- env IPFS_PATH=/var/lib/ipfs-archive ipfs config Addresses.Gateway /ip4/127.0.0.1/tcp/8082
if ! mountpoint -q /var/lib/ipfs-archive/blocks; then
 rsync -a /var/lib/ipfs-archive/blocks/ /srv/network-storage/nftfactory-ipfs-archive/
 grep -q '^/srv/network-storage/nftfactory-ipfs-archive ' /etc/fstab || printf '
/srv/network-storage/nftfactory-ipfs-archive /var/lib/ipfs-archive/blocks none bind,_netdev,x-systemd.requires-mounts-for=/srv/network-storage 0 0
' >> /etc/fstab
 systemctl daemon-reload
 mount /var/lib/ipfs-archive/blocks
fi
cat > /etc/systemd/system/ipfs-archive.service <<'UNIT'
[Unit]
Description=NFTFactory MyCloud IPFS archive
After=network-online.target
RequiresMountsFor=/var/lib/ipfs-archive/blocks
[Service]
User=raging
Environment=IPFS_PATH=/var/lib/ipfs-archive
Environment=HOME=/var/lib/ipfs-archive
Environment=XDG_CONFIG_HOME=/var/lib/ipfs-archive/.config
ExecStartPre=/usr/bin/mountpoint -q /var/lib/ipfs-archive/blocks
ExecStart=/usr/local/bin/ipfs daemon --offline --enable-gc
Restart=on-failure
RestartSec=30
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/ipfs-archive /srv/network-storage/nftfactory-ipfs-archive
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable ipfs-archive
systemctl restart ipfs-archive
curl --fail --silent --retry 12 --retry-connrefused --retry-delay 1 -X POST http://127.0.0.1:5002/api/v0/version >/dev/null
printf 'IPFS storage tiers are installed. Existing blocks and rollback copies retained.\n'
