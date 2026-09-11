-- Add replacement uniqueness before removing old indexes. No rows or IDs change.
CREATE UNIQUE INDEX "Collection_chainId_contractAddress_key" ON "Collection"("chainId", "contractAddress");
CREATE UNIQUE INDEX "Listing_chainId_listingId_key" ON "Listing"("chainId", "listingId");
CREATE UNIQUE INDEX "Offer_chainId_offerId_key" ON "Offer"("chainId", "offerId");
DROP INDEX "Collection_contractAddress_key";
DROP INDEX "Listing_listingId_key";
DROP INDEX "Offer_offerId_key";
ALTER TABLE "TokenTag" ADD COLUMN "private" BOOLEAN NOT NULL DEFAULT false;
