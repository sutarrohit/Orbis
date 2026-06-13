# Discord Integration — Implementation Plan

Goal: let brands run promotion on **Discord** the same way they do on **Telegram**
today — connect accounts, join communities, scrape members, listen, and do
outreach. Chosen model: **full parity via user-token "self-bots"** (one real
Discord user account per `social_account`, mirroring the Telegram MTProto flow).

> ⚠️ **ToS / ban risk (owner-acknowledged).** User-token automation violates
> Discord's Terms of Service; accounts are routinely banned, sometimes with
> phone/IP fingerprint flags that burn future accounts. This plan isolates the
> risk (per-account proxies, conservative pacing, disposable accounts) but cannot
> remove it. Treat every connected account as disposable.

The architecture mirrors Telegram **deliberately**: a parallel
`gateway/discord/` subpackage, the same DB tables, the same `store.py` layer, the
same Sales/Talk/Leader/Research/Search agents. Only the platform driver changes.

---

## 0. Library & connection model

| Concern | Telegram (today) | Discord (new) |
|---|---|---|
| Client lib | `pyrogram` (MTProto) | **`discord.py-self`** (user-token fork of discord.py) |
| Credential | session string (from OTP login) | **user token** (stored in the same `sessionString` column, encrypted) |
| Connect flow | 3-step phone OTP (`send-code`→`verify-code`→`verify-password`) | **paste user token** → validate (1 step). Optional email/password+MFA later. |
| Transport | persistent client | persistent gateway WebSocket (`client.start()` / `Client.login`) |
| Join community | `join_chat(link)` | `accept_invite(code)` |
| Scrape members | `get_chat_members` | `guild.fetch_members()` / member chunking |
| DM | `send_message(user_id, text)` | `user = fetch_user(id); user.send(text)` (mutual server required — satisfied because we joined the server) |
| Channel post | n/a today | `channel.send(text)` |
| Listen | Pyrogram `MessageHandler` | `@client.event on_message` |
| Dead-session signal | `Unauthorized` (401) | `discord.LoginFailure` / `HTTPException(401)` |

**Dependency note:** `discord.py-self` imports as `discord` and **conflicts with
`discord.py`** — only one can be installed. We're not using official `discord.py`,
so install `discord.py-self` in `packages/Agents` (`pyproject.toml` + `uv.lock`).

No Hono webhook is needed for Discord (unlike the Telegram bot webhook) — the
self-bot receives events over its own gateway WebSocket inside the Python engine.

---

## 1. Shared layer — make the data path platform-aware (do this FIRST)

These are the load-bearing changes; without them the Discord gateway and the
Telegram gateway fight over the same accounts and queue rows.

### 1a. Prisma schema — `apps/server/prisma/schema.prisma`
- `Platform` enum already has `telegram | discord` ✅ (no change).
- `SocialAccount.platform` already exists (`@default(telegram)`) ✅.
- **Add outreach targeting to `PendingSend`** so it can carry a channel post as
  well as a DM:
  - `kind  SendKind @default(dm)` with a new enum `enum SendKind { dm channel_post }`.
  - `targetId String?` — the Discord channel id for `channel_post` (null for DMs;
    DMs still resolve the recipient via `lead.userId`).
- **`Community` semantics for Discord:** reuse existing columns — `handle` = invite
  link/code, `groupChatId` = guild id once joined, `discussionChatId` = the
  specific channel id we post/listen in (or a CSV/first text channel). No new
  columns required; document the reuse in a comment.
- Run `pnpm --filter @repo/api db:generate && db:migrate` (creates the `SendKind`
  enum + columns; regenerates `prisma/generated`).

### 1b. Store layer — `packages/Agents/agents/lib/store.py`
- `SocialAccountStore.all_active()` → add `platform: str | None = None` param and
  `AND platform = %s::"Platform"` filter; also **select `platform`** into the
  returned dict (gateways load only their own accounts).
- `PendingSendStore.next_queued()` → add `platform` filter via join to
  `social_account` (`JOIN social_account a ON ps."accountId" = a.id WHERE a.platform = …`)
  and also return `kind` + `targetId` so the sender knows DM vs channel post.
- `PendingSendStore.queue()` → accept optional `kind` / `target_id`.
- `CommunityStore.pending_join_assigned()` already filters by assigned account;
  add a `platform` filter (join to `social_account`) so the Discord joiner only
  pulls Discord communities. Same for `pending_leave` / `joined_missing_discussion`.

