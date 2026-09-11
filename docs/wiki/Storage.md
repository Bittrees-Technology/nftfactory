# Storage and outages

NFTFactory stores NFT files on IPFS. A content identifier (CID) identifies the file independently of this website.

## Where files live

The primary node runs on the Acer server. Filebase provides a separate public replica for files successfully copied there. A file is redundant only after that copy is confirmed; uploading to one node alone does not guarantee availability.

## If the primary service is unavailable

Existing replicated NFT files can remain readable through an alternate gateway. New uploads, profile edits, imports, and tag changes may be temporarily unavailable. Retry when service returns.

For profiles with an exported public snapshot, the site can show a dated, read-only copy. It may not reflect recent transfers or edits, and live marketplace activity is disabled in that copy. Profiles without a snapshot will show an unavailable message instead.

## What this does not cover

A public snapshot is not a backup of private account data or a second live database. Private offsite database backups are planned after launch. Local database backups and restore checks remain part of operating the primary server.
