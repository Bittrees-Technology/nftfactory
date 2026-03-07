-- AlterTable
ALTER TABLE "Token"
ADD COLUMN "draftName" TEXT,
ADD COLUMN "draftDescription" TEXT,
ADD COLUMN "mintedAmountRaw" TEXT;

-- AlterTable
ALTER TABLE "Listing"
ADD COLUMN "marketplaceVersion" TEXT NOT NULL DEFAULT 'v1',
ADD COLUMN "amountRaw" TEXT NOT NULL DEFAULT '1',
ADD COLUMN "standard" TEXT NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "expiresAtRaw" TEXT NOT NULL DEFAULT '0',
ADD COLUMN "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "soldAt" TIMESTAMP(3),
ADD COLUMN "buyerAddress" TEXT,
ADD COLUMN "txHash" TEXT;

UPDATE "Listing"
SET "lastSyncedAt" = COALESCE("updatedAt", CURRENT_TIMESTAMP)
WHERE "lastSyncedAt" IS NULL;

ALTER TABLE "Listing"
ALTER COLUMN "lastSyncedAt" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "lastSyncedAt" SET NOT NULL;

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "marketplaceVersion" TEXT NOT NULL DEFAULT 'v2',
    "collectionAddress" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "buyerAddress" TEXT NOT NULL,
    "paymentToken" TEXT NOT NULL,
    "quantityRaw" TEXT NOT NULL,
    "priceRaw" TEXT NOT NULL,
    "expiresAtRaw" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "acceptedByAddress" TEXT,
    "acceptedSellerAddress" TEXT,
    "acceptedTxHash" TEXT,
    "cancelledTxHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tokenRefId" TEXT,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Offer_offerId_key" ON "Offer"("offerId");

-- CreateIndex
CREATE INDEX "Offer_buyerAddress_active_updatedAt_idx" ON "Offer"("buyerAddress", "active", "updatedAt");

-- CreateIndex
CREATE INDEX "Offer_collectionAddress_tokenId_active_updatedAt_idx" ON "Offer"("collectionAddress", "tokenId", "active", "updatedAt");

-- CreateIndex
CREATE INDEX "Offer_status_updatedAt_idx" ON "Offer"("status", "updatedAt");

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_tokenRefId_fkey" FOREIGN KEY ("tokenRefId") REFERENCES "Token"("id") ON DELETE SET NULL ON UPDATE CASCADE;
