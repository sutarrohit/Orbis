-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('telegram', 'discord');

-- CreateEnum
CREATE TYPE "SocialAccountStatus" AS ENUM ('active', 'paused', 'restricted');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('new', 'prospect', 'nurturing', 'cold', 'lost', 'converted');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('talk', 'inbound', 'outbound');

-- CreateEnum
CREATE TYPE "InterestLevel" AS ENUM ('hot', 'warm', 'cool', 'skip');

-- CreateEnum
CREATE TYPE "CommunityStatus" AS ENUM ('pending_join', 'joined', 'rejected');

-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('leader', 'search', 'research', 'talk', 'sales');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('idle', 'running', 'error');

-- CreateEnum
CREATE TYPE "PendingSendStatus" AS ENUM ('queued', 'sent', 'failed');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "niche" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_profile" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "persona" TEXT NOT NULL DEFAULT '',
    "productSummary" TEXT NOT NULL DEFAULT '',
    "pricing" TEXT NOT NULL DEFAULT '',
    "conversionAction" TEXT NOT NULL DEFAULT '',
    "objectionNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_account" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL DEFAULT 'telegram',
    "externalId" TEXT NOT NULL,
    "handle" TEXT NOT NULL DEFAULT '',
    "phone" TEXT,
    "displayName" TEXT,
    "sessionString" TEXT,
    "status" "SocialAccountStatus" NOT NULL DEFAULT 'active',
    "lastHealthCheckAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL DEFAULT '',
    "score" INTEGER NOT NULL DEFAULT 0,
    "interestLevel" "InterestLevel" NOT NULL DEFAULT 'cool',
    "status" "LeadStatus" NOT NULL DEFAULT 'new',
    "source" "LeadSource" NOT NULL DEFAULT 'talk',
    "note" TEXT NOT NULL DEFAULT '',
    "painPoints" TEXT[],
    "recommendedApproach" TEXT NOT NULL DEFAULT '',
    "sourceGroupChatId" TEXT NOT NULL DEFAULT '',
    "outreachStage" INTEGER NOT NULL DEFAULT 0,
    "lastOutreachAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "nicheRelevance" INTEGER NOT NULL DEFAULT 0,
    "status" "CommunityStatus" NOT NULL DEFAULT 'pending_join',
    "source" TEXT NOT NULL DEFAULT 'search',
    "foundVia" TEXT NOT NULL DEFAULT 'llm',
    "sourceUrl" TEXT NOT NULL DEFAULT '',
    "groupChatId" TEXT NOT NULL DEFAULT '',
    "assignedAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL DEFAULT '',
    "groupChatId" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_member" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL DEFAULT '',
    "groupChatId" TEXT NOT NULL DEFAULT '',
    "bio" TEXT NOT NULL DEFAULT '',
    "activityNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_send" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stage" INTEGER NOT NULL DEFAULT 0,
    "status" "PendingSendStatus" NOT NULL DEFAULT 'queued',
    "dedupKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "pending_send_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_state" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "agentType" "AgentType" NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'idle',
    "currentTask" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_activity" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "agent" "AgentType" NOT NULL,
    "action" TEXT NOT NULL,
    "detail" JSONB,
    "dedupKey" TEXT,
    "accountId" TEXT,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "token_usage" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "agent" "AgentType" NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "token_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_config" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "agentType" "AgentType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "personaName" TEXT NOT NULL DEFAULT '',
    "responseStyle" TEXT NOT NULL DEFAULT '',
    "personaDescription" TEXT NOT NULL DEFAULT '',
    "voiceTags" TEXT[],
    "voiceDescription" TEXT NOT NULL DEFAULT '',
    "behaviorRules" TEXT[],
    "bannedTopics" TEXT[],
    "systemPrompt" TEXT NOT NULL DEFAULT '',
    "knowledgeBase" TEXT NOT NULL DEFAULT '',
    "maxResponseLength" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "brand_slug_key" ON "brand"("slug");

-- CreateIndex
CREATE INDEX "brand_ownerId_idx" ON "brand"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "brand_profile_brandId_key" ON "brand_profile"("brandId");

-- CreateIndex
CREATE INDEX "social_account_brandId_idx" ON "social_account"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "social_account_brandId_externalId_key" ON "social_account"("brandId", "externalId");

-- CreateIndex
CREATE INDEX "lead_brandId_status_idx" ON "lead"("brandId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "lead_brandId_userId_key" ON "lead"("brandId", "userId");

-- CreateIndex
CREATE INDEX "community_brandId_status_idx" ON "community"("brandId", "status");

-- CreateIndex
CREATE INDEX "community_assignedAccountId_idx" ON "community"("assignedAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "community_brandId_handle_key" ON "community"("brandId", "handle");

-- CreateIndex
CREATE INDEX "conversation_brandId_idx" ON "conversation"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_brandId_userId_groupChatId_ts_key" ON "conversation"("brandId", "userId", "groupChatId", "ts");

-- CreateIndex
CREATE INDEX "group_member_brandId_idx" ON "group_member"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "group_member_brandId_userId_groupChatId_key" ON "group_member"("brandId", "userId", "groupChatId");

-- CreateIndex
CREATE INDEX "pending_send_brandId_status_idx" ON "pending_send"("brandId", "status");

-- CreateIndex
CREATE INDEX "pending_send_leadId_idx" ON "pending_send"("leadId");

-- CreateIndex
CREATE INDEX "pending_send_accountId_idx" ON "pending_send"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "pending_send_brandId_dedupKey_key" ON "pending_send"("brandId", "dedupKey");

-- CreateIndex
CREATE UNIQUE INDEX "agent_state_brandId_agentType_key" ON "agent_state"("brandId", "agentType");

-- CreateIndex
CREATE INDEX "agent_activity_brandId_agent_action_ts_idx" ON "agent_activity"("brandId", "agent", "action", "ts");

-- CreateIndex
CREATE INDEX "agent_activity_brandId_agent_action_dedupKey_idx" ON "agent_activity"("brandId", "agent", "action", "dedupKey");

-- CreateIndex
CREATE INDEX "token_usage_brandId_ts_idx" ON "token_usage"("brandId", "ts");

-- CreateIndex
CREATE INDEX "learning_brandId_idx" ON "learning"("brandId");

-- CreateIndex
CREATE INDEX "agent_config_brandId_idx" ON "agent_config"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_config_brandId_agentType_key" ON "agent_config"("brandId", "agentType");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand" ADD CONSTRAINT "brand_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_profile" ADD CONSTRAINT "brand_profile_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_account" ADD CONSTRAINT "social_account_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community" ADD CONSTRAINT "community_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community" ADD CONSTRAINT "community_assignedAccountId_fkey" FOREIGN KEY ("assignedAccountId") REFERENCES "social_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_member" ADD CONSTRAINT "group_member_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_send" ADD CONSTRAINT "pending_send_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_send" ADD CONSTRAINT "pending_send_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_send" ADD CONSTRAINT "pending_send_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "social_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_state" ADD CONSTRAINT "agent_state_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_activity" ADD CONSTRAINT "agent_activity_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "token_usage" ADD CONSTRAINT "token_usage_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning" ADD CONSTRAINT "learning_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_config" ADD CONSTRAINT "agent_config_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
