import "dotenv/config";

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

type TokenPresentationRecord = {
  contractAddress: string;
  tokenId: string;
  draftName: string | null;
  draftDescription: string | null;
  mintedAmountRaw: string | null;
  updatedAt: string;
};

type RunOptions = {
  dryRun: boolean;
  filePath: string;
  limit: number | null;
};

const DEFAULT_FILE =
  process.env.INDEXER_TOKEN_PRESENTATION_FILE || resolve(process.cwd(), "data", "token-presentation.json");

function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function parseArgs(argv: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const value = argv[i + 1];
    parsed[key.slice(2)] = value && !value.startsWith("--") ? value : "true";
    if (value && !value.startsWith("--")) i += 1;
  }
  return parsed;
}

function sanitizeDraftText(value: string | null | undefined, max: number): string | null {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function sanitizeMintedAmountRaw(value: string | null | undefined): string | null {
  const trimmed = String(value || "").trim();
  return /^[1-9][0-9]*$/.test(trimmed) ? trimmed : null;
}

function tokenPresentationKey(contractAddress: string, tokenId: string): string {
  return `${contractAddress}:${tokenId}`;
}

function readTokenPresentationRecords(filePath: string): TokenPresentationRecord[] {
  if (!existsSync(filePath)) {
    throw new Error(`Token presentation file was not found: ${filePath}`);
  }

  const raw = readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as TokenPresentationRecord[];
  if (!Array.isArray(parsed)) {
    throw new Error("Token presentation file must contain a JSON array");
  }

  const normalized = parsed
    .filter((item) => item && isAddress(String(item.contractAddress || "").trim().toLowerCase()) && String(item.tokenId || "").trim())
    .map((item) => ({
      contractAddress: String(item.contractAddress).trim().toLowerCase(),
      tokenId: String(item.tokenId).trim(),
      draftName: sanitizeDraftText(item.draftName, 160),
      draftDescription: sanitizeDraftText(item.draftDescription, 1200),
      mintedAmountRaw: sanitizeMintedAmountRaw(item.mintedAmountRaw),
      updatedAt: item.updatedAt || new Date().toISOString()
    }))
    .filter((item) => item.draftName || item.draftDescription || item.mintedAmountRaw)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const deduped = new Map<string, TokenPresentationRecord>();
  for (const item of normalized) {
    const key = tokenPresentationKey(item.contractAddress, item.tokenId);
    if (!deduped.has(key)) {
      deduped.set(key, item);
    }
  }

  return Array.from(deduped.values());
}

function parseLimit(value: string | undefined): number | null {
  if (!value || value === "true") return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid --limit value: ${value}`);
  }
  return parsed;
}

async function hasTokenPresentationColumns(prisma: PrismaClient): Promise<boolean> {
  const columns = ["draftName", "draftDescription", "mintedAmountRaw"];
  const checks = await Promise.all(
    columns.map((columnName) =>
      (prisma as any).$queryRawUnsafe(`
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Token'
          AND column_name = '${columnName}'
        LIMIT 1
      `)
    )
  );
  return checks.every((rows: unknown) => Array.isArray(rows) && rows.length > 0);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  const options: RunOptions = {
    dryRun: args["dry-run"] === "true",
    filePath: args.file && args.file !== "true" ? resolve(args.file) : DEFAULT_FILE,
    limit: parseLimit(args.limit)
  };

  try {
    if (!(await hasTokenPresentationColumns(prisma))) {
      throw new Error("Token presentation columns are not available. Run the Prisma migration first.");
    }

    const allRecords = readTokenPresentationRecords(options.filePath);
    const records = options.limit ? allRecords.slice(0, options.limit) : allRecords;
    const contractAddresses = Array.from(new Set(records.map((item) => item.contractAddress)));

    if (records.length === 0) {
      console.log(
        JSON.stringify(
          {
            dryRun: options.dryRun,
            filePath: options.filePath,
            totalRecords: 0,
            message: "No token presentation records were found"
          },
          null,
          2
        )
      );
      return;
    }

    const tokens = await (prisma.token as any).findMany({
      where: {
        collection: {
          contractAddress: { in: contractAddresses }
        }
      },
      select: {
        id: true,
        tokenId: true,
        draftName: true,
        draftDescription: true,
        mintedAmountRaw: true,
        collection: {
          select: {
            contractAddress: true
          }
        }
      }
    });

    const tokensByKey = new Map<
      string,
      {
        id: string;
        draftName: string | null;
        draftDescription: string | null;
        mintedAmountRaw: string | null;
      }
    >();
    for (const token of tokens as Array<any>) {
      tokensByKey.set(tokenPresentationKey(token.collection.contractAddress.toLowerCase(), token.tokenId), {
        id: token.id,
        draftName: sanitizeDraftText(token.draftName, 160),
        draftDescription: sanitizeDraftText(token.draftDescription, 1200),
        mintedAmountRaw: sanitizeMintedAmountRaw(token.mintedAmountRaw)
      });
    }

    let matchedTokens = 0;
    let missingTokens = 0;
    let pendingUpdates = 0;
    let updatedTokens = 0;
    let unchangedTokens = 0;
    let skippedExistingDraftName = 0;
    let skippedExistingDraftDescription = 0;
    let skippedExistingMintedAmountRaw = 0;
    let draftNameBackfilled = 0;
    let draftDescriptionBackfilled = 0;
    let mintedAmountRawBackfilled = 0;
    const missingExamples: string[] = [];

    for (const record of records) {
      const key = tokenPresentationKey(record.contractAddress, record.tokenId);
      const token = tokensByKey.get(key);
      if (!token) {
        missingTokens += 1;
        if (missingExamples.length < 10) {
          missingExamples.push(key);
        }
        continue;
      }

      matchedTokens += 1;
      const data: {
        draftName?: string;
        draftDescription?: string;
        mintedAmountRaw?: string;
      } = {};

      if (!token.draftName && record.draftName) {
        data.draftName = record.draftName;
      } else if (token.draftName && record.draftName) {
        skippedExistingDraftName += 1;
      }

      if (!token.draftDescription && record.draftDescription) {
        data.draftDescription = record.draftDescription;
      } else if (token.draftDescription && record.draftDescription) {
        skippedExistingDraftDescription += 1;
      }

      if (!token.mintedAmountRaw && record.mintedAmountRaw) {
        data.mintedAmountRaw = record.mintedAmountRaw;
      } else if (token.mintedAmountRaw && record.mintedAmountRaw) {
        skippedExistingMintedAmountRaw += 1;
      }

      if (data.draftName) draftNameBackfilled += 1;
      if (data.draftDescription) draftDescriptionBackfilled += 1;
      if (data.mintedAmountRaw) mintedAmountRawBackfilled += 1;

      if (Object.keys(data).length === 0) {
        unchangedTokens += 1;
        continue;
      }

      pendingUpdates += 1;
      if (options.dryRun) {
        continue;
      }

      await (prisma.token as any).update({
        where: { id: token.id },
        data
      });
      updatedTokens += 1;
    }

    console.log(
      JSON.stringify(
        {
          dryRun: options.dryRun,
          filePath: options.filePath,
          totalRecords: allRecords.length,
          processedRecords: records.length,
          matchedTokens,
          missingTokens,
          unchangedTokens,
          pendingUpdates,
          updatedTokens: options.dryRun ? 0 : updatedTokens,
          fieldsBackfilled: {
            draftName: draftNameBackfilled,
            draftDescription: draftDescriptionBackfilled,
            mintedAmountRaw: mintedAmountRawBackfilled
          },
          skippedExistingValues: {
            draftName: skippedExistingDraftName,
            draftDescription: skippedExistingDraftDescription,
            mintedAmountRaw: skippedExistingMintedAmountRaw
          },
          missingExamples
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
