# API Reference

> Every HTTP endpoint in PostPilot. All routes live under `src/app/api/**/route.ts` (Next.js App Router) and are served at `/api/...`.
> For the system overview see `PROJECT_OVERVIEW.md`; for the agent internals see `HOW_AGENTS_WORK.md`.

---

## Conventions

- **Base path:** all endpoints are prefixed with `/api`.
- **Auth:** almost every route calls `requireAuth()` / `getAuthUser()` (cookie-based session via `iron-session`). Unauthenticated requests get **`401 Unauthorized`**. The public exceptions are the auth entry points (`/api/auth/login`, `/api/auth/register`). `middleware.ts` additionally guards page routes.
- **Tenancy:** a logged-in user owns exactly one **brand**; almost all data routes resolve the brand from the session and scope every query to it. No brand yet → routes return empty lists or `404`.
- **Body/response:** JSON in, JSON out. Errors are `{ "error": "..." }` with an appropriate status (`400` validation, `401` auth, `404` missing, `409` conflict, `500` server).
- **Process control:** several routes don't touch the DB only — they **spawn Python subprocesses** (the agents) and/or read PID files and JSONL log files. Those are called out below.

---

## 1. Authentication & Session

### `POST /api/auth/register`
Create a user account. Body: `{ name, email, password }` (password ≥ 8 chars). Hashes the password (bcrypt, cost 12), creates the user, starts a session, returns `{ success, user }`. `409` if email already registered.

### `POST /api/auth/login`
Body: `{ email, password }`. Verifies the bcrypt hash, sets the session cookie, returns `{ success, user }`. `401` on bad credentials.

### `POST /api/auth/logout`
Destroys the session. Returns `{ success: true }`. No body.

### `GET /api/auth/me`
Returns the current `{ user, brand, hasCompletedOnboarding }` (onboarding is complete once the brand has a connected Telegram channel). `401` if not logged in.

---

## 2. Brand & Onboarding

### `GET /api/brand`
Returns the user's `{ brand, squad }`, or `{ brand: null }` if none.

### `POST /api/brand`
Create the brand (onboarding step 1). Body: `{ name, niche, description?, voiceTags?, voiceDescription?, targetAudience?, contentTopics? }`. Also auto-creates a default **squad** (paused). `409` if a brand already exists.

### `PUT /api/brand`
Update brand/settings. Accepts a subset of: `name, niche, description, voiceTags, voiceDescription, targetAudience, contentTopics, brandUrl, competitorUrl, maxGroupsPerAccount, maxDmsPerDay, maxGroupRepliesPerDay`. Arrays are JSON-encoded.

### `POST /api/brand/extract`
**AI onboarding helper.** Body: `{ brandUrl, competitorUrl? }`. Extracts a full brand profile **and** per-agent configs (talk/sales/search/research/leader) using a 3-tier fallback: (1) OpenAI Responses API with `web_search`, (2) Firecrawl scrape → OpenAI structured output, (3) optional OpenRouter + built-in HTML scraper. Returns `{ success, extracted, method }`.

### `POST /api/brand/refine`
**AI interview helper.** Body: `{ currentKnowledge, conversationHistory, round }`. The model decides whether it knows enough or asks one more follow-up question (max 6 rounds), returning `{ satisfied, question, questionContext, updatedKnowledge }` to progressively enrich the brand/agent knowledge bases.

---

## 3. Telegram & Discord Connection

### `POST /api/telegram/verify`
Body: `{ botToken }`. Calls Telegram `getMe` to validate the bot token; returns the bot's `{ id, name, username }`.

### `POST /api/telegram/save`
Body: `{ botToken, channelId, channelName? }`. Validates the token and confirms the bot can access the channel (`getChat`/`getMe`), then saves the connection onto the brand (completes V0.1 onboarding).

### `POST /api/discord/setup`
Body: `{ botToken, personaName, personaDescription? }`. Validates the Discord token (`/users/@me`) and creates an account record for the Discord gateway.

---

## 4. Accounts (Telegram/Discord identities the agents operate)

