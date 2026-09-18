# Storage and outages

NFTFactory stores NFT files on IPFS, a distributed storage network. Each file has a content identifier (CID) that identifies its content independently of any particular server or website.

## Where files live

Files are stored on a primary IPFS node and replicated to an independent storage service. Redundancy depends on successful replication: a file has an additional copy only once that copy is confirmed.

A CID identifies content, but does not guarantee permanent availability. Files must remain stored and accessible through at least one reachable provider.

## If the primary service is unavailable

Replicated NFT files may remain accessible through an alternate IPFS gateway. Features that depend on the application's backend—including new uploads, profile edits, imports, and tag changes—may be temporarily unavailable. Retry when service returns.

Where a public profile snapshot exists, the site can display a dated, read-only version. This snapshot may not include recent transfers or edits, and live marketplace activity is disabled in that view. Profiles without a snapshot display an unavailable message.

## Backups and recovery

File replication, public snapshots, and database backups serve different purposes. Replication helps keep NFT files accessible. Public snapshots preserve a limited view of profile content. Database backups support recovery of application data.

Public snapshots do not back up private account data or provide a second live database. Local database backups and recovery checks remain part of routine operations; private offsite database backups are planned after launch.
