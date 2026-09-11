#!/usr/bin/env bash
# Final-step installer; prepare and verify the package before invoking on Acer.
set -euo pipefail
export PATH=/opt/nftfactory-node24/bin:/usr/sbin:/usr/bin:/sbin:/bin
[[ ${EUID} == 0 ]] || { echo 'Run through the Acer administrator installer.'; exit 1; }
[[ ${NFTFACTORY_FINAL_RELEASE:-} == 1 ]] || { echo 'Deployment held. Set NFTFACTORY_FINAL_RELEASE=1 only at the final release step.'; exit 1; }
source_dir=${1:?Provide a prepared runtime directory}
expected_commit=${2:?Provide the reviewed full commit}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
node "$script_dir/verify-indexer-release.mjs" "$source_dir" "$expected_commit"
[[ -d /opt/nftfactory-indexer && ! -L /opt/nftfactory-indexer ]] || { echo 'Unexpected current installation layout; stop for review.'; exit 1; }
stamp=$(date -u +%Y%m%dT%H%M%SZ)
release_dir="/opt/nftfactory-indexer-release-$stamp"
backup_dir="/var/backups/nftfactory-indexer/release-$stamp"
previous_dir="/opt/nftfactory-indexer-before-$stamp"
[[ ! -e "$release_dir" && ! -e "$backup_dir" && ! -e "$previous_dir" ]] || exit 1
install -d -m 0755 "$release_dir"
cp -R "$source_dir/." "$release_dir/"
chown -R root:root "$release_dir"
node "$script_dir/verify-indexer-release.mjs" "$release_dir" "$expected_commit"
cd "$release_dir"
npm ci --omit=dev --ignore-scripts
# Generate without application credentials or connecting to the database.
DATABASE_URL=postgresql://unused:unused@127.0.0.1:5432/unused node node_modules/prisma/build/index.js generate --schema services/indexer/prisma/schema.prisma
install -d -m 0700 "$backup_dir"
service_stopped=0
migration_started=0
on_error() {
 code=$?
 trap - ERR
 if [[ $service_stopped == 1 ]]; then
  systemctl stop nftfactory-indexer || true
  if [[ $migration_started == 0 ]]; then systemctl start nftfactory-indexer || true; fi
 fi
 echo "Release stopped (exit $code). Preserve $backup_dir and $previous_dir."
 if [[ $migration_started == 1 ]]; then echo 'Service is stopped: restore the saved database and previous code together using the recovery runbook before restarting.'; fi
 exit "$code"
}
trap on_error ERR
systemctl stop nftfactory-indexer
service_stopped=1
runuser -u postgres -- pg_dump --format=custom nftfactory_app > "$backup_dir/database.dump"
[[ -s "$backup_dir/database.dump" ]]
pg_restore --list "$backup_dir/database.dump" > "$backup_dir/database.contents"
tar -C /var/lib/nftfactory-indexer -czf "$backup_dir/profile-data.tar.gz" .
cp /etc/systemd/system/nftfactory-indexer.service "$backup_dir/service.unit"
printf '%s\n' "$expected_commit" > "$backup_dir/target-commit"
chmod 0600 "$backup_dir/"*
migration_started=1
# --env-file reads the root-owned service file without printing or shell-evaluating credentials.
node --env-file=/etc/nftfactory-indexer/service.env node_modules/prisma/build/index.js migrate deploy --schema services/indexer/prisma/schema.prisma
mv /opt/nftfactory-indexer "$previous_dir"
mv "$release_dir" /opt/nftfactory-indexer
systemctl start nftfactory-indexer
curl --fail --silent --show-error --retry 15 --retry-connrefused --retry-delay 1 --retry-max-time 45 --max-time 5 http://127.0.0.1:8787/health -o /dev/null
systemctl is-active --quiet nftfactory-indexer
trap - ERR
echo "Indexer release healthy. Previous code: $previous_dir. Private local backup: $backup_dir."
echo 'Complete signed profile, import and marketplace canaries before releasing the web application.'
