# How Orbis Works

A practical guide to what each part of this project does, how the pieces talk to
each other, and how to run it end‑to‑end. For build/lint/test commands and repo
conventions see `CLAUDE.md`.

---

## 1. The big picture

Orbis is an autonomous Telegram growth system. It **finds** relevant Telegram
communities, **joins** them, **listens**, **scores people into leads**, and
**reaches out** — driven by a squad of agents and orchestrated by a Leader.

```
                    ┌────────────────────────────────────────────────────┐
   Browser  ──────► │  apps/web (Next.js, :3000)                          │
                    └───────────────┬────────────────────────────────────┘
                                    │  REST (NEXT_PUBLIC_API_URL → :4000)
                    ┌───────────────▼────────────────────────────────────┐
                    │  apps/server (Hono API + Prisma, :4000)             │
                    │  auth, brands, accounts, communities, leads, …      │
                    └───────────────┬────────────────────────────────────┘
                                    │  signed service calls (AGENTS_JWT_SECRET)
                    ┌───────────────▼────────────────────────────────────┐
                    │  packages/Agents — Python                           │
                    │  • Agents API (FastAPI, :8000) — run agents on demand│
                    │  • Gateway (long-running) — all Telegram I/O         │
                    └───────────────┬────────────────────────────────────┘
                                    │
                              Postgres  ◄── shared source of truth ──►  Telegram
```

**Key idea:** the agents only **read/write Postgres**. The **gateway** is the only
thing that talks to Telegram, turning DB rows into real actions (join, scrape,
listen, DM) and feeding real messages back into the DB.

---

## 2. The three runtimes

| Runtime | Path | Port | What it is | How to run |
|---|---|---|---|---|
| **Web** | `apps/web` | 3000 | Next.js dashboard (the UI) | `pnpm dev` |
| **API** | `apps/server` | 4000 | Hono REST API + Prisma. Stateless → deploys to Lambda. | `pnpm dev` |
| **Agents API** | `packages/Agents` | 8000 | FastAPI. Runs agents on demand (the dashboard buttons proxy here). | `uv run uvicorn main:app --port 8000` |
| **Gateway** | `packages/Agents` | — | Long-running process holding live Telegram sessions. **Not** serverless. | `uv run python -m agents.gateway.runner` |

The Hono API reaches the Agents API at `AGENTS_SERVICE_URL`, authenticated with a
shared-secret JWT (`AGENTS_JWT_SECRET` on both sides). The web app reaches Hono at
`NEXT_PUBLIC_API_URL` (default `http://localhost:4000/api/v1`).

> The **Agents API** and the **Gateway** are separate processes. Starting the API
> server does **not** start the gateway. You need both running for the full loop.

---

## 3. The agent squad

All agents live in `packages/Agents/agents/agent_runners/`. Each follows the same
principle: **the LLM judges, deterministic code executes and re-checks every hard
rule** (rate limits, dedup, never-double-run).

| Agent | Trigger | What it does |
|---|---|---|
| **Search** | dashboard / Leader | Web-searches (Firecrawl) for pages listing Telegram communities, extracts handles, scores niche relevance, and **verifies** public channels by scraping their `t.me/s/` preview. Saves finds as `community` rows with `status=pending_join`. **Discovers but does not join.** |
| **Leader** | dashboard / scheduler | The orchestrator (a LangGraph `load → decide → execute`). Snapshots brand state, asks the LLM for a plan, then deterministically: spawns Search/Research, **assigns communities to accounts**, applies account/lead actions, runs the outbound pipeline. |
| **Research** | dashboard / Leader | Scores **people** into leads. Inbound pass: from `conversation` rows. Outbound pass: from `group_member` rows. Writes `lead` rows. Skips cleanly when there's no data. No regex fallback — needs the LLM. |
| **Talk** | gateway (per message) | Judges one inbound **group** message and decides whether to reply (always as a private DM, never a public group blast). |
| **Sales** | gateway (per DM) | Responds to one inbound **DM** from a known lead. |

Search & Research are **runnable from the dashboard**; Talk & Sales are
**event-driven** (fired by the gateway when messages arrive).

---

## 4. The end-to-end pipeline

