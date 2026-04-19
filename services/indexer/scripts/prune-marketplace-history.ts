import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const arg = process.argv[2];
  const retentionDays = Math.max(
    0,
    Number.parseInt(arg || process.env.INDEXER_MARKETPLACE_RETENTION_DAYS || "0", 10) || 0
  );

  if (retentionDays <= 0) {
    console.error("Provide retention days as an argument or set INDEXER_MARKETPLACE_RETENTION_DAYS to a value greater than 0.");
    process.exit(1);
  }

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const [listings, offers] = await Promise.all([
    prisma.listing.deleteMany({
      where: {
        active: false,
        updatedAt: { lt: cutoff }
      }
    }),
    (prisma as any).offer?.deleteMany
      ? (prisma as any).offer.deleteMany({
          where: {
            active: false,
            updatedAt: { lt: cutoff }
          }
        })
      : Promise.resolve({ count: 0 })
  ]);

  console.log(
    JSON.stringify(
      {
        retentionDays,
        cutoff: cutoff.toISOString(),
        deletedListings: listings.count || 0,
        deletedOffers: offers.count || 0
      },
      null,
      2
    )
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
