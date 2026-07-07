/*
  Warnings:

  - You are about to drop the column `beforeSha` on the `analysis_jobs` table. All the data in the column will be lost.
  - You are about to drop the column `startedAt` on the `analysis_jobs` table. All the data in the column will be lost.
  - You are about to drop the column `webhookDeliveryId` on the `analysis_jobs` table. All the data in the column will be lost.
  - The `status` column on the `analysis_jobs` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `customSections` on the `repositories` table. All the data in the column will be lost.
  - You are about to drop the column `installationId` on the `repositories` table. All the data in the column will be lost.
  - You are about to drop the column `isMonorepo` on the `repositories` table. All the data in the column will be lost.
  - You are about to drop the column `monorepoRoots` on the `repositories` table. All the data in the column will be lost.
  - You are about to drop the `installations` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `sessions` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `userId` to the `repositories` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'FAILED', 'SKIPPED');

-- DropForeignKey
ALTER TABLE "analysis_jobs" DROP CONSTRAINT "analysis_jobs_repositoryId_fkey";

-- DropForeignKey
ALTER TABLE "cached_facts" DROP CONSTRAINT "cached_facts_repositoryId_fkey";

-- DropForeignKey
ALTER TABLE "installations" DROP CONSTRAINT "installations_userId_fkey";

-- DropForeignKey
ALTER TABLE "repositories" DROP CONSTRAINT "repositories_installationId_fkey";

-- DropForeignKey
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_userId_fkey";

-- DropIndex
DROP INDEX "analysis_jobs_repositoryId_createdAt_idx";

-- DropIndex
DROP INDEX "analysis_jobs_status_idx";

-- DropIndex
DROP INDEX "analysis_jobs_webhookDeliveryId_key";

-- AlterTable
ALTER TABLE "analysis_jobs" DROP COLUMN "beforeSha",
DROP COLUMN "startedAt",
DROP COLUMN "webhookDeliveryId",
DROP COLUMN "status",
ADD COLUMN     "status" "JobStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "repositories" DROP COLUMN "customSections",
DROP COLUMN "installationId",
DROP COLUMN "isMonorepo",
DROP COLUMN "monorepoRoots",
ADD COLUMN     "userId" TEXT NOT NULL;

-- DropTable
DROP TABLE "installations";

-- DropTable
DROP TABLE "sessions";

-- DropEnum
DROP TYPE "job_status";

-- AddForeignKey
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cached_facts" ADD CONSTRAINT "cached_facts_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
