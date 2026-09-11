# Acer expansion release and recovery

Status: prepared, not executed. Production is unchanged. Do not use the older two-file updater for this release: it omits new authorization/profile modules, dependencies and database migrations.

## Before the final deployment step

1. Require a clean reviewed commit, passing GitHub checks, completed transaction acceptance and a resolved contract deployment manifest. Replacement Sepolia contracts now match the reviewed build and Safe ownership is complete; see the replacement runtime and ownership evidence.
2. Run `node scripts/package-indexer-release.mjs --out <new-directory>` from the clean checkout on supported Node 24. Keep `release-manifest.json`, the lockfile and every listed file. Never include credentials, private data, or `node_modules` in the transfer.
3. Run `node scripts/verify-indexer-release.mjs <new-directory> <full-reviewed-commit>`. This checks hashes, required files, clean commit declaration and unexpected files/symlinks. It is not a cryptographic publisher signature; transfer only the artifact prepared from the trusted checkout.
4. Copy the directory plus `scripts/install-acer-indexer-release.sh` and `scripts/verify-indexer-release.mjs` to the existing Acer staging area. Keep both scripts together. Verify the uploaded directory again before installation.
5. Confirm the private local daily backup and available disk space. Retain the current service configuration and Vercel deployment. The installer creates an additional stopped-service database dump and profile-data archive before migration.

## Final administrator step

Run the installer on Acer with the existing administrator workflow and `NFTFACTORY_FINAL_RELEASE=1`, passing the staged runtime directory and full reviewed commit. The flag is an intentional deployment hold; preparing the package does not authorize starting it early.

The installer uses the existing Node 24 runtime, installs locked dependencies without package lifecycle scripts, generates the database client, stops the service, takes a database dump and profile-data archive, applies migrations, switches the complete code directory, and checks health. Credentials are read from the existing root-owned service file without shell evaluation or logging. No Vercel, DNS or IPFS service configuration is changed.

If anything fails after migrations begin, the service remains stopped. This is deliberate: restarting the old Prisma client against changed unique constraints can fail or corrupt assumptions. Preserve the new database state and restore code/database together. The installer prints the exact backup and previous-code paths. Do not delete either on success until canaries and the retention period finish.

## Recovery after a migration or health failure

Use a maintenance window with the indexer stopped. Substitute only the exact paths printed by the installer and inspect them first.

1. Preserve a second dump of the failed database and current profile-data directory for diagnosis. Do not overwrite the pre-release dump.
2. Verify the pre-release dump with `pg_restore --list`. Restore it into a separate temporary database first, compare its migration history and record counts, and confirm it can be read. The automated local rehearsal already exercises restoration; this production backup still needs its own verification.
3. Restore the previous code directory to `/opt/nftfactory-indexer`. If the swap had not occurred, retain the original directory in place.
4. Restore the pre-release database as a whole, including the original schema and migration history, using the local PostgreSQL administrator. Recreating the application database is destructive and belongs only to this stopped-service recovery after preserving the failed state. Preserve/reapply the application database owner and grants. Do not run an old client against the partially migrated database.
5. Restore the matching profile-data archive with its existing `nftfactory-indexer` ownership, restart the service, and verify health and a public profile. Keep the old web release active until recovery passes.

## Coordinated web release

The new backend requires network-bound SIWE sessions, so users sign in again. After backend canaries pass, build Vercel from the actual production environment, never the local test `.env.local` or `.next-build` output.

Set `NEXT_PUBLIC_IPFS_REPLICA_GATEWAY=https://neat-lime-mite.myfilebase.com` in the final Vercel configuration; this value is now configured in production. Sensitive CLI exports can show blanks and are not evidence that a secret is missing. Keep Acer's primary gateway. The local browser test loaded the acceptance artwork from this Filebase host with the primary deliberately unavailable, then restored the primary setting.

Verify protected-site access, sign-in, profile persistence, public snapshot fallback, image fallback, uploads and transaction indexing. Keep the current access restriction until public launch is authorized. Merge/prune only once release evidence and rollback references are preserved.

## Outage limitations

Public snapshots are dated read-only copies, not database replication. Only exported profiles have copies, and new edits require a fresh export/release. During Acer outage, existing replicated NFT files and exported public profiles can be read; profile edits, private tags, imports, live marketplace state and new uploads require service recovery. Private offsite database backups remain deferred after launch under the $0/month constraint.

Before replacing the marketplace address, isolate or migrate its indexed state: listing and offer identifiers are keyed by chain, so a second marketplace on the same chain can reuse old IDs. Preserve the old database and cursor files; use a separate release database/state or a verified marketplace-aware migration. Do not simply point the existing index at the replacement contract.
