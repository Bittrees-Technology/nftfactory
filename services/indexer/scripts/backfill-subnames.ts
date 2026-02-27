import "dotenv/config";

import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

type BackfillInput = {
  subname: string;
  ownerAddress?: string;
  contractAddress?: string;
};

type RunOptions = {
  dryRun: boolean;
};

function isAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function normalizeSubname(input: string): string {
  return input.trim().toLowerCase().replace(/\.nftfactory\.eth$/, "");
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

function validateInput(input: BackfillInput): BackfillInput {
  const subname = normalizeSubname(input.subname || "");
  const ownerAddress = input.ownerAddress?.toLowerCase();
  const contractAddress = input.contractAddress?.toLowerCase();

  if (!subname) throw new Error("Invalid subname");
  if (!ownerAddress && !contractAddress) throw new Error("Provide ownerAddress or contractAddress");
  if (ownerAddress && !isAddress(ownerAddress)) throw new Error(`Invalid ownerAddress: ${ownerAddress}`);
  if (contractAddress && !isAddress(contractAddress)) throw new Error(`Invalid contractAddress: ${contractAddress}`);

  return { subname, ownerAddress, contractAddress };
}

async function runSingle(prisma: PrismaClient, args: Record<string, string>, options: RunOptions): Promise<void> {
  const input = validateInput({
    subname: args.subname || "",
    ownerAddress: args.owner,
    contractAddress: args.contract
  });

  const whereClause = {
    ...(input.ownerAddress ? { ownerAddress: input.ownerAddress } : {}),
    ...(input.contractAddress ? { contractAddress: input.contractAddress } : {})
  };

  const matchCount = await prisma.collection.count({
    where: whereClause
  });

  const updatedCount = options.dryRun
    ? 0
    : (
        await prisma.collection.updateMany({
          where: whereClause,
          data: { ensSubname: input.subname }
        })
      ).count;

  console.log(
    JSON.stringify(
      {
        mode: "single",
        dryRun: options.dryRun,
        matchedCount: matchCount,
        updatedCount,
        subname: input.subname,
        ownerAddress: input.ownerAddress || null,
        contractAddress: input.contractAddress || null
      },
      null,
      2
    )
  );
}

async function runBatch(prisma: PrismaClient, filePath: string, options: RunOptions): Promise<void> {
  const raw = readFileSync(filePath, "utf8");
  const payload = JSON.parse(raw) as BackfillInput[];
  if (!Array.isArray(payload)) throw new Error("Batch file must be a JSON array");

  let totalUpdated = 0;
  let totalMatched = 0;
  for (const [index, row] of payload.entries()) {
    const input = validateInput(row);
    const whereClause = {
      ...(input.ownerAddress ? { ownerAddress: input.ownerAddress } : {}),
      ...(input.contractAddress ? { contractAddress: input.contractAddress } : {})
    };

    const matchedCount = await prisma.collection.count({
      where: whereClause
    });
    totalMatched += matchedCount;

    const updatedCount = options.dryRun
      ? 0
      : (
          await prisma.collection.updateMany({
            where: whereClause,
            data: { ensSubname: input.subname }
          })
        ).count;

    totalUpdated += updatedCount;
    console.log(
      JSON.stringify(
        {
          row: index + 1,
          dryRun: options.dryRun,
          matchedCount,
          updatedCount,
          subname: input.subname,
          ownerAddress: input.ownerAddress || null,
          contractAddress: input.contractAddress || null
        },
        null,
        2
      )
    );
  }

  console.log(
    JSON.stringify(
      {
        mode: "batch",
        dryRun: options.dryRun,
        rows: payload.length,
        totalMatched,
        totalUpdated
      },
      null,
      2
    )
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  const options: RunOptions = {
    dryRun: args["dry-run"] === "true"
  };

  try {
    if (args.file && args.file !== "true") {
      await runBatch(prisma, args.file, options);
      return;
    }
    await runSingle(prisma, args, options);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
