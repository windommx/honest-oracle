-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "role" TEXT NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Analysis" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "birthday" TEXT NOT NULL,
    "totalScore" DOUBLE PRECISION NOT NULL,
    "kalaiganiScore" DOUBLE PRECISION NOT NULL,
    "numerologyScore" DOUBLE PRECISION NOT NULL,
    "taksaScore" DOUBLE PRECISION NOT NULL,
    "phoneticScore" DOUBLE PRECISION NOT NULL,
    "elementScore" DOUBLE PRECISION NOT NULL,
    "details" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorporateAnalysis" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "brandName" TEXT NOT NULL,
    "founderBirthday" TEXT NOT NULL,
    "industryType" TEXT NOT NULL,
    "targetAudience" TEXT NOT NULL,
    "cai" DOUBLE PRECISION NOT NULL,
    "s1" DOUBLE PRECISION NOT NULL,
    "s2" DOUBLE PRECISION NOT NULL,
    "s3" DOUBLE PRECISION NOT NULL,
    "elementBalance" DOUBLE PRECISION NOT NULL,
    "phoneticPricing" TEXT NOT NULL,
    "memorabilityScore" DOUBLE PRECISION NOT NULL,
    "resonanceTriangle" TEXT NOT NULL,
    "warnings" TEXT NOT NULL,
    "recommendations" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorporateAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChildAnalysis" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "gender" TEXT NOT NULL,
    "birthDay" TEXT NOT NULL,
    "parentGoals" TEXT NOT NULL,
    "recommendedLetters" TEXT NOT NULL,
    "avoidedLetters" TEXT NOT NULL,
    "targetNumber" INTEGER NOT NULL,
    "ayatana" INTEGER NOT NULL,
    "warakkasaEmphasis" TEXT NOT NULL,
    "suggestedNames" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChildAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RenameAnalysis" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "currentName" TEXT NOT NULL,
    "currentSurname" TEXT NOT NULL,
    "birthDay" TEXT NOT NULL,
    "goals" TEXT NOT NULL,
    "problemAreas" TEXT NOT NULL,
    "targetNumber" INTEGER NOT NULL,
    "targetAyatana" INTEGER NOT NULL,
    "recommendedWarakkasa" TEXT NOT NULL,
    "suggestedNewNames" TEXT NOT NULL,
    "softTransitionTips" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RenameAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OracleReading" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "inputName" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3) NOT NULL,
    "birthTime" TEXT,
    "birthPlace" TEXT,
    "result" JSONB NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "shareToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OracleReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageDay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "oracleReads" INTEGER NOT NULL DEFAULT 0,
    "apiCalls" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RushProject" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subGenre" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "shareToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RushProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RushProjectVersion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RushProjectVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "OracleReading_shareToken_key" ON "OracleReading"("shareToken");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeCustomerId_key" ON "Subscription"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "UsageDay_userId_day_key" ON "UsageDay"("userId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "RushProject_shareToken_key" ON "RushProject"("shareToken");

-- AddForeignKey
ALTER TABLE "Analysis" ADD CONSTRAINT "Analysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorporateAnalysis" ADD CONSTRAINT "CorporateAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildAnalysis" ADD CONSTRAINT "ChildAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RenameAnalysis" ADD CONSTRAINT "RenameAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OracleReading" ADD CONSTRAINT "OracleReading_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageDay" ADD CONSTRAINT "UsageDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RushProject" ADD CONSTRAINT "RushProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RushProjectVersion" ADD CONSTRAINT "RushProjectVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "RushProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

