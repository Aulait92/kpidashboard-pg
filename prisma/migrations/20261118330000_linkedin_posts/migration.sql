-- CreateTable
CREATE TABLE "LinkedInConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "personUrn" TEXT NOT NULL,
    "name" TEXT,
    "accessTokenEnc" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scopes" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'ok',
    "lastError" TEXT,
    "remindedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkedInConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkedInSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "postsPerDay" INTEGER NOT NULL DEFAULT 5,
    "slots" TEXT NOT NULL DEFAULT '07:30,09:30,12:00,15:00,18:00',
    "weekdays" BOOLEAN NOT NULL DEFAULT true,
    "about" TEXT NOT NULL DEFAULT '',
    "autoDrafts" BOOLEAN NOT NULL DEFAULT true,
    "draftHour" INTEGER NOT NULL DEFAULT 17,
    "lastImportAt" TIMESTAMP(3),
    "draftingAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkedInSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkedInPost" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "idea" TEXT,
    "hypothesis" TEXT,
    "draftDate" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "postUrn" TEXT,
    "url" TEXT,
    "impressions" INTEGER,
    "membersReached" INTEGER,
    "reactions" INTEGER,
    "comments" INTEGER,
    "reposts" INTEGER,
    "engagements" INTEGER,
    "metricsAt" TIMESTAMP(3),
    "metricsSource" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkedInPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LinkedInConnection_userId_key" ON "LinkedInConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LinkedInPost_postUrn_key" ON "LinkedInPost"("postUrn");

-- CreateIndex
CREATE INDEX "LinkedInPost_status_scheduledAt_idx" ON "LinkedInPost"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "LinkedInPost_draftDate_idx" ON "LinkedInPost"("draftDate");

-- AddForeignKey
ALTER TABLE "LinkedInConnection" ADD CONSTRAINT "LinkedInConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AlterTable
ALTER TABLE "LinkedInPost" ADD COLUMN     "photoId" TEXT;

-- CreateTable
CREATE TABLE "LinkedInPhoto" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkedInPhoto_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "LinkedInPost" ADD CONSTRAINT "LinkedInPost_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "LinkedInPhoto"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- AlterTable
ALTER TABLE "LinkedInPost" ADD COLUMN     "icpShare" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "LinkedInSettings" ADD COLUMN     "accountIcpShare" DOUBLE PRECISION,
ADD COLUMN     "icp" TEXT NOT NULL DEFAULT 'Versicherungsvermittler in Deutschland: Ausschließlichkeitsvertreter (z. B. Allianz-Agenturen), Mehrfachagenten und Makler, die mehr Neukunden wollen. Sie verkaufen z. B. PKV, Privatschutz und Tierkrankenversicherung. Wir verkaufen ihnen Leadgenerierung über Meta-Werbung plus unsere Software mit WhatsApp-Assistent, der Leads qualifiziert und Termine bucht.',
ADD COLUMN     "icpKeywords" TEXT NOT NULL DEFAULT 'versicherung, insurance, makler, broker, vermittler, agentur, generalvertret, hauptvertret, finanzberat, financial advisor, allianz, ergo, axa, signal iduna, debeka, hallesche, gothaer';

