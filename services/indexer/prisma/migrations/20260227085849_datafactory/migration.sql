-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "ownerAddress" TEXT NOT NULL,
    "ensSubname" TEXT,
    "standard" TEXT NOT NULL,
    "isFactoryCreated" BOOLEAN NOT NULL DEFAULT true,
    "isUpgradeable" BOOLEAN NOT NULL DEFAULT true,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Token" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "creatorAddress" TEXT NOT NULL,
    "ownerAddress" TEXT NOT NULL,
    "metadataCid" TEXT NOT NULL,
    "mediaCid" TEXT,
    "immutable" BOOLEAN NOT NULL DEFAULT true,
    "mintedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "collectionAddress" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "sellerAddress" TEXT NOT NULL,
    "paymentToken" TEXT NOT NULL,
    "priceRaw" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tokenRefId" TEXT,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenTag" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "addedByAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "reporterAddress" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationAction" (
    "id" TEXT NOT NULL,
    "tokenId" TEXT NOT NULL,
    "reportId" TEXT,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Collection_contractAddress_key" ON "Collection"("contractAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Token_collectionId_tokenId_key" ON "Token"("collectionId", "tokenId");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_listingId_key" ON "Listing"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_slug_key" ON "Tag"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "TokenTag_tokenId_tagId_addedByAddress_key" ON "TokenTag"("tokenId", "tagId", "addedByAddress");

-- CreateIndex
CREATE INDEX "Report_tokenId_status_idx" ON "Report"("tokenId", "status");

-- AddForeignKey
ALTER TABLE "Token" ADD CONSTRAINT "Token_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_tokenRefId_fkey" FOREIGN KEY ("tokenRefId") REFERENCES "Token"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenTag" ADD CONSTRAINT "TokenTag_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenTag" ADD CONSTRAINT "TokenTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token"("id") ON DELETE CASCADE ON UPDATE CASCADE;
