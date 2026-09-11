# Acer indexer runtime

This minimal lockfile installs only the profile/indexer service dependencies,
Prisma migrations, and the TypeScript runtime. It avoids deploying the web and
contract workspaces to Acer. Refresh this lockfile when service dependencies change.

Stage this package.json and package-lock.json at the root of `indexer-release`,
alongside the repository's `services/indexer/src`, `services/indexer/prisma`,
and `packages/auth` directories. On Linux with Node 24, run `npm ci` and
`node_modules/.bin/prisma generate --schema services/indexer/prisma/schema.prisma`.
Do not copy development data or environment files into this release directory.

The installer in `../ipfs/install-acer-indexer.sh` expects that prepared directory,
the adjacent backup script, a private mode-0600 `nftfactory-indexer.env`, and
`nftfactory-runtime/node.tar.xz` (official Node v24.21.0 Linux x64; checksum pinned
in the installer). The environment uses the existing production session secret,
Sepolia RPC and contract addresses, and fresh random database/admin credentials.
It must not contain shell syntax from user input.

The installer refuses existing application installations or database names. It
does not restore prior data. User authorized a fresh database on 2026-09-11,
believing no existing user data required retention; discovered files must still
be preserved. The service binds only 127.0.0.1:8787. Add the public tunnel route
only after database health and authorization checks pass.

Profile files persist under `/var/lib/nftfactory-indexer/data`. The daily backup
timer saves a checked PostgreSQL archive and profile files under
`/var/backups/nftfactory-indexer`, retaining approximately 14 days. These backups
are local, not disaster recovery. A private independent destination and an
isolated restore drill remain required. Never upload private database backups to
the public IPFS replica bucket.

Validation before administrator installation: indexer TypeScript and 73 tests
passed, Linux Node 24 module import passed, runtime dependency audit reported
zero vulnerabilities, and shell syntax passed. Database migrations, systemd
startup, live profile writes, and restore acceptance await installation.
