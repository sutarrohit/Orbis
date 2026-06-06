-- AlterTable
ALTER TABLE "social_account" ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "lastHealthCheckAt" TIMESTAMP(3),
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "sessionString" TEXT;
