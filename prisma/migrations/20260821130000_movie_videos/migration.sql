-- CreateEnum
CREATE TYPE "MovieVideoKind" AS ENUM ('TRAILER', 'TEASER');

-- CreateTable
CREATE TABLE "MovieVideo" (
    "id" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "site" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "MovieVideoKind" NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "MovieVideo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MovieVideo_movieId_url_key" ON "MovieVideo"("movieId", "url");

-- CreateIndex
CREATE INDEX "MovieVideo_movieId_position_idx" ON "MovieVideo"("movieId", "position");

-- AddForeignKey
ALTER TABLE "MovieVideo" ADD CONSTRAINT "MovieVideo_movieId_fkey"
FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;
