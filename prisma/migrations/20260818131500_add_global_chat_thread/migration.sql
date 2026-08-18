ALTER TABLE "ChatThread" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'DIRECT';
ALTER TABLE "ChatThread" ADD COLUMN "title" TEXT;

CREATE INDEX "ChatThread_kind_updatedAt_idx" ON "ChatThread"("kind", "updatedAt");
