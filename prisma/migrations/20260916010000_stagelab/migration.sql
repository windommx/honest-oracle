-- AlterTable
ALTER TABLE "UsageDay" ADD COLUMN     "stageRuns" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "StageStock" (
    "id" SERIAL NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "ma30w" DOUBLE PRECISION NOT NULL,
    "ma30wSlopePct" DOUBLE PRECISION NOT NULL,
    "weeklyVolumeM" DOUBLE PRECISION NOT NULL,
    "mansfieldRs" DOUBLE PRECISION NOT NULL,
    "epsGrowthPct" DOUBLE PRECISION NOT NULL,
    "rsScore" INTEGER NOT NULL,
    "fundScore" INTEGER NOT NULL,
    "stage" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageMarketReview" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "weekOf" TEXT NOT NULL,
    "setIndex" DOUBLE PRECISION NOT NULL DEFAULT 1300,
    "breadthPct" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "setAboveMa" BOOLEAN NOT NULL DEFAULT false,
    "maRising" BOOLEAN NOT NULL DEFAULT false,
    "breadthOk" BOOLEAN NOT NULL DEFAULT false,
    "adConfirm" BOOLEAN NOT NULL DEFAULT false,
    "foreignBuy" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "scoredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StageMarketReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageSector" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stage" INTEGER NOT NULL DEFAULT 2,
    "rsVsSet" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trend" TEXT NOT NULL DEFAULT 'RISING',
    "volume" TEXT NOT NULL DEFAULT 'NORMAL',
    "score" INTEGER NOT NULL DEFAULT 3,
    "weekOf" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageSector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageWatchlistItem" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "stage" INTEGER NOT NULL DEFAULT 2,
    "setup" TEXT NOT NULL DEFAULT 'Breakout',
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "stopLoss" DOUBLE PRECISION NOT NULL,
    "targetPrice" DOUBLE PRECISION NOT NULL,
    "rsScore" INTEGER NOT NULL DEFAULT 5,
    "fundScore" INTEGER NOT NULL DEFAULT 5,
    "priority" TEXT NOT NULL DEFAULT 'B',
    "status" TEXT NOT NULL DEFAULT 'WATCHING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StageWatchlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StagePosition" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "currentPrice" DOUBLE PRECISION NOT NULL,
    "entryStage" INTEGER NOT NULL DEFAULT 2,
    "currentStage" INTEGER NOT NULL DEFAULT 2,
    "stopLoss" DOUBLE PRECISION NOT NULL,
    "confidence" TEXT NOT NULL DEFAULT 'B',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedPrice" DOUBLE PRECISION,
    "closedAt" TIMESTAMP(3),
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StagePosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageActionItem" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "weekOf" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageActionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageJournalEntry" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "bias" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "pnlPct" DOUBLE PRECISION,
    "lesson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageJournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageChecklistItem" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StageChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageThesis" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "stockStage" INTEGER NOT NULL DEFAULT 2,
    "tripleConfirm" BOOLEAN NOT NULL DEFAULT false,
    "tech17" INTEGER NOT NULL DEFAULT 0,
    "epsGrowthPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "epsAccelerating" BOOLEAN NOT NULL DEFAULT false,
    "cfoGeNi" BOOLEAN NOT NULL DEFAULT false,
    "revenueGrowthPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recurringRev" BOOLEAN NOT NULL DEFAULT false,
    "gmExpanding" BOOLEAN NOT NULL DEFAULT false,
    "opMarginAboveInd" BOOLEAN NOT NULL DEFAULT false,
    "debtEquity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "currentRatio" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "fcfYieldPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "foreignNetBuy" BOOLEAN NOT NULL DEFAULT false,
    "fundIncreasing" BOOLEAN NOT NULL DEFAULT false,
    "insiderBuying" BOOLEAN NOT NULL DEFAULT false,
    "fundScore" INTEGER NOT NULL DEFAULT 0,
    "catalyst" TEXT NOT NULL DEFAULT '',
    "earningsDate" TEXT,
    "riskNote" TEXT,
    "entryStrategy" TEXT NOT NULL DEFAULT 'Breakout',
    "entryPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stopLoss" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "target1" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "target2" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "combinedScore" INTEGER NOT NULL DEFAULT 0,
    "tier" TEXT NOT NULL DEFAULT 'D',
    "foreignFlow" TEXT NOT NULL DEFAULT 'FLAT',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StageThesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageEarningsQuarter" (
    "id" SERIAL NOT NULL,
    "thesisId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "eps" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StageEarningsQuarter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageNightlySnapshot" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "night" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prevHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "summary" TEXT NOT NULL,

    CONSTRAINT "StageNightlySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StageStock_symbol_key" ON "StageStock"("symbol");

-- CreateIndex
CREATE INDEX "StageMarketReview_userId_idx" ON "StageMarketReview"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StageMarketReview_userId_weekOf_key" ON "StageMarketReview"("userId", "weekOf");

-- CreateIndex
CREATE INDEX "StageSector_userId_idx" ON "StageSector"("userId");

-- CreateIndex
CREATE INDEX "StageSector_userId_score_idx" ON "StageSector"("userId", "score");

-- CreateIndex
CREATE INDEX "StageWatchlistItem_userId_idx" ON "StageWatchlistItem"("userId");

-- CreateIndex
CREATE INDEX "StageWatchlistItem_userId_status_idx" ON "StageWatchlistItem"("userId", "status");

-- CreateIndex
CREATE INDEX "StageWatchlistItem_userId_symbol_idx" ON "StageWatchlistItem"("userId", "symbol");

-- CreateIndex
CREATE INDEX "StagePosition_userId_idx" ON "StagePosition"("userId");

-- CreateIndex
CREATE INDEX "StagePosition_userId_status_idx" ON "StagePosition"("userId", "status");

-- CreateIndex
CREATE INDEX "StageActionItem_userId_idx" ON "StageActionItem"("userId");

-- CreateIndex
CREATE INDEX "StageActionItem_userId_weekOf_idx" ON "StageActionItem"("userId", "weekOf");

-- CreateIndex
CREATE INDEX "StageJournalEntry_userId_idx" ON "StageJournalEntry"("userId");

-- CreateIndex
CREATE INDEX "StageJournalEntry_userId_createdAt_idx" ON "StageJournalEntry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "StageChecklistItem_userId_idx" ON "StageChecklistItem"("userId");

-- CreateIndex
CREATE INDEX "StageChecklistItem_userId_category_sortOrder_idx" ON "StageChecklistItem"("userId", "category", "sortOrder");

-- CreateIndex
CREATE INDEX "StageThesis_userId_idx" ON "StageThesis"("userId");

-- CreateIndex
CREATE INDEX "StageThesis_userId_symbol_idx" ON "StageThesis"("userId", "symbol");

-- CreateIndex
CREATE INDEX "StageEarningsQuarter_thesisId_idx" ON "StageEarningsQuarter"("thesisId");

-- CreateIndex
CREATE INDEX "StageNightlySnapshot_userId_idx" ON "StageNightlySnapshot"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StageNightlySnapshot_userId_night_key" ON "StageNightlySnapshot"("userId", "night");

-- AddForeignKey
ALTER TABLE "StageMarketReview" ADD CONSTRAINT "StageMarketReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageSector" ADD CONSTRAINT "StageSector_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageWatchlistItem" ADD CONSTRAINT "StageWatchlistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StagePosition" ADD CONSTRAINT "StagePosition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageActionItem" ADD CONSTRAINT "StageActionItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageJournalEntry" ADD CONSTRAINT "StageJournalEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageChecklistItem" ADD CONSTRAINT "StageChecklistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageThesis" ADD CONSTRAINT "StageThesis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageEarningsQuarter" ADD CONSTRAINT "StageEarningsQuarter_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "StageThesis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageNightlySnapshot" ADD CONSTRAINT "StageNightlySnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

