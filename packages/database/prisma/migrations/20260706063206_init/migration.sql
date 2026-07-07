-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "githubId" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "email" TEXT,
    "accessToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installations" (
    "id" TEXT NOT NULL,
    "githubInstallationId" INTEGER NOT NULL,
    "accountLogin" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "appId" INTEGER NOT NULL,
    "targetType" TEXT NOT NULL,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,

    CONSTRAINT "installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repositories" (
    "id" TEXT NOT NULL,
    "githubRepoId" INTEGER NOT NULL,
    "fullName" TEXT NOT NULL,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "trackedBranch" TEXT NOT NULL DEFAULT 'main',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "docStyle" TEXT NOT NULL DEFAULT 'standard',
    "aiProvider" TEXT,
    "customSections" JSONB,
    "isMonorepo" BOOLEAN NOT NULL DEFAULT false,
    "monorepoRoots" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "installationId" TEXT NOT NULL,

    CONSTRAINT "repositories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_jobs" (
    "id" TEXT NOT NULL,
    "status" "job_status" NOT NULL DEFAULT 'PENDING',
    "webhookDeliveryId" TEXT NOT NULL,
    "commitSha" TEXT NOT NULL,
    "beforeSha" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "changedFiles" TEXT[],
    "prUrl" TEXT,
    "prNumber" INTEGER,
    "docsChangedCount" INTEGER,
    "usedFallback" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "repositoryId" TEXT NOT NULL,

    CONSTRAINT "analysis_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cached_facts" (
    "id" TEXT NOT NULL,
    "factJson" JSONB NOT NULL,
    "commitSha" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "repositoryId" TEXT NOT NULL,

    CONSTRAINT "cached_facts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_githubId_key" ON "users"("githubId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "sessions"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "installations_githubInstallationId_key" ON "installations"("githubInstallationId");

-- CreateIndex
CREATE UNIQUE INDEX "repositories_githubRepoId_key" ON "repositories"("githubRepoId");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_jobs_webhookDeliveryId_key" ON "analysis_jobs"("webhookDeliveryId");

-- CreateIndex
CREATE INDEX "analysis_jobs_repositoryId_createdAt_idx" ON "analysis_jobs"("repositoryId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "analysis_jobs_status_idx" ON "analysis_jobs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "cached_facts_repositoryId_key" ON "cached_facts"("repositoryId");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installations" ADD CONSTRAINT "installations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "installations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cached_facts" ADD CONSTRAINT "cached_facts_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
