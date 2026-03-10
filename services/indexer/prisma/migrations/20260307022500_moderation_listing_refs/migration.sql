-- Persist moderation state against listing refs so hide/restore stays listing-scoped.
ALTER TABLE "Report"
ADD COLUMN "listingRecordId" TEXT,
ADD COLUMN "marketplaceVersion" TEXT;

ALTER TABLE "ModerationAction"
ADD COLUMN "listingRecordId" TEXT,
ADD COLUMN "marketplaceVersion" TEXT;

CREATE INDEX "Report_listingRecordId_status_idx" ON "Report"("listingRecordId", "status");
CREATE INDEX "ModerationAction_listingRecordId_createdAt_idx" ON "ModerationAction"("listingRecordId", "createdAt");
