/**
 * Populate every table with dummy data for a single user.
 *
 * Usage (from apps/server):
 *   pnpm tsx scripts/seed-dummy-user.ts [email]
 *
 * Defaults to noreply3175@gmail.com. The user must already exist.
 * Re-runnable: unique fields are suffixed with a short random token so each
 * run adds a fresh brand + full set of related rows without colliding.
 */
import { prisma } from "@/src/lib/prisma.js";

const EMAIL = process.argv[2] ?? "noreply3175@gmail.com";
const sfx = Math.random().toString(36).slice(2, 8); // unique suffix per run
const now = Date.now();
const daysAgo = (d: number) => new Date(now - d * 24 * 60 * 60 * 1000);
const minsAgo = (m: number) => new Date(now - m * 60 * 1000);

async function main() {
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!user) {
    throw new Error(`No user with email ${EMAIL}. Create the user first.`);
  }
  console.log(`👤 Seeding dummy data for ${user.email} (${user.id})`);

  // ── User-scoped auth tables ────────────────────────────────────────────────
  await prisma.session.create({
    data: {
      userId: user.id,
      token: `sess_${sfx}_${Math.random().toString(36).slice(2)}`,
      expiresAt: daysAgo(-7), // expires 7 days from now
      ipAddress: "203.0.113.42",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Orbis/Seed"
    }
  });

  await prisma.account.create({
    data: {
      userId: user.id,
      accountId: `google_${sfx}`,
      providerId: "google",
      accessToken: `at_${sfx}`,
      refreshToken: `rt_${sfx}`,
      scope: "openid email profile",
      accessTokenExpiresAt: daysAgo(-1)
    }
  });

  // ── Verification (not user-linked, but part of "all tables") ────────────────
  await prisma.verification.create({
    data: {
      identifier: user.email,
      value: `verify_${sfx}`,
      expiresAt: daysAgo(-1)
    }
  });

  // ── Brand (tenant root) ─────────────────────────────────────────────────────
  // The frontend resolves "the user's brand" as the OLDEST brand for the user
  // (getBrandForUser: orderBy createdAt asc). So we MUST attach dummy data to
  // that existing brand — creating a new one leaves the data invisible in the UI.
  const profileData = {
    persona: "Friendly growth consultant who helps SaaS founders scale outreach.",
    productSummary: "Orbis automates community-led growth across Telegram and Discord.",
    pricing: "$49/mo Starter, $149/mo Pro, custom Enterprise.",
    conversionAction: "Book a 15-minute demo call.",
    objectionNotes: "If they say 'too expensive', emphasize ROI vs. hiring an SDR."
  };

  let brand = await prisma.brand.findFirst({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" }
  });

  if (brand) {
    console.log(`🏷️  Using existing brand ${brand.id} (${brand.name})`);
    // Ensure it has a sales profile (existing onboarding brands may lack one).
    await prisma.brandProfile.upsert({
      where: { brandId: brand.id },
      create: { brandId: brand.id, ...profileData },
      update: profileData
    });
  } else {
    brand = await prisma.brand.create({
      data: {
        ownerId: user.id,
        name: `Acme Growth ${sfx}`,
        slug: `acme-growth-${sfx}`,
        niche: "B2B SaaS productivity tools",
        active: true,
        profile: { create: profileData }
      }
    });
    console.log(`🏷️  Created brand ${brand.id}`);
  }

  // ── Social accounts ─────────────────────────────────────────────────────────
  const tgAccount = await prisma.socialAccount.create({
    data: {
      brandId: brand.id,
      platform: "telegram",
      externalId: `tg_${sfx}_1`,
      handle: "@acme_growth_bot",
      phone: "+15551234567",
      displayName: "Acme Growth (Telegram)",
      status: "active",
      lastHealthCheckAt: minsAgo(10)
    }
  });
  const dcAccount = await prisma.socialAccount.create({
    data: {
      brandId: brand.id,
      platform: "discord",
      externalId: `dc_${sfx}_1`,
      handle: "AcmeGrowth#4242",
      displayName: "Acme Growth (Discord)",
      status: "paused",
      lastHealthCheckAt: minsAgo(120)
    }
  });

  // ── Communities ─────────────────────────────────────────────────────────────
  const community1 = await prisma.community.create({
    data: {
      brandId: brand.id,
      handle: `saas-founders-${sfx}`,
      name: "SaaS Founders Hub",
      nicheRelevance: 92,
      status: "joined",
      source: "search",
      foundVia: "llm",
      sourceUrl: "https://t.me/saasfounders",
      groupChatId: "-1001234567890",
      assignedAccountId: tgAccount.id
    }
  });
  await prisma.community.create({
    data: {
      brandId: brand.id,
      handle: `indie-hackers-${sfx}`,
      name: "Indie Hackers Lounge",
      nicheRelevance: 78,
      status: "pending_join",
      source: "search",
      foundVia: "manual",
      sourceUrl: "https://discord.gg/indiehackers"
    }
  });

  // ── Leads ───────────────────────────────────────────────────────────────────
  const lead1 = await prisma.lead.create({
    data: {
      brandId: brand.id,
      userId: `tg_user_${sfx}_1001`,
      username: "founder_jane",
      score: 85,
      interestLevel: "hot",
      status: "prospect",
      source: "talk",
      note: "Runs a 12-person SaaS, frustrated with manual community outreach.",
      painPoints: ["manual outreach", "low reply rates", "no SDR budget"],
      recommendedApproach: "Lead with time savings and the demo offer.",
      sourceGroupChatId: community1.groupChatId,
      outreachStage: 1,
      lastOutreachAt: daysAgo(1)
    }
  });
  await prisma.lead.create({
    data: {
      brandId: brand.id,
      userId: `tg_user_${sfx}_1002`,
      username: "bootstrap_bob",
      score: 40,
      interestLevel: "warm",
      status: "nurturing",
      source: "outbound",
      note: "Curious but price-sensitive.",
      painPoints: ["budget constraints"],
      recommendedApproach: "Share ROI case study before pitching.",
      outreachStage: 0
    }
  });
  await prisma.lead.create({
    data: {
      brandId: brand.id,
      userId: `tg_user_${sfx}_1003`,
      username: "scale_sara",
      score: 95,
      interestLevel: "hot",
      status: "converted",
      source: "inbound",
      note: "Signed up for Pro plan after demo.",
      painPoints: [],
      recommendedApproach: "Onboard and upsell Enterprise later.",
      outreachStage: 3,
      lastOutreachAt: daysAgo(3)
    }
  });

  // ── Conversations (inbound bus) ─────────────────────────────────────────────
  await prisma.conversation.createMany({
    data: [
      {
        brandId: brand.id,
        userId: `tg_user_${sfx}_1001`,
        username: "founder_jane",
        groupChatId: community1.groupChatId,
        text: "Honestly outreach is eating my whole week, anyone automating this?",
        ts: minsAgo(45)
      },
      {
        brandId: brand.id,
        userId: `tg_user_${sfx}_1002`,
        username: "bootstrap_bob",
        groupChatId: community1.groupChatId,
        text: "Tools like that are usually way too pricey for bootstrappers.",
        ts: minsAgo(30)
      },
      {
        brandId: brand.id,
        userId: `tg_user_${sfx}_1004`,
        username: "lurker_lee",
        groupChatId: community1.groupChatId,
        text: "+1, would love a recommendation",
        ts: minsAgo(20)
      }
    ]
  });

  // ── Group members (outbound prospect pool) ──────────────────────────────────
  await prisma.groupMember.createMany({
    data: [
      {
        brandId: brand.id,
        userId: `tg_user_${sfx}_1001`,
        username: "founder_jane",
        groupChatId: community1.groupChatId,
        bio: "Founder @ TaskFlow. Building in public.",
        activityNote: "Active daily, posts about growth."
      },
      {
        brandId: brand.id,
        userId: `tg_user_${sfx}_1005`,
        username: "quiet_quinn",
        groupChatId: community1.groupChatId,
        bio: "Solo dev, SaaS curious.",
        activityNote: "Lurker, rarely posts."
      }
    ]
  });

  // ── Pending sends (outbound DM queue) ───────────────────────────────────────
  await prisma.pendingSend.createMany({
    data: [
      {
        brandId: brand.id,
        leadId: lead1.id,
        accountId: tgAccount.id,
        message: "Hi Jane! Saw your note about outreach eating your week — mind if I show you how Orbis automates it?",
        stage: 1,
        status: "sent",
        dedupKey: `dm_${sfx}_${lead1.id}_1`,
        sentAt: daysAgo(1)
      },
      {
        brandId: brand.id,
        leadId: lead1.id,
        accountId: tgAccount.id,
        message: "Following up — here's a 90-second demo: https://orbis.example/demo",
        stage: 2,
        status: "queued",
        dedupKey: `dm_${sfx}_${lead1.id}_2`
      }
    ]
  });

  // ── Agent states (one per agent type) ───────────────────────────────────────
  const agentTypes = ["leader", "search", "research", "talk", "sales"] as const;
  await prisma.agentState.createMany({
    data: agentTypes.map((agentType, i) => ({
      brandId: brand.id,
      agentType,
      status: (i === 0 ? "running" : i === 4 ? "error" : "idle") as
        | "running"
        | "error"
        | "idle",
      currentTask:
        i === 0 ? "Coordinating outreach cycle" : i === 4 ? "Rate limited by platform" : "",
      startedAt: i === 0 ? minsAgo(5) : null
    }))
  });

  // ── Agent configs (one per agent type) ──────────────────────────────────────
  await prisma.agentConfig.createMany({
    data: [
      {
        brandId: brand.id,
        agentType: "leader",
        personaName: "Atlas",
        responseStyle: "strategic",
        personaDescription: "Coordinates the other agents and sets daily priorities.",
        voiceTags: ["decisive", "concise"],
        voiceDescription: "Direct and goal-oriented.",
        behaviorRules: ["Always prioritize hot leads", "Never spam communities"],
        bannedTopics: ["politics", "competitors by name"],
        systemPrompt: "You are the leader agent coordinating a growth team.",
        knowledgeBase: "Orbis automates community-led growth.",
        maxResponseLength: 0
      },
      {
        brandId: brand.id,
        agentType: "talk",
        personaName: "Tessa",
        responseStyle: "friendly",
        personaDescription: "Engages naturally in community chats.",
        voiceTags: ["friendly", "casual", "helpful"],
        voiceDescription: "Warm, never salesy in public.",
        behaviorRules: ["Be genuinely helpful first", "Don't pitch in public channels"],
        bannedTopics: ["pricing in public"],
        systemPrompt: "You blend into communities and surface leads.",
        knowledgeBase: "Common SaaS growth pain points.",
        maxResponseLength: 80
      },
      {
        brandId: brand.id,
        agentType: "sales",
        personaName: "Sam",
        responseStyle: "professional",
        personaDescription: "Handles 1:1 DMs and closes demos.",
        voiceTags: ["professional", "persuasive"],
        voiceDescription: "Confident but not pushy.",
        behaviorRules: ["Always offer the demo", "Handle objections with empathy"],
        bannedTopics: ["unverified claims"],
        systemPrompt: "You convert warm leads into demo calls.",
        knowledgeBase: "Pricing tiers, ROI case studies, objection handling.",
        maxResponseLength: 120
      },
      {
        brandId: brand.id,
        agentType: "search",
        personaName: "Scout",
        responseStyle: "analytical",
        voiceTags: ["thorough"],
        behaviorRules: ["Prioritize high-relevance communities"],
        bannedTopics: []
      },
      {
        brandId: brand.id,
        agentType: "research",
        personaName: "Remy",
        responseStyle: "analytical",
        voiceTags: ["detail-oriented"],
        behaviorRules: ["Summarize lead signals accurately"],
        bannedTopics: []
      }
    ]
  });

  // ── Agent activity feed ─────────────────────────────────────────────────────
  await prisma.agentActivity.createMany({
    data: [
      {
        brandId: brand.id,
        agent: "search",
        action: "community_found",
        detail: { handle: community1.handle, relevance: 92 },
        dedupKey: `found_${sfx}_1`,
        ts: minsAgo(60)
      },
      {
        brandId: brand.id,
        agent: "talk",
        action: "message_sent",
        detail: { groupChatId: community1.groupChatId, text: "Helpful reply posted" },
        accountId: tgAccount.id,
        ts: minsAgo(40)
      },
      {
        brandId: brand.id,
        agent: "research",
        action: "lead_scored",
        detail: { username: "founder_jane", score: 85 },
        dedupKey: `score_${sfx}_1`,
        ts: minsAgo(35)
      },
      {
        brandId: brand.id,
        agent: "sales",
        action: "dm_sent",
        detail: { leadId: lead1.id, stage: 1 },
        accountId: tgAccount.id,
        ts: daysAgo(1)
      },
      {
        brandId: brand.id,
        agent: "leader",
        action: "cycle_started",
        detail: { leadsQueued: 3 },
        ts: minsAgo(5)
      }
    ]
  });

  // ── Token usage log ─────────────────────────────────────────────────────────
  await prisma.tokenUsage.createMany({
    data: [
      {
        brandId: brand.id,
        agent: "talk",
        model: "claude-haiku-4-5",
        promptTokens: 1200,
        completionTokens: 180,
        totalTokens: 1380,
        ts: minsAgo(40)
      },
      {
        brandId: brand.id,
        agent: "sales",
        model: "claude-opus-4-8",
        promptTokens: 3400,
        completionTokens: 520,
        totalTokens: 3920,
        ts: daysAgo(1)
      },
      {
        brandId: brand.id,
        agent: "research",
        model: "claude-sonnet-4-6",
        promptTokens: 2100,
        completionTokens: 340,
        totalTokens: 2440,
        ts: minsAgo(35)
      }
    ]
  });

  // ── Learnings (Leader strategy notes) ───────────────────────────────────────
  await prisma.learning.createMany({
    data: [
      {
        brandId: brand.id,
        text: "Leads from SaaS Founders Hub convert 2x better than indie hacker groups.",
        createdAt: daysAgo(2)
      },
      {
        brandId: brand.id,
        text: "Opening with a time-savings hook outperforms ROI hooks in cold DMs.",
        createdAt: daysAgo(1)
      },
      {
        brandId: brand.id,
        text: "Avoid pitching before 3 helpful public interactions — kills reply rate.",
        createdAt: minsAgo(90)
      }
    ]
  });

  console.log("✅ Dummy data created across all tables.");
  console.log({
    brand: brand.id,
    socialAccounts: [tgAccount.id, dcAccount.id],
    leads: 3,
    communities: 2,
    conversations: 3,
    groupMembers: 2,
    pendingSends: 2,
    agentStates: 5,
    agentConfigs: 5,
    activities: 5,
    tokenUsages: 3,
    learnings: 3
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
