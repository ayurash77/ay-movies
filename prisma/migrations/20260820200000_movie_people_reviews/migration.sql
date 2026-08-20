-- CreateEnum
CREATE TYPE "ReviewSentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- AlterTable
ALTER TABLE "Movie"
ADD COLUMN "kinopoiskRating" DOUBLE PRECISION,
ADD COLUMN "kinopoiskVotes" INTEGER,
ADD COLUMN "imdbRating" DOUBLE PRECISION,
ADD COLUMN "imdbVotes" INTEGER,
ADD COLUMN "russianCriticsPercent" DOUBLE PRECISION,
ADD COLUMN "russianCriticsVotes" INTEGER;

-- AlterTable
ALTER TABLE "Comment"
ADD COLUMN "title" TEXT,
ADD COLUMN "sentiment" "ReviewSentiment" NOT NULL DEFAULT 'NEUTRAL',
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "originalName" TEXT,
    "photoUrl" TEXT,
    "sex" TEXT,
    "growthCm" INTEGER,
    "birthDate" DATE,
    "deathDate" DATE,
    "birthPlace" TEXT[] NOT NULL,
    "professions" TEXT[] NOT NULL,
    "facts" TEXT[] NOT NULL,
    "filmography" JSONB,
    "profileUpdatedAt" TIMESTAMP(3),

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoviePersonCredit" (
    "id" TEXT NOT NULL,
    "movieId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "profession" TEXT NOT NULL,
    "role" TEXT,
    "position" INTEGER NOT NULL,

    CONSTRAINT "MoviePersonCredit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Person_name_idx" ON "Person"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Person_provider_externalId_key" ON "Person"("provider", "externalId");

-- CreateIndex
CREATE INDEX "MoviePersonCredit_movieId_position_idx" ON "MoviePersonCredit"("movieId", "position");

-- CreateIndex
CREATE INDEX "MoviePersonCredit_personId_idx" ON "MoviePersonCredit"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "MoviePersonCredit_movieId_personId_profession_key" ON "MoviePersonCredit"("movieId", "personId", "profession");

-- AddForeignKey
ALTER TABLE "MoviePersonCredit" ADD CONSTRAINT "MoviePersonCredit_movieId_fkey" FOREIGN KEY ("movieId") REFERENCES "Movie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoviePersonCredit" ADD CONSTRAINT "MoviePersonCredit_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
