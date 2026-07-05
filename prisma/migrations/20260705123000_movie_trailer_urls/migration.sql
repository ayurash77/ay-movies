ALTER TABLE "Movie" ADD COLUMN "trailerUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "Movie"
SET "trailerUrls" = ARRAY["trailerUrl"]::TEXT[]
WHERE "trailerUrl" IS NOT NULL AND "trailerUrl" <> '';

ALTER TABLE "Movie" DROP COLUMN "trailerUrl";
