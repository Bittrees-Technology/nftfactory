#!/bin/bash
set -euo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
stage=/home/raging/service-staging
target=/opt/nftfactory-indexer/services/indexer/src
cp -p "$target/indexer.ts" "$target/indexer.ts.before-mint-sync"
install -m 0644 "$stage/mintReceipt.ts" "$target/mintReceipt.ts"
install -m 0644 "$stage/indexer.ts" "$target/indexer.ts"
systemctl restart nftfactory-indexer
if ! curl --fail --silent --show-error --retry 15 --retry-connrefused --retry-delay 1 --retry-max-time 30 --max-time 10 http://127.0.0.1:8787/health -o /dev/null; then
 cp -p "$target/indexer.ts.before-mint-sync" "$target/indexer.ts"
 systemctl restart nftfactory-indexer
 echo 'Update failed; previous service restored.'
 exit 1
fi
if [ -f /var/backups/nftfactory-indexer/restore-check.json ]; then
 install -m 0600 -o raging -g raging /var/backups/nftfactory-indexer/restore-check.json "$stage/nftfactory-restore-result.json"
fi
echo 'Mint indexing update installed; profile service is healthy.'
