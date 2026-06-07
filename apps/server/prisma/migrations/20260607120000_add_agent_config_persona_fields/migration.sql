-- AlterTable
ALTER TABLE "agent_config" ADD COLUMN "personaName" TEXT NOT NULL DEFAULT '',
ADD COLUMN "responseStyle" TEXT NOT NULL DEFAULT '',
ADD COLUMN "personaDescription" TEXT NOT NULL DEFAULT '',
ADD COLUMN "voiceDescription" TEXT NOT NULL DEFAULT '',
ADD COLUMN "knowledgeBase" TEXT NOT NULL DEFAULT '',
ADD COLUMN "maxResponseLength" INTEGER NOT NULL DEFAULT 0;
