-- AlterTable
ALTER TABLE "LinkedInPhoto" ADD COLUMN     "generated" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "LinkedInPost" ADD COLUMN     "graphic" TEXT,
ADD COLUMN     "useGraphic" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "LinkedInSettings" ADD COLUMN     "trustNotes" TEXT NOT NULL DEFAULT '';

