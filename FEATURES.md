# PostPilot — Complete Feature & Behavior Specification

> **Purpose of this document.** This is the canonical reference for *what PostPilot does and how it behaves*, written so the product can be **rebuilt on a new tech stack with a different agent framework** without reading the original source. It describes features, business logic, data, and algorithms in implementation-agnostic terms, and notes the current implementation only where the behavior depends on it.
>
> **Audience:** the engineering team rebuilding the product. Share freely.
>
> **Status:** reflects the shipped V0.2 codebase (Next.js + Python/Hermes + Postgres). Companion docs: `PROJECT_OVERVIEW.md`, `HOW_AGENTS_WORK.md`, `API_REFERENCE.md`.

---

## Table of contents

1. [Product summary](#1-product-summary)
2. [Core concepts & glossary](#2-core-concepts--glossary)
3. [Feature catalog](#3-feature-catalog)
4. [The agent squad — detailed behavior](#4-the-agent-squad--detailed-behavior)
5. [Operating modes](#5-operating-modes)
6. [The lead funnel & outreach state machine](#6-the-lead-funnel--outreach-state-machine)
7. [Scoring, decision rules & safety logic](#7-scoring-decision-rules--safety-logic)
8. [System architecture](#8-system-architecture)
9. [Data model](#9-data-model)
10. [External integrations](#10-external-integrations)
11. [Configuration](#11-configuration)
12. [Rebuild guidance (new stack + real agent framework)](#12-rebuild-guidance)
13. [Feature checklist](#13-feature-checklist)

---

## 1. Product summary

PostPilot is an **AI social-media automation platform for brand promotion**. A business owner defines their brand once; from then on a **squad of AI agents** works Telegram (and Discord) communities autonomously to **discover communities, engage genuinely in conversations, identify and score leads, and close them via direct messages** — all surfaced through a web dashboard.

It ships two products:
- **V0.2 — Lead-Generation Squad** (primary): a coordinated 5-agent system across many communities and accounts.
- **V0.1 — Content Broadcaster** (legacy): a 3-step pipeline that researches a topic and posts branded content to one channel.

The defining design principle: **the LLM makes judgments; deterministic code executes them.** Agents never act freely — they decide (often as structured JSON), and code carries it out under hard rules (rate limits, dedup, a lead state machine). All agents coordinate through a **shared database**, never by direct messaging.

---

## 2. Core concepts & glossary

| Term | Meaning |
|---|---|
| **User** | The human operator (business owner). Authenticates with email/password. One user → one brand. |
| **Brand** | The business identity: name, niche, voice, audience, knowledge, and global limits. Drives every agent prompt. |
| **Account** | A messaging identity the agents operate *as* — a Telegram **bot**, a Telegram **user account** (phone+session), or a **Discord** bot. A brand can have many. |
| **Persona** | The human-like character an account presents (name, description, voice). Configured per agent role. |
| **Community** | A group/supergroup/channel the brand targets. Has a join status, relevance score, and an assigned account. |
| **Group member** | A person observed inside a community (id, username, bio, last seen). Raw prospect pool. |
| **Lead / Prospect** | A scored person worth contacting. "Prospect" = outbound (found via member scraping); "lead" = inbound (found via conversation). Moves through a funnel. |
| **Conversation** | Any logged message — group or DM, from a user or an agent. |
| **Gateway** | The long-running process logged into one account; runs the Talk (groups) and Sales (DMs) roles and actually touches the platform. |
| **Leader** | The orchestrator agent; plans, spawns workers, queues DMs, resolves conflicts. |
| **Learning** | A reusable insight ("problem-first messaging converts better") shared across agents. |
| **Squad (V0.1)** | The content pipeline config (mission, schedule, constraints). |

---

## 3. Feature catalog

### 3.1 Authentication & session
- Email/password **registration** (password ≥ 8 chars, bcrypt-hashed, cost 12) and **login**.
- Cookie-based **sessions** (encrypted). **Logout** destroys the session.
- **Current-user endpoint** returns the user, their brand, and whether onboarding is complete (= a Telegram channel is connected).
- **Tenancy:** every feature is scoped to the logged-in user's single brand.

### 3.2 Onboarding (AI-assisted brand setup)
- **Manual brand setup:** name, niche, description, voice tags, voice description, target audience, content topics.
- **AI website extraction:** paste a brand URL (and optionally a competitor URL); the system extracts a full brand profile **and** generates per-agent configs (talk/sales/search/research/leader) automatically. Uses a **3-tier fallback**: (1) LLM with live web search, (2) web-scrape + LLM structured output, (3) alternate provider + built-in scraper. Returns which method succeeded.
- **AI interview ("refine"):** an LLM conducts a **deep-dive interview** (up to 6 focused questions) to fill knowledge gaps — product details, pricing, objections, voice, sales next-step — progressively enriching the brand and agent knowledge bases. It stops early once it has enough.
- **Voice onboarding (optional):** text-to-speech narration of the interview (graceful text-only fallback if no TTS key).

### 3.3 Channel connection
- **Telegram bot connection (V0.1):** verify a BotFather token, confirm the bot can access a target channel, and save the connection. Bot can post to channels and answer DMs.
- **Telegram user-account connection (V0.2):** phone-number login with **OTP** and optional **2FA password**, producing a reusable session. Required for joining groups, scraping members, and initiating DMs (a bot cannot do these).
- **Discord connection:** validate a Discord bot token and create a Discord account.

### 3.4 Multi-account management
- Create/list/update/delete accounts. Tokens stored **encrypted** (AES-256-GCM).
- Per-account: **persona** (name/description), **role** (`gateway` / `both`), **status** (`active`/`paused`/…), **auth status** (`pending`/`otp_sent`/`verified`), **platform** (`telegram`/`discord`).
- Account list is enriched with per-account community counts (total/joined/pending).
- **Start/stop a gateway** per account; **gateway status** shows which accounts are live (PID-tracked).

### 3.5 Agent configuration (per-role personas)
For each of the five roles (`leader`, `search`, `talk`, `research`, `sales`) you can configure:
- `persona_name`, `persona_description`, `system_prompt`
- `voice_tags`, `voice_description`, `response_style` (casual/professional/witty/empathetic/authoritative)
- `behavior_rules[]`, `banned_topics[]`, `knowledge_base` (the agent's "brain" about the product)
- `max_response_length`, `skip_ratio` (how often the Talk agent stays silent — default **0.9**), `active`

### 3.6 The agent squad
Five coordinated roles (full detail in §4): **Leader, Search, Talk, Research, Sales**. Controllable manually (run each step) or autonomously (deploy the Leader loop).

### 3.7 Community & member management
- Auto-discovered and manually-added communities, each with relevance score, member count, join status, assigned account, monitoring toggle.
- **Member directory** — every observed person per community, with bios and last-seen.
- **Auto-assignment:** the Leader distributes unassigned communities across active accounts round-robin, respecting a per-account cap.

### 3.8 Lead management & funnel
- Leads with **0–100 score**, interest level, pain points, interest signals, recommended approach, source, and funnel status.
- Lead detail view with full conversation history.
- Manual status/score overrides.
- Funnel stats (counts per stage) on the dashboard. See §6 for the state machine.

### 3.9 Conversations / inbox
- Unified conversation log (group + DM), filterable by lead or community.
- **Manual send:** an operator can send a DM through a running gateway.
- **Human takeover:** toggle **auto-reply off** per user so the AI stops and a human handles the thread.

### 3.10 Knowledge sharing (learnings)
- Agents and the Leader record **learnings** (insight + category + success rate).
- Learnings are **propagated** (marked shared) so all agents benefit; they feed back into future prompts.

### 3.11 Monitoring & observability
- **Live activity feed** — every agent action (spawned, discovered, queued DM, conflict resolved, etc.), API keys redacted.
- **Agent state** — per-agent status/PID/current task, with **crash detection & recovery** (reconciles DB state vs. real process liveness; surfaces crash reasons from logs).
- **Run logs** — incremental JSONL log tailing for live replay of a run.
- **Token & cost tracking** — per-agent input/output tokens and USD cost, summarized over a time window.

### 3.12 Safety / guardrails
- Global per-brand limits: **max groups per account** (default 10), **max DMs per day** (default 15), **max group replies per day** (default 30).
- **Deduplication:** never DM the same person from two accounts; detect and flag violations.
- **Account health gating:** only `active` accounts act; the Leader can pause accounts.
- **Spam-avoidance prompt standard:** outbound copy must be human, no emojis/hype/fake urgency, ≤120 words, reference shared context.

### 3.13 V0.1 content broadcaster (legacy/optional)
- A **squad config** (mission, frequency, post time, timezone, constraints).
- A **Scout → Quill → Hermes** pipeline: research a trending topic → write a branded post → publish to the channel.
- **Run history** and **content feed** with per-post metrics (views/forwards/reactions) and replayable agent traces.

---

## 4. The agent squad — detailed behavior

> Each "agent" is an isolated worker that loads state from the DB, asks an LLM to decide, then executes deterministically. They coordinate **only through the database**.

### 4.1 Leader (orchestrator)
**Role:** the brain. The only long-running coordinator. Does not talk to end users.

**Cadence:** persistent loop, one cycle every **5 minutes** (min 30s gap; can wake early when a worker finishes).

**Each cycle:**
1. Load full state — brand, accounts, communities, leads, learnings, 24h conversation stats, member stats, lead-status breakdown, dedup violations, and a **funnel breakdown**.
2. Build a prompt containing the funnel status and hard **decision rules**.
3. Ask the LLM for a **JSON action plan** (`spawn_search_agent`, `spawn_research_agent`, `gateway_actions`, `community_actions`, `lead_actions`, `conflict_resolutions`, `new_learnings`, `strategy_notes`).
4. Execute the plan deterministically: save/propagate learnings; spawn Search/Research workers (only if requested *and* not already running); **auto-assign** communities round-robin; activate/pause accounts; run the **outbound DM pipeline** (§6); record conflict resolutions; log token usage.

**Key constraint:** the Leader **does not start gateways** and **does not touch the platform**. It only spawns Search/Research, flips DB flags, and **queues DMs** into a pending-sends table for gateways to deliver.

### 4.2 Search (scout)
**Role:** discover target communities. **One-shot worker.**
- Uses web search to find Telegram group handles / invite links relevant to the brand's niche, audience, and topics.
- Saves each as a community with status **`pending_join`** and a relevance estimate. **It does not join** — joining is the gateway's job after assignment.
- Safety net: after the LLM finishes, a regex pass scrapes any missed `t.me` links / `@handles` from the output and saves them.

### 4.3 Talk (community engagement)
**Role:** be a genuine community member. **Runs inside the gateway**, triggered per inbound group message.
- Reads each group message and **usually stays silent** (returns a skip signal; governed by `skip_ratio`, default ~90%).
- Engages only on genuinely relevant messages (a real question, a pain point, a natural opening). Respects group rules and banned topics.
- Flags interested users as leads; any non-silent reply is phrased to be sent as a **private DM**, never a public group blast.

### 4.4 Research (lead analyst)
**Role:** mine the database and score people. **One-shot worker.** Skips if there's no data.
- **Inbound leads:** analyzes recent conversations, identifies people who showed interest, scores them 0–100, saves with status `new`.
- **Outbound prospecting:** pulls group members who have a username, aren't already leads, and haven't been DM'd; scores them on bio relevance + group activity + niche fit; saves the good ones as status **`prospect`**, source `outbound`, with a recommended approach.

### 4.5 Sales (closer)
**Role:** handle DM conversations and close. **Runs inside the gateway**, in DMs.
- When a known lead DMs (or replies to outreach), engages with the sales persona: understands the situation, presents the product/pricing from the knowledge base, handles objections, guides to the conversion action.
- Logs outcomes; respects dedup and rate limits.

### 4.6 Gateway (the platform connection)
**Role:** the hands. One **long-running** process per account, logged into the platform.
- Hosts **Talk** (groups) and **Sales** (DMs) roles, selected by message location.
- Background pollers: **deliver queued outbound DMs**; **join newly assigned communities and scrape up to ~200 members**; **catch up missed messages**.
- Writes every message to conversations and upserts observed senders into group members.
- PID-tracked for start/stop/status and crash recovery.

---

## 5. Operating modes

The same pipeline can be driven two ways:

**Manual mode** — the operator orchestrates:
1. Start a gateway per account.
2. Run Search → communities discovered.
3. Assign communities to accounts → gateways join + scrape.
4. Run Research → members scored into leads/prospects.
5. Review leads; send DMs manually or let outreach run.

**Autonomous mode** — deploy the Leader loop once (gateways still started manually). The Leader then runs Search/Research, assigns communities, and queues outbound DMs on its own every cycle.

**Invariant:** gateways are **always** started manually and are the only processes that touch the platform. Search/Research/outbound are either manual buttons or Leader-automated.

---

## 6. The lead funnel & outreach state machine

Lead `status` values: `new`, `prospect`, `contacted`, `nurturing`, `converted`, `cold`, `lost`.
`outreach_stage`: `0` → `3`. `source`: `organic` (inbound) or `outbound`.

**Outbound sequence (driven each Leader cycle, gated by `max_dms_per_day` per account):**

```
prospect (stage 0, score ≥ 60)
   └─► dedup check passes ─► generate warm first DM ─► queue send ─► status=contacted, stage=1
contacted (stage 1) + 48h no reply
   └─► follow-up #1 ─► queue send ─► stage=2
contacted (stage 2) + 48h no reply
   └─► final follow-up ─► queue send ─► stage=3
contacted (stage 3) + 48h no reply
   └─► status=cold
contacted (any stage) + user replied
   └─► status=nurturing
```

- **Account selection** for each send: prefer the account assigned to the lead's source community; otherwise the least-busy active account.
- **Dedup gate** before every first DM: skip if anyone has already DM'd this user.
- Converted/lost are terminal outcomes set from sales results or manual override.

---

## 7. Scoring, decision rules & safety logic

**Lead scoring (0–100), to replicate:**
- 80–100 = hot (clear pain point, asked about solutions); 60–79 = warm (active in relevant discussion); 40–59 = cool (some relevance); <40 = skip.
- Inputs: relevance of pain point, activity level (message count), group niche fit, prior interactions, bio relevance.
- Outbound prospect threshold for auto-DM: **score ≥ 60**. Prospect save threshold: **≥ 50**.

**Leader decision rules (the heuristics that drive orchestration):**
- joined communities `< 5` → spawn Search.
- joined `≥ 5` **and** scoreable members `> 20` → spawn Research (not Search).
- joined `≥ 10` → don't spawn Search unless user goals demand it.
- prospects `> 0` → outbound DMs go out automatically; no agent needed.
- never spawn a worker that's already running.

**Conflict resolution:**
- one person is never DM'd by two accounts (detected + flagged);
- per-account daily DM cap and group-reply cap;
- account spacing / health — paused or restricted accounts don't act.

**Outbound copy standard (quality gate):** sound human; context → one value point → one soft next step; 2–5 sentences, <120 words; reference the lead's group/message/bio; plain text, no emojis; no hype, guarantees, fake urgency, or repeated CTAs; at most one question; never invent pricing/claims.

---

## 8. System architecture

**Process model (current):**
- A **web app** (UI + API + DB access) — the control plane. It owns auth, configuration, and all data.
- **Worker processes** spawned on demand: Leader (persistent or single-cycle), Search (one-shot), Research (one-shot), Gateway (long-running, one per account).
- Workers are **detached OS subprocesses**; each emits structured **JSONL logs** captured into the activity feed (with secret redaction).

**Coordination:** there is **no direct agent-to-agent messaging**. The **database is the message bus**:

| Table | Producer → Consumer |
|---|---|
| `communities` | Search → Leader/Gateway |
| `pending_sends` | Leader → Gateway (delivers DMs) |
| `pending_*`/join queue | assignment → Gateway (joins+scrapes) |
| `group_members` | Gateway → Research |
| `conversations` | Gateway → Research/Leader |
| `leads` | Research → Leader → Gateway(Sales) |
| `learnings` | any → all |
| `agent_activity` / `agent_state` / `token_usage` | all → dashboard |

**Reasoning layer (to be replaced):** every agent's LLM call currently goes through the Hermes framework's `AIAgent` (one `.chat()` per decision) plus its tool registry, wrapped to use direct OpenAI with optional OpenRouter fallback. The **transport** for V0.2 is custom (Pyrogram for Telegram, discord.py for Discord), not the framework's adapters.

---

## 9. Data model

Authoritative tables (Postgres). Text columns holding arrays/objects are JSON-encoded strings.

| Table | Purpose & key columns |
|---|---|
| **users** | `id, name, email (unique), password_hash, created_at` |
| **brands** | one per user. Identity + `voice_tags, voice_description, target_audience, content_topics`; Telegram channel (`tg_bot_token, tg_channel_id, …`); `brand_url, competitor_url`; limits `max_groups_per_account=10, max_dms_per_day=15, max_group_replies_per_day=30`; `leader_goals` |
| **squads** | V0.1 config: `mission, frequency, post_time, timezone, constraints, learning_enabled, auto_skills, cron_job_id, status` |
| **runs** | V0.1 run records: `status, started/ended_at, scout/quill/hermes_session_id + _output, learning_note, error_message` |
| **posts** | V0.1 output: `text, format, hashtags, tg_message_id, status, views, forwards, reactions, posted_at` |
| **accounts** | `id (text), brand_id, bot_token_encrypted, persona_name/description, phone_number (unique), session_path, auth_status, session_string, role='both', status='paused', platform='telegram', discord_bot_token` |
| **communities** | `chat_id (unique), name, type, member_count, niche_relevance, message_rate_per_hour, assigned_account_id, conversion_rate, status, join_status, permissions, rules, monitoring_enabled` |
| **group_members** | `user_id, username, display_name, bio, group_chat_id, role, last_seen` — unique on (user_id, group_chat_id) |
| **leads** | `user_id, username, source_community_id, interest_level, pain_points, context, status='new', score, assigned_agent, recommended_approach, interest_signals, outreach_stage=0, last_outreach_at, source='organic'` — unique on (brand_id, user_id) |
| **conversations** | `account_id, community_id, lead_id, user_id, role(user/agent), message, chat_type(group/dm), agent_type, created_at` |
| **agent_configs** | per (brand, agent_type): persona, `system_prompt, voice_*, behavior_rules, banned_topics, knowledge_base, response_style, max_response_length, skip_ratio=0.9, active` |
| **learnings** | `source_account_id, insight, category, success_rate, propagated` |
| **auto_reply_disabled** | (brand_id, user_id) — human-takeover flag |
| **pending_sends** | outbound DM queue: `account_id, user_id, message, status(pending/sent/failed)` |
| **agent_activity** | `agent_type, action, target_type, target_id, details(json), created_at` |
| **agent_state** | per (brand, agent_type): `status, current_task, pid, started_at, updated_at` |
| **token_usage** | `agent_type, model, provider, input/output/total_tokens, cost_usd` |

---

## 10. External integrations

| Integration | Used for | Notes |
|---|---|---|
| **LLM provider (OpenAI)** | All agent reasoning + onboarding extraction/interview | Default chat model `gpt-4.1-mini`; structured JSON output; web-search tool for extraction |
| **OpenRouter** | Optional LLM fallback | Opt-in; triggers on quota/key/provider errors |
| **Firecrawl** | Website scraping for brand extraction | Falls back to built-in HTML fetch |
| **Telegram Bot API** | V0.1 channel posting + bot DMs | From a BotFather token |
| **Telegram user accounts (Pyrogram)** | V0.2 joining groups, scraping members, initiating DMs | Phone+OTP+2FA → reusable session |
| **Discord (discord.py)** | Discord gateway | Bot token |
| **ElevenLabs** | Voice narration in onboarding | Optional; text-only fallback |

---

## 11. Configuration

Environment variables (current implementation):

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection (app + workers share it) |
| `OPENAI_API_KEY` | Yes | LLM reasoning + extraction |
| `SESSION_SECRET` | Yes | Session encryption + token encryption key (≥32 chars) |
| `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` | For user accounts | Pyrogram auth (from my.telegram.org) |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_HOME_CHANNEL` | For V0.1 | Channel posting |
| `FIRECRAWL_API_KEY` | Optional | Better website scraping |
| `OPENROUTER_API_KEY` + enable flag | Optional | LLM fallback |
| `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` | Optional | Voice onboarding |

---

## 12. Rebuild guidance

Recommendations for the new stack + real agent framework. Keep the **behavior** (§§4–7); improve the **infrastructure**.

**Keep (product logic — port as-is):**
- The five roles and their responsibilities; the manual/autonomous duality.
- The lead funnel state machine (§6) and scoring thresholds (§7).
- The decision rules, dedup, rate limits, and outbound copy standard.
- The data model (§9) — it's clean and framework-independent.
- DB-as-source-of-truth for state and audit (activity/state/token tables).

**Replace / improve (where the current design strains):**
- **Reasoning layer:** swap the personal-assistant framework for a real agent framework (or direct provider SDKs). The agents only need: structured-output calls, tool/function calling, and a per-agent system prompt. Default to the latest capable models; add prompt caching for the large, repeated brand/agent context.
- **Orchestration & scale:** replace *subprocess-per-worker* and *5-minute polling* with a **job queue + worker pool** and an **event bus**; replace `pending_sends` polling with a real queue/stream. This removes the process-per-agent and process-per-account ceilings.
- **Transport:** keep a dedicated per-account session service, but manage account identity/health centrally; treat deliverability and account warmup as first-class.
- **Observability:** keep the activity/state/token tables; add metrics, traces, and per-account health dashboards.
- **Idempotency:** make every outbound action idempotent (dedup keys) so retries can't double-send.

**Operational & compliance note (important for the rebuild team):** automated outbound DMs via user accounts run against Telegram's terms and trigger spam enforcement (account restrictions/bans). At scale the real bottleneck is **account health and deliverability**, not the agent framework. Design for explicit consent where possible, conservative pacing, per-account health monitoring, and a clear policy stance before scaling outbound. Prefer inbound/opt-in flows where the product allows.

---

## 13. Feature checklist

Quick coverage list for the rebuild (✓ = exists in V0.2 and should be reproduced).

**Accounts & auth**
- ✓ Email/password register, login, logout, session
- ✓ Single-brand-per-user tenancy

**Onboarding**
- ✓ Manual brand setup
- ✓ AI website extraction (brand + agent configs) with multi-tier fallback
- ✓ AI deep-dive interview (≤6 questions)
- ✓ Optional voice (TTS) onboarding

**Connections**
- ✓ Telegram bot connect (verify + channel save)
- ✓ Telegram user-account connect (OTP + 2FA → session)
- ✓ Discord bot connect

**Accounts/personas**
- ✓ Multi-account CRUD, encrypted tokens
- ✓ Per-account persona/role/status/platform
- ✓ Gateway start/stop/status, PID tracking, crash recovery

**Agents**
- ✓ Per-role agent config (persona, rules, banned topics, knowledge base, skip ratio…)
- ✓ Leader (persistent + single-cycle)
- ✓ Search (discover communities)
- ✓ Talk (group engagement w/ skip ratio)
- ✓ Research (inbound leads + outbound prospects, scoring)
- ✓ Sales (DM closing)
- ✓ Manual mode and autonomous mode

**Data & funnel**
- ✓ Communities + auto-assignment (round-robin, capped)
- ✓ Group member directory + scraping
- ✓ Lead funnel + outreach state machine + follow-ups
- ✓ Lead detail w/ conversation history; manual overrides

**Messaging**
- ✓ Unified conversation log (group + DM)
- ✓ Manual DM send
- ✓ Human takeover (auto-reply off per user)

**Intelligence & ops**
- ✓ Learnings capture + propagation
- ✓ Live activity feed (secret-redacted)
- ✓ Agent state monitor + crash detection
- ✓ Token usage & cost tracking
- ✓ Global rate limits + dedup + conflict resolution

**V0.1 (optional)**
- ✓ Content squad config + schedule
- ✓ Scout→Quill→Hermes posting pipeline
- ✓ Run history + content feed with metrics

---

*End of specification. For endpoint-level detail see `API_REFERENCE.md`; for agent mechanics see `HOW_AGENTS_WORK.md`.*
