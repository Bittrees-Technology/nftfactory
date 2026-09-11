CREATE TABLE "AuthNonce" ("id" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "AuthNonce_pkey" PRIMARY KEY ("id"));
CREATE INDEX "AuthNonce_expiresAt_idx" ON "AuthNonce"("expiresAt");
