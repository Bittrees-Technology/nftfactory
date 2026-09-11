#!/usr/bin/env bash
set -euo pipefail
[[ $(id -u) = 0 ]]
umask 077
exec 9>/run/lock/nftfactory-indexer-backup.lock
flock -n 9 || exit 0
base=/var/backups/nftfactory-indexer
mkdir -p "$base"
tmp=$(mktemp -d "$base/.pending-XXXXXX")
trap 'rm -rf -- "$tmp"' EXIT
runuser -u postgres -- pg_dump -Fc nftfactory_app > "$tmp/database.dump"
pg_restore --list "$tmp/database.dump" > /dev/null
tar -czf "$tmp/profile-files.tar.gz" -C /var/lib/nftfactory-indexer data
(cd "$tmp"; sha256sum database.dump profile-files.tar.gz > SHA256SUMS)
destination="$base/$(date -u +%Y%m%dT%H%M%SZ)"
mv "$tmp" "$destination"
trap - EXIT
# Retain two weeks locally. Offsite backup requires a separate private destination.
find "$base" -mindepth 1 -maxdepth 1 -type d -name '20*T*Z' -mtime +14 -exec rm -rf -- {} +
echo 'Local database and profile backup verified.'