### 1c. Constants — `packages/Agents/agents/constants/gateway.py`
- Add Discord-specific, **more conservative** pacing (self-bots get flagged
  faster than Telegram): `DISCORD_JOIN_PACE_SECONDS`, `DISCORD_SEND_PACE_SECONDS`,
  `DISCORD_SEND_BATCH`, etc. Keep the poll/health intervals shared.

### 1d. Crypto — reuse `agents/lib/crypto.py` as-is (token encrypted exactly like a
session string).

---

## 2. Discord auth & the connect flow

### 2a. `packages/Agents/agents/lib/discord_auth.py` (new — mirrors `telegram_auth.py`)
- `async def connect_token(token: str) -> dict`: spin up a `discord.Client`,
  `await client.login(token)`, fetch `client.user` → return
  `{user_id, username, display_name, session_string: token}`. Raise
  `DiscordAuthError` on `LoginFailure`. (Single step — no OTP.)
- (Optional, later) `connect_credentials(email, password, mfa)` — Discord gates
  this hard with hCaptcha, so token-paste is the primary path.

### 2b. `packages/Agents/agents/schemas/account.py`
- Add `ConnectTokenRequest { brand_id, token }`.
- `AccountView` already has `platform` ✅ — set it to `"discord"` on store.
- Reuse `LoginStepResult` (`status="connected"`).

### 2c. `packages/Agents/routers/accounts.py`
- `POST /accounts/discord/connect` → `discord_auth.connect_token` → encrypt token,
  `_store.upsert(..., session_string=encrypt(token), status="active")` **with
  `platform="discord"`**.
- `SocialAccountStore.upsert()` → add a `platform: str = "telegram"` param and
  include it in the INSERT/ON CONFLICT (currently hard-defaults to telegram).
- Status / list / delete endpoints already work for both platforms (keyed by id).

### 2d. Hono proxy — `apps/server/src/services/agents.service.ts` + `routes/agents/index.ts`
- Add `connectDiscord(brandId, token)` calling Python `/api/accounts/discord/connect`.
- Add route `POST /agents/accounts/discord/connect` (mirror the existing
  `send-code` proxy; same JWT auth).
- `apps/server/src/schemas/*` — add the request schema (zod-openapi).

### 2e. Web — `apps/web`
- `components/accounts/connect-account-dialog.tsx` → add a **platform selector**
  (Telegram | Discord). Telegram keeps the 3-step OTP UI; Discord shows a single
  "Paste Discord user token" field + a help link explaining how to obtain it and
  the ban risk.
- `lib/api/agents-apis.ts` (or wherever `sendCode` lives) → add `connectDiscord`.
- `app/(dashboard)/accounts/page.tsx` already shows the Platform column ✅.

---

## 3. Discord gateway subpackage — `packages/Agents/agents/gateway/discord/`

Mirror the Telegram modules. The lost `__pycache__` from the prior attempt shows
the intended shape: `client_manager.py`, `listeners.py`, `sender.py`, `health.py`,
`runner.py` (+ `__init__.py`). We add a **joiner** too (full parity needs scrape).

### 3a. `discord/client_manager.py` — registry of live `discord.Client`s
- Same public surface as the Telegram `GatewayClients`:
  `get / account_ids / remove / register / _connect_account / start_all /
  connect_new / stop_all`.
