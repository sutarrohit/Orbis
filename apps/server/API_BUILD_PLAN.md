# Orbis — Hono API Build Plan

> What APIs we can build on the **Hono server** (`apps/server`, `@repo/api`), derived
> from analysing `API_REFERENCE.md` (which describes the older *PostPilot* Next.js
> monolith) against Orbis's actual architecture, Prisma schema, and the Python agent
> service in `packages/Agents`.
>
> **Auth is excluded by design** — better-auth already owns `/api/auth/*`.

---

## 0. Target architecture

```
                         ┌──────────────────────────────────────┐
   Browser / web app ───▶│   Hono server  (apps/server)          │
   (single origin)       │                                       │
                         │   • better-auth  (/api/auth/*)        │
                         │   • DB CRUD via Prisma  ── Postgres    │
                         │   • proxy ───────────────┐            │
                         └──────────────────────────┼───────────┘
                                                     ▼
                                        Python agent service
                                        (packages/Agents, FastAPI)
                                        • agent runs / decide
                                        • account login (Pyrogram)
                                        • scheduler / Leader clock
```

**Rule:** the client talks to **Hono only**. Hono owns the database and is the *only*
caller of the Python service. The Python FastAPI is never exposed to the browser.

This split is the main difference from `API_REFERENCE.md`: in PostPilot a single
Next.js `route.ts` both queried the DB *and* spawned Python subprocesses. In Orbis
those are two services, bridged by Hono.

---

## Group A — Build now: pure Hono + Prisma (NO schema change, NO Python change)

These map 1:1 onto tables that **already exist** in `schema.prisma`. They're plain
CRUD/read routes scoped by the session user's brand. Highest value, lowest risk —
the dashboard pages under `apps/web/app/(dashboard)` already need them.

| Endpoint (proposed) | Method | Backing model | Notes |
|---|---|---|---|
| `/api/v1/brand` | GET | `Brand` (+`BrandProfile`) | resolve from session; `{ brand: null }` if none |
| `/api/v1/brand` | POST | `Brand`, `BrandProfile` | onboarding step 1; create brand + empty profile |
| `/api/v1/brand` | PUT | `Brand`, `BrandProfile` | update name/niche/profile fields |
| `/api/v1/accounts` | GET | `SocialAccount` | enrich w/ community counts; redact `sessionString` |
| `/api/v1/accounts/:id` | PUT | `SocialAccount` | update `displayName`/`status` (ownership-checked) |
| `/api/v1/accounts/:id` | DELETE | `SocialAccount` | ownership-checked |
| `/api/v1/communities` | GET | `Community` | list w/ assigned account |
| `/api/v1/communities` | POST | `Community` | add (`409` on dup `handle`) |
| `/api/v1/communities/:id` | PUT | `Community` | status, `assignedAccountId`, etc. |
| `/api/v1/leads` | GET | `Lead` | `?status=` filter + counts by status |
| `/api/v1/leads/:id` | GET / PUT | `Lead` | one lead; update score/status/interest |
| `/api/v1/group-members` | GET | `GroupMember` | `?chatId=` filter |
| `/api/v1/conversations` | GET | `Conversation` | latest N, `?community_id=` filter |
| `/api/v1/conversations/send` | POST | `PendingSend` | enqueue DM; gateway delivers it |
| `/api/v1/activity` | GET | `AgentActivity` | feed; `since`/`limit`; redact keys in `detail` |
| `/api/v1/learnings` | GET | `Learning` | list strategy notes |
| `/api/v1/usage` | GET | `TokenUsage` | aggregate cost over `?days=` |
| `/api/v1/leader/goals` | GET / POST | `Learning` *or* `Brand` field | see note ↓ |
| `/api/v1/agent-state` | GET | `AgentState` | dashboard status of all 5 agents (read-only) |

**Notes for Group A**
- Every handler: `requireAuth()` → resolve `brand` from `ownerId` → scope all queries by `brandId`.
- Use `@hono/zod-openapi` so these show up in Swagger like the existing setup.
- `conversations/send` only writes the `PendingSend` row (status `queued`); the
  Python gateway picks it up. No Python call needed from Hono here.
- **`leader/goals`**: PostPilot stored free-text Leader priorities. We have no
  dedicated column — either reuse `Learning` rows, or add a tiny `leaderGoals String`
  field to `Brand` (a *one-field* migration; otherwise this drops to Group C).

---

## Group B — Build now: Hono **proxy** to the existing Python service (NO schema, NO Python change)

These wrap agent execution / process control. The Python endpoints **already exist**
(`packages/Agents/routers/*`). Hono authenticates the user, resolves their `brandId`,
then forwards to the Python service and relays the response. No Python code changes.

