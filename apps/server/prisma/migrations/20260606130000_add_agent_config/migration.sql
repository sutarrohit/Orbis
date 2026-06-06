-- CreateTable
CREATE TABLE "agent_config" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "agentType" "AgentType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "voiceTags" TEXT[],
    "behaviorRules" TEXT[],
    "bannedTopics" TEXT[],
    "systemPrompt" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_config_brandId_idx" ON "agent_config"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_config_brandId_agentType_key" ON "agent_config"("brandId", "agentType");

-- AddForeignKey
ALTER TABLE "agent_config" ADD CONSTRAINT "agent_config_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