- `_connect_account`: decrypt token → `discord.Client(...)` → run `client.start(token)`
  as a background task (Discord clients are long-lived event loops, unlike
  Pyrogram's `start()` that returns) → on `READY` register + `mark_health(active)`;
  on `LoginFailure` → `mark_health(restricted)`.
- `start_all` / `connect_new` call `SocialAccountStore().all_active(platform="discord")`.
  Keep the **`connect_new` reconciliation** (the recent Telegram bug fix
  `a6aae09` applies identically — accounts added after boot must auto-connect).

### 3b. `discord/health.py`
- `is_account_dead(exc)` → `isinstance(exc, (discord.LoginFailure,))` or 401
  `HTTPException`. `run_health_check` reuses the Telegram pattern: `connect_new()`
  reconcile + per-client liveness (`client.is_ready()` / fetch self) → restrict dead.

### 3c. `discord/joiner.py` — join servers + scrape members
- Pull `CommunityStore.pending_join_assigned(platform="discord")`.
- `await client.accept_invite(invite_code)` → on success `mark_joined(community_id,
  guild_id)` and store the target text channel in `discussionChatId`.
- Scrape: `async for m in guild.fetch_members(limit=SCRAPE_LIMIT)` → skip
  bots/no-username → `GroupMemberStore.upsert_many(...)` (same `GroupMemberRecord`
  shape as Telegram). Requires the account to have access; pace joins hard.
- Hard failure → `mark_rejected`; rate-limit (`discord.HTTPException` 429) →
  back off, leave pending.

### 3d. `discord/listeners.py` — inbound (DM + channel) → agents
- Register `on_message`:
  - DM from a **known lead** → `sales.decide_reply` (reuse
    `agent_runners.sales`, `SalesContext`, `DmMessage`) → maybe queue a reply.
  - Channel message in a joined community → `talk.decide_reply` (reuse
    `agent_runners.talk`, `TalkContext`, `GroupMessage`) → maybe DM the author or
    reply in-thread.
  - Both record a `ConversationStore.add(...)` row (the Research bus) — identical
    to Telegram listeners.
- Reuse `HISTORY_LIMIT` and the `_make_handler` error-guard pattern.

### 3e. `discord/sender.py` — outbound (DM + channel post)
- `drain_once(clients)` reads `PendingSendStore.next_queued(platform="discord")`.
- Per row: look up client by `account_id`.
  - `kind == "dm"` → `user = await client.fetch_user(int(to_user_id)); await user.send(message)`.
  - `kind == "channel_post"` → `ch = client.get_channel(int(target_id)) or await client.fetch_channel(...); await ch.send(message)`.
  - 429 rate limit → back off (like Telegram `FloodWait`); dead account →
    `health.handle_dead_account`; else `mark_failed`.

### 3f. `discord/runner.py` — `run_discord_gateway()`
- Same shape as `gateway/runner.py`: `start_all()` then
  `asyncio.gather(run_sender, run_joiner, run_health_check)`.

---

## 4. Top-level runner — run both platforms together

`packages/Agents/agents/gateway/runner.py`:
- Refactor `main()` to launch **both** gateways concurrently:
  `asyncio.gather(run_gateway() /*telegram*/, run_discord_gateway())`, each
  guarded so one platform failing doesn't kill the other.
- Gate Discord on creds present (skip cleanly if no Discord accounts), like the
  existing `TELEGRAM_API_ID` guard.

---

## 5. Outbound state machine / agents — channel posts

The Leader/outreach machine currently only queues DMs. To support the
"post/reply in channels" promotion action:
- Where `PendingSendStore.queue(...)` is called (agents `store`/outreach), allow
  queueing `kind="channel_post"` with a `target_id` (a community's channel).
- Sales/Talk reply paths stay DM-first; channel posting is a new Leader action
  (e.g. periodic promo into joined communities) — scope this as a follow-up if
  you want to ship DM-parity first.

---

## 6. Env & config

`packages/Agents/.env` (+ `.env.example` if present):
- No global app creds needed for self-bots (token is per-account). 
- Recommended: per-account **proxy** support (`DISCORD_PROXY_*` or a column) to
  avoid IP-correlating multiple accounts — feed into `discord.Client(proxy=...)`.
- `apps/server/.env.example` — no new Telegram-style bot vars (no webhook).

---

## 7. Testing — `packages/Agents/tests/`
- Mirror existing gateway tests: fake `discord.Client` (stub `fetch_user`,
  `accept_invite`, `fetch_members`, `send`) injected into `GatewayClients`.
- Unit-test `discord_auth.connect_token` (mock login success / `LoginFailure`).
- Store tests for the new `platform` filters and `kind`/`targetId` columns.
- `drain_once` DM vs channel_post branching; joiner scrape filtering.

---

## 8. Suggested PR breakdown (each independently shippable)

1. **schema + store platform-awareness** (§1) — migration, `all_active(platform)`,
   `next_queued(platform)`, `SendKind`. Foundation; no behavior change for Telegram.
2. **Discord auth + connect endpoint + Hono proxy + web dialog** (§2) — can
   connect a Discord account and see it listed (no gateway action yet).
3. **Discord gateway: client_manager + health + runner wiring** (§3a,3b,3f,4) —
   accounts log in and stay healthy.
4. **Discord joiner (join + scrape)** (§3c) — communities move to `joined`,
   members populate.
5. **Discord listeners + sender (DM)** (§3d,3e) — inbound→agents, DM outreach
   drains. This reaches **Telegram parity**.
6. **Channel posts** (§5, `kind=channel_post`) — the extra promotion action.
7. **Web polish** — communities page invite-link input, leads/account platform
   badges, how-to page Discord section.

---

## Risk mitigations baked in
- Per-account proxies + conservative `DISCORD_*` pacing constants.
- Reuse the existing per-account daily cap (`count_today_by_account`).
- `connect_new` reconciliation so a banned/replaced account can be swapped live.
- Treat accounts as disposable; `restricted` status pulls them from rotation
  automatically via the shared health loop.
