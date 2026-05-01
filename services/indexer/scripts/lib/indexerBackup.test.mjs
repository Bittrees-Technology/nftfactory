import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  BACKUP_METADATA_VERSION,
  buildBackupMetadata,
  evaluateBackupAge,
  getBackupArtifactPaths,
  parseCheckBackupArgs,
  readOptionalChecksum,
  resolveLatestBackupDump
} from "./indexerBackup.mjs";

test("getBackupArtifactPaths derives checksum and metadata paths", () => {
  assert.deepEqual(getBackupArtifactPaths("/tmp/indexer.dump"), {
    dumpPath: "/tmp/indexer.dump",
    checksumPath: "/tmp/indexer.dump.sha256",
    metadataPath: "/tmp/indexer.dump.json"
  });
});

test("parseCheckBackupArgs supports skip flags and max age override", () => {
  assert.deepEqual(parseCheckBackupArgs(["--skip-age-check", "--max-age-hours", "72", "--json", "/tmp/backups"]), {
    targetPath: "/tmp/backups",
    maxAgeHours: 72,
    skipAgeCheck: true,
    skipPgRestoreList: false,
    json: true,
    requireSidecars: false
  });
});

test("buildBackupMetadata captures size and checksum", () => {
  const metadata = buildBackupMetadata({
    dumpPath: "/tmp/indexer.dump",
    sha256: "abc123",
    stats: { size: 1234, mtimeMs: Date.parse("2026-05-01T00:00:00.000Z") },
    createdAt: "2026-05-01T00:00:00.000Z"
  });

  assert.deepEqual(metadata, {
    version: BACKUP_METADATA_VERSION,
    fileName: "indexer.dump",
    sizeBytes: 1234,
    sha256: "abc123",
    createdAt: "2026-05-01T00:00:00.000Z"
  });
});

test("evaluateBackupAge marks stale backups", () => {
  const fresh = evaluateBackupAge({ mtimeMs: Date.parse("2026-05-01T11:00:00.000Z") }, 24, Date.parse("2026-05-01T12:00:00.000Z"));
  assert.equal(fresh.stale, false);

  const stale = evaluateBackupAge({ mtimeMs: Date.parse("2026-04-29T00:00:00.000Z") }, 24, Date.parse("2026-05-01T12:00:00.000Z"));
  assert.equal(stale.stale, true);
});

test("readOptionalChecksum parses the first token from checksum files", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "indexer-backup-checksum-"));
  try {
    const checksumPath = path.join(dir, "indexer.dump.sha256");
    await writeFile(checksumPath, "deadbeef  indexer.dump\n", "utf8");
    assert.equal(await readOptionalChecksum(checksumPath), "deadbeef");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("resolveLatestBackupDump chooses the newest dump in a directory", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "indexer-backup-dir-"));
  try {
    await mkdir(path.join(dir, "nested"));
    const older = path.join(dir, "indexer-older.dump");
    const newer = path.join(dir, "indexer-newer.dump");
    await writeFile(older, "older", "utf8");
    await new Promise((resolve) => setTimeout(resolve, 15));
    await writeFile(newer, "newer", "utf8");

    assert.equal(await resolveLatestBackupDump(dir), newer);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