### `GET /api/accounts`
Lists the brand's accounts, each enriched with community counts (total / joined / pending). Encrypted tokens are redacted.

### `POST /api/accounts`
Create a **bot** account. Body: `{ bot_token, persona_name, persona_description? }`. Encrypts the token (AES-256-GCM keyed on `SESSION_SECRET`) before storing.

### `PUT /api/accounts/[id]`
Update an account's `persona_name`, `persona_description`, `status`, or `role` (ownership-checked).

### `DELETE /api/accounts/[id]`
Delete an account (ownership-checked).

### `POST /api/accounts/auth/send-code`
**Telegram user-account login, step 1.** Body: `{ phoneNumber, personaName, personaDescription? }`. Spawns a background Python (Pyrogram) auth process that requests an OTP, creates a session directory, marks status `otp_sent`, and returns `{ accountId, phoneCodeHash }`.

### `POST /api/accounts/auth/verify`
**Telegram user-account login, step 2.** Body: `{ accountId, code, password? (2FA) }`. Hands the code to the waiting auth process, and on success marks the account `verified`, returning the Telegram `{ userId, username, firstName }`.

---

## 5. Leader (orchestrator) control

### `POST /api/leader/deploy`
Starts the **persistent** autonomous Leader loop. Requires a brand with ≥1 configured account, kills any stale process first, then spawns `run_leader.py --mode persistent`. Logs a deploy activity.

### `POST /api/leader/run`
Triggers a **single** Leader cycle via `spawnLeaderCycle(brandId)` (one-shot analysis/plan, not the persistent loop).

### `POST /api/leader/stop`
Terminates the running Leader process and sets its `agent_state` to `stopped`.

### `GET /api/leader/status`
Returns Leader PID, running/crashed status, and (on crash) the reason — reconciling DB state against actual process liveness and tailing `logs/leader-persistent.jsonl` if needed. Also reports the other agents' states.

### `GET /api/leader/goals` · `POST /api/leader/goals`
GET returns the brand's `leader_goals` text. POST body `{ goals }` updates it (these are the human-set priorities injected into the Leader's prompt).

---

## 6. Agent execution (Search / Research / Gateway)

### `POST /api/search/run`
Spawns the Search/Scout agent (`run_search_agent.py`, no Telegram account needed) with `--brand-id/--hermes-root/--db-path`, logging to `logs/search-<timestamp>.jsonl`.

### `GET /api/search/logs`
Parses the most recent `search-*.jsonl` log into structured events (queries, discoveries, progress) and reports whether the agent is still running (file modified within 60s).

### `POST /api/research/run`
Triggers a Research agent cycle via `spawnResearchAgent(brandId)`.

### `POST /api/gateway/start`
Body: `{ accountId }`. Verifies the account is authenticated, then spawns the right long-running gateway — `run_discord_gateway.py` or `run_agent_gateway.py` (Talk + Sales).

### `POST /api/gateway/stop`
Body: `{ accountId }`. Reads `pids/gateway-{accountId}.pid`, sends SIGTERM, deletes the PID file.

### `GET /api/gateway/status`
Scans `pids/` for gateway PID files, checks liveness (signal 0), and returns each account's gateway running state.

---

## 7. Data: Communities, Members, Leads

