-- AlterTable
ALTER TABLE "Movie" ADD COLUMN     "metadataExternalId" TEXT,
ADD COLUMN     "metadataProvider" TEXT,
ADD COLUMN     "metadataUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SeriesSeason" (
    "id" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT,
    "originalName" TEXT,
    "description" TEXT,
    "originalDescription" TEXT,
    "airDate" DATE,
    "durationMin" INTEGER,
    "posterUrl" TEXT,

    CONSTRAINT "SeriesSeason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeriesEpisode" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT,
    "originalName" TEXT,
    "description" TEXT,
    "originalDescription" TEXT,
    "airDate" DATE,
    "stillUrl" TEXT,

    CONSTRAINT "SeriesEpisode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeriesSeason_movieId_number_idx" ON "SeriesSeason"("movieId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "SeriesSeason_movieId_number_key" ON "SeriesSeason"("movieId", "number");

-- CreateIndex
CREATE INDEX "SeriesEpisode_seasonId_number_idx" ON "SeriesEpisode"("seasonId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "SeriesEpisode_seasonId_number_key" ON "SeriesEpisode"("seasonId", "number");

-- CreateIndex
CREATE INDEX "Movie_metadataProvider_metadataExternalId_idx" ON "Movie"("metadataProvider", "metadataExternalId");

-- AddForeignKey
ALTER TABLE "SeriesSeason" ADD CONSTRAINT "SeriesSeason_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeriesEpisode" ADD CONSTRAINT "SeriesEpisode_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "SeriesSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;
