-- CreateTable
CREATE TABLE "scheduler_config" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "leaderIntervalMinutes" INTEGER NOT NULL DEFAULT 5,
    "followupIntervalMinutes" INTEGER NOT NULL DEFAULT 15,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduler_config_pkey" PRIMARY KEY ("id")
);