```
1. SEARCH      finds communities                → community (pending_join)
2. LEADER      assigns each to an active account → community.assignedAccountId
3. GATEWAY     joins + scrapes / monitors        → community (joined) + group_member
   (joiner)
4. RESEARCH    scores people                     → lead (new / prospect)
5. GATEWAY     listens to messages               → conversation  + captures posters
   (listeners)                                     as group_member
6. TALK/SALES  decide replies                    → DMs via the gateway sender
```

- **Search** only discovers — communities sit at `pending_join`.
- **Leader** assigns a `pending_join` community to an active account
  (`assignedAccountId`). This is what unblocks the gateway.
- **Gateway joiner** picks up `pending_join` + assigned communities, joins them,
  flips them to `joined`, and scrapes members where possible.
- **Research** turns `group_member` / `conversation` rows into `lead` rows.
- **Gateway listeners** capture every poster as a `group_member` (so even
  un-scrapeable groups build a prospect pool from activity) and route messages to
  Talk/Sales.

---

## 5. The gateway (all Telegram I/O)

Started once with `uv run python -m agents.gateway.runner`, it logs in every
`active` account (one Pyrogram client each) and runs four concurrent jobs:

| Job | What it does |
|---|---|
| **listeners** | Inbound DM from a known lead → **Sales**; group message → **Talk**. Records each message as a `conversation`, and **captures the sender as a `group_member`** (engaged poster → prospect pool). |
| **sender** | Drains queued outbound DMs (`pending_send`) and delivers them. |
| **joiner** | Joins assigned `pending_join` communities, scrapes members, and processes deletions (leaves chats flagged `pendingLeave`, then removes the row). |
| **health** | Pings each account every ~5 min; dead sessions → `restricted` and dropped. |

### Members: scrape vs capture
- **Groups / supergroups with visible members** → the joiner scrapes the roster.
- **Broadcast channels & member-hidden groups** → the roster is **admin-only**
  (`CHAT_ADMIN_REQUIRED`). The joiner skips that cleanly and instead:
  - joins the channel's **linked discussion group** (if any) and scrapes/monitors it, and
  - relies on **listener capture** — anyone who posts becomes a `group_member`.
- Each community gets a `note` recording the outcome (e.g. `scraped N members`,
  `channel — members admin-only (monitor only)`), shown on the dashboard.

> **Channels vs groups:** broadcast channels have no member roster and no
> discussion, so they're monitor-only. For lead generation you want **discussion
> groups** — bias Search queries toward "chat group" / "community group".

---

## 6. The Leader (orchestrator)

`run_leader_cycle(brand_id)` runs a LangGraph with durable per-brand state:

1. **load** — snapshot the funnel (communities, members, leads, accounts, learnings).
2. **decide** — one LLM call → a typed `LeaderPlan` (spawn flags, account/lead actions, learnings).
3. **execute** — deterministic: save learnings → spawn Search/Research (guarded
   against double-run) → **`auto_assign_communities`** (assigns `pending_join` to
   active accounts) → apply account/lead actions → run the outbound pipeline.

The Leader marks itself `running` for the **whole** cycle, so the dashboard shows
it running and **locks the other run buttons** until it finishes. It can run on a
**schedule**: set `SCHEDULER_ENABLED=true` to fire the Leader every
`LEADER_INTERVAL_MINUTES` (default 5) and a follow-up sweep every
`FOLLOWUP_INTERVAL_MINUTES` (default 15).

---

## 7. Data model (the shared bus)

Owned by Prisma in `apps/server/prisma/schema.prisma`; the Python side reads/writes
the same tables with raw SQL.

| Table | Holds | Written by | Read by |
|---|---|---|---|
| `brand` | The tenant + its `niche` | onboarding | everything |
| `social_account` | Telegram accounts (encrypted session) | login flow | gateway, Leader |
| `community` | Discovered/joined groups & channels | Search, gateway | Leader, joiner, dashboard |
| `group_member` | Scraped / captured members (prospect pool) | gateway | Research |
| `conversation` | Inbound messages | gateway listeners | Research |
| `lead` | Scored prospects | Research, Talk | Sales, dashboard |
| `agent_state` | Per-agent run status (`idle`/`running`) | every agent | dashboard (polled) |
| `agent_activity` | Action feed + rate-limit/dedup guards | every agent | guardrails, dashboard |
| `learning` | Leader strategy notes | Leader | Leader |

