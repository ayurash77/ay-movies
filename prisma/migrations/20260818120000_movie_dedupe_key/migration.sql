-- Add a nullable key first: existing rows can be merged and backfilled safely by
-- the application script without making this migration data-destructive.
ALTER TABLE "Movie" ADD COLUMN "dedupeKey" TEXT;

CREATE UNIQUE INDEX "Movie_dedupeKey_key" ON "Movie"("dedupeKey");
CREATE INDEX "Movie_kind_year_idx" ON "Movie"("kind", "year");
