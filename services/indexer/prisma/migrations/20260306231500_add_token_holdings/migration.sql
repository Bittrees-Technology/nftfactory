-- CreateTable
CREATE TABLE "TokenHolding" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "ownerAddress" TEXT NOT NULL,
    "quantityRaw" TEXT NOT NULL DEFAULT '0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TokenHolding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TokenHolding_tokenId_ownerAddress_key" ON "TokenHolding"("tokenId", "ownerAddress");

-- CreateIndex
CREATE INDEX "TokenHolding_ownerAddress_updatedAt_idx" ON "TokenHolding"("ownerAddress", "updatedAt");

-- CreateIndex
CREATE INDEX "TokenHolding_tokenId_updatedAt_idx" ON "TokenHolding"("tokenId", "updatedAt");

-- AddForeignKey
ALTER TABLE "TokenHolding" ADD CONSTRAINT "TokenHolding_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token"("id") ON DELETE CASCADE ON UPDATE CASCADE;