`agent_state` is why the dashboard's "running" badges survive reload/navigation —
it's DB-backed and polled, not client state.

---

## 8. How to run it (local)

**Prereqs:** pnpm 9, Node, Postgres, Python + [`uv`](https://docs.astral.sh/uv/),
Firecrawl API key, Telegram API credentials (`my.telegram.org`).

```bash
# 1. Install JS deps
pnpm install

# 2. Server DB (in apps/server)
cp .env.example .env            # fill DATABASE_URL + DIRECT_URL + AGENTS_* + auth
pnpm db:generate && pnpm db:migrate

# 3. Run web + API (from repo root)
pnpm dev                        # web :3000, server :4000

# 4. Agents — in packages/Agents
cp .env.example .env            # fill DATABASE_URL/DIRECT_URL, FIRECRAWL_API_KEY,
                                # AGENTS_JWT_SECRET, TELEGRAM_API_ID/HASH,
                                # ACCOUNT_ENC_KEY, AGENT_MODEL/LLM keys
uv run uvicorn main:app --port 8000     # Agents API (dashboard buttons hit this)
uv run python -m agents.gateway.runner  # Gateway (Telegram I/O) — separate terminal
```

### Typical first run
1. **Onboard a brand** (set its niche) in the web app.
2. **Connect a Telegram account** (Accounts page) so it's `active`.
3. **Start the gateway** (step 4 above) — required for any joining/scraping.
4. **Run Search** (or Leader) from the dashboard → communities appear as `pending_join`.
5. **Run the Leader** → assigns communities to your account.
6. The **gateway joiner** joins them and scrapes/monitors → members/conversations appear.
7. **Run Research** → leads appear; Talk/Sales engage as messages arrive.

> No Telegram account / gateway? You can still exercise Research offline with the
> seed script: `pnpm db:seed` (in `apps/server`) or `seed_dummy_data.py` in
> `packages/Agents`, which populates `conversation` + `group_member`.

---

## 9. Key environment variables

**apps/server** — `DATABASE_URL` (pooled), `DIRECT_URL` (migrations),
`AGENTS_SERVICE_URL` (where the Agents API lives), `AGENTS_JWT_SECRET`.

**packages/Agents** — `DATABASE_URL`, `DIRECT_URL`, `AGENTS_JWT_SECRET` (must match
the server), `FIRECRAWL_API_KEY`, `FIRECRAWL_MODE` (`live`/`fixture`),
`TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `ACCOUNT_ENC_KEY` (Fernet key),
`AGENT_MODEL` + LLM keys, `SCHEDULER_ENABLED`.

Useful Search/agent knobs: `SEARCH_LIMIT`, `SEARCH_USE_LLM`,
`SEARCH_MIN_RELEVANCE`, `SEARCH_VERIFY`, `SEARCH_MAX_VERIFY`,
`SEARCH_MIN_KEYWORD_MATCH`, `RESEARCH_PROSPECT_MIN`, `LEADER_INTERVAL_MINUTES`.

---

## 10. Operational gotchas

- **Two Python processes.** The Agents API (port 8000) runs agents on demand; the
  Gateway is a separate always-on process for Telegram. The API server does **not**
  start the gateway.
- **Joining needs an active account.** `auto_assign_communities` assigns nothing if
  there are no `active` accounts → nothing joins.
- **The Leader assigns, the gateway joins.** Running the Leader alone won't join
  anything unless the gateway is running.
- **Channels yield no members.** Broadcast channels are monitor-only (admin-only
  rosters). Prefer discussion groups for lead-gen.
- **Dashboard runs are async.** Run buttons fire fire-and-forget background tasks;
  status is reflected via `agent_state` polling. A running Leader locks the other
  run buttons until its cycle ends.
- **Deleting a community** removes its members + conversations (leads kept), flags
  it `pendingLeave`, and the gateway leaves the Telegram chat before the row is
  hard-deleted.