### `GET /api/communities` · `POST /api/communities`
GET lists communities (with the assigned account's persona). POST adds one: `{ chat_id, name, type?, member_count? }` — `409` if `chat_id` exists.

### `PUT /api/communities/[id]`
Update a community: `name, type, member_count, niche_relevance, assigned_account_id, conversion_rate, status, monitoring_enabled` (ownership-checked). Assigning an account is what triggers the gateway to join it.

### `GET /api/group-members`
Lists saved group members; optional `?chatId=` filters to one group. Otherwise returns all members for the brand with a total count.

### `GET /api/leads`
Lists leads, optional `?status=` filter. Returns parsed `pain_points` plus aggregate counts by status.

### `GET /api/leads/[id]` · `PUT /api/leads/[id]`
GET returns one lead with its conversations. PUT updates `status, score, interest_level, assigned_agent` (ownership-checked).

---

## 8. Conversations & Messaging

### `GET /api/conversations`
Lists conversations (latest 100), optionally filtered by `?lead_id=` or `?community_id=`.

### `POST /api/conversations/send`
Manually send a DM. Body: `{ userId, message }`. Inserts into `pending_sends` (so the running gateway delivers it) **and** `conversations` (so it shows in the UI immediately).

### `GET /api/conversations/auto-reply` · `POST /api/conversations/auto-reply`
GET (`?user_id=`) reports whether auto-reply is disabled for a user. POST `{ userId, disabled }` toggles it — letting a human take over a conversation from the Sales agent.

---

## 9. Activity, Learnings, Usage

### `GET /api/activity`
Unified activity feed (the dashboard's live log). Query: `since` (timestamp), `limit` (default 100, max 500). API keys are redacted from details.

### `GET /api/agent-config` · `POST /api/agent-config`
GET returns all five agent configs (parsed `voice_tags`, `behavior_rules`, `banned_topics`). POST upserts one config; body requires `agent_type` ∈ {leader, search, talk, research, sales}.

### `GET /api/learnings`
Lists the brand's learnings (shared agent insights).

### `POST /api/learnings/[id]/propagate`
Marks a learning as `propagated`.

### `GET /api/usage`
Token-usage and cost summary over `?days=` (default 30, max 90), aggregated from the `token_usage` table.

---

## 10. V0.1 Content Squad (legacy pipeline)

### `GET /api/squad` · `PUT /api/squad`
GET returns the squad config. PUT updates `mission, frequency, postTime, timezone, constraints, learningEnabled, autoSkills, status`.

### `POST /api/squad/run`
Triggers a content run: creates a `runs` record and spawns the Python Scout→Quill→Hermes pipeline (`spawnPipeline()`). Requires a connected Telegram bot + channel.

### `GET /api/runs`
Lists squad runs (`?limit=`, `?status=`); parses `scout_output`/`quill_output`/`hermes_output`.

### `GET /api/runs/[id]`
One run with parsed outputs plus the brand's Telegram channel info.

### `GET /api/runs/[id]/logs`
Incrementally tails `logs/run-{id}.jsonl` using an `?offset=` cursor (for live run replay).

### `GET /api/posts`
Lists generated posts (`?limit=`, `?status=`); parses `hashtags` and returns post stats.

---

## 11. Utilities

### `POST /api/tts`
Body: `{ text }`. Proxies ElevenLabs text-to-speech and streams back MP3 audio (used by the voice onboarding interview). Falls back gracefully when no `ELEVENLABS_API_KEY` is set.

---

## Quick index

| Area | Endpoints |
|---|---|
| Auth | `auth/register`, `auth/login`, `auth/logout`, `auth/me` |
| Brand | `brand` (GET/POST/PUT), `brand/extract`, `brand/refine` |
| Connect | `telegram/verify`, `telegram/save`, `discord/setup` |
| Accounts | `accounts` (GET/POST), `accounts/[id]` (PUT/DELETE), `accounts/auth/send-code`, `accounts/auth/verify` |
| Leader | `leader/deploy`, `leader/run`, `leader/stop`, `leader/status`, `leader/goals` (GET/POST) |
| Agents | `search/run`, `search/logs`, `research/run`, `gateway/start`, `gateway/stop`, `gateway/status` |
| Data | `communities` (GET/POST), `communities/[id]` (PUT), `group-members`, `leads`, `leads/[id]` (GET/PUT) |
| Messaging | `conversations`, `conversations/send`, `conversations/auto-reply` (GET/POST) |
| Insights | `activity`, `agent-config` (GET/POST), `learnings`, `learnings/[id]/propagate`, `usage` |
| V0.1 Squad | `squad` (GET/PUT), `squad/run`, `runs`, `runs/[id]`, `runs/[id]/logs`, `posts` |
| Utility | `tts` |