| Hono endpoint (proposed) | Proxies to (Python, prefix `/api`) | Purpose |
|---|---|---|
| `POST /api/v1/search/run` | `POST /agents/search/run` | run Search/Scout agent |
| `POST /api/v1/research/run` | `POST /agents/research/run` | run Research cycle |
| `POST /api/v1/talk/decide` | `POST /agents/talk/decide` | Talk decision (if exposed to UI) |
| `POST /api/v1/sales/decide` | `POST /agents/sales/decide` | Sales reply (if exposed to UI) |
| `POST /api/v1/leader/run` | `POST /agents/leader/run` | single Leader cycle |
| `GET  /api/v1/leader/status` | `GET /agents/scheduler/status` | Leader/clock status |
| `POST /api/v1/leader/deploy` | `POST /agents/scheduler/start` | start persistent Leader loop |
| `POST /api/v1/leader/stop` | `POST /agents/scheduler/stop` | stop the loop |
| `POST /api/v1/scheduler/pause` | `POST /agents/scheduler/pause` | pause clock |
| `POST /api/v1/scheduler/resume` | `POST /agents/scheduler/resume` | resume clock |
| `POST /api/v1/accounts/auth/send-code` | `POST /accounts/send-code` | Telegram login step 1 |
| `POST /api/v1/accounts/auth/verify` | `POST /accounts/verify-code` | Telegram login step 2 |
| `POST /api/v1/accounts/auth/verify-2fa` | `POST /accounts/verify-password` | 2FA password step |
| `PUT  /api/v1/accounts/:id/status` | `POST /accounts/{id}/status` | activate/pause/restrict |

**Notes for Group B**
- Add one env var, e.g. `AGENTS_SERVICE_URL` (default `http://localhost:8000`), to
  `apps/server/src/env.ts`. This is config, not a schema/Python change.
- Hono must inject `brandId` (and any `accountId`) into the forwarded request so the
  Python service stays brand-scoped — the browser never sends raw service params.
- `GET /accounts` and `GET /agents/{communities,leads}` exist in Python too, but
  **prefer the Group-A Prisma reads** for those — Hono reads Postgres directly, no
  round-trip needed. Use the proxy only for *actions*, not for data the DB already has.
- The Python `results.py` router (`/saved-results`) is **not** registered in
  `main.py` today — ignore it until it's wired up.

---

## Group C — Build only WITH schema changes (touches the DB)

These have no backing model yet. They require a migration before they can exist.

| Endpoint | What's missing | Suggested change |
|---|---|---|
| `agent-config` (GET/POST) | no `AgentConfig` table | add model: `brandId + agentType + voiceTags[] + behaviorRules[] + bannedTopics[] + extra Json`; unique `(brandId, agentType)`. The web `/agent-config` page already expects this. |
| `conversations/auto-reply` toggle | nowhere to store "human took over" | add `autoReplyDisabled Boolean` on a DM-thread/lead-channel row (or a small `ConversationControl` table). |
| DM threads / `SalesStage` history | only group `Conversation` is modelled, not 1:1 DM threads | add `DmThread` + `Message` (this is **open question §7.4** in `AGENT_SCHEMA_PLAN.md`). |
| Discord persona fields | `SocialAccount` has no persona columns | add `personaName`/`personaDescription` if Discord setup is needed. |
| `brand/extract`, `brand/refine` | AI onboarding helpers (OpenAI/Firecrawl) | no DB change, but **not core CRUD** — better as a Python/dedicated endpoint, then proxied (Group B style) once it exists. |

---

## Group D — Do NOT build (out of Orbis's model)

| From API_REFERENCE | Why skip |
|---|---|
| §1 Auth & Session | better-auth owns it (explicitly excluded) |
| §10 V0.1 Content Squad — `squad`, `squad/run`, `runs`, `runs/:id`, `posts`, run logs | PostPilot's legacy Scout→Quill→Hermes content-posting pipeline. Orbis has no such tables and a different agent model. |
| §11 `tts` (ElevenLabs) | tied to PostPilot's voice onboarding; not part of Orbis. |
| §3 `telegram/save` channel-posting onboarding | PostPilot's "post to a channel" concept; Orbis connects *sending accounts* (`SocialAccount`), not broadcast channels. Token *verification* can still be a thin Group-B/utility route. |

---

## Recommended build order

1. **Group A foundation:** `brand` → `accounts` → `communities` / `leads` / `group-members`.
2. **Group A feeds:** `activity`, `learnings`, `usage`, `conversations`, `agent-state`.
3. **Group B proxy layer:** add `AGENTS_SERVICE_URL`, a small proxy helper, then
   `search/run`, `research/run`, `leader/*`, `scheduler/*`, account login flow.
4. **Group C (only if needed):** `AgentConfig` migration → `agent-config` routes;
   then auto-reply / DM threads if the product needs them.

Everything in **Group A + Group B ships with zero changes to the current database
schema and zero changes to the Python agent server** — exactly the "user talks only
to Hono; Hono brokers DB + Python" architecture.
