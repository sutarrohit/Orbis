# Discord Integration — Implementation Guide

A step-wise spec for adding **Discord** alongside the existing **Telegram** integration,
reusing the same pipeline (Sales/Talk agents, PendingSend queue, stores, web UI).

- **Account model:** official Discord **bot** (token-based), via `discord.py`.
- **Auth:** single-step — paste bot token → validate → store (no phone/OTP/2FA).
- **Scope:** connect → listen → reply → send → health, plus **active-poster capture**.
- **Out of scope:** cold-joining servers / roster scraping (the Telegram "joiner" phase).

The bot must be created at discord.com/developers with the **Message Content** intent
enabled, and invited to a server via the OAuth2 URL (`bot` scope + Send Messages +
Read Message History).

---

## Step 0 — Capability mapping (Telegram → Discord bot)

| Telegram (Pyrogram) | Discord (`discord.py`) | Notes |
|---|---|---|
| 3-step MTProto login | 1-step token connect | Validate via `Client.login(token)`, read bot user. |
| Pyrogram client registry | `discord.Client` registry | One client per token; credential = token. |
| DM → Sales, group → Talk | `on_message`: DM → Sales, guild text → Talk | Same agent + store calls. |
| Sender (PendingSend → DM) | `get_user(id).send(text)` | Bot DMs a user who shares a server. |
| Joiner / scrape | **omitted** | Bot is admin-invited; no cold-join/scrape. |
| Health (`get_me` ping) | `is_ready()` + reconnect | Reconcile newly-added accounts. |

---

## Step 1 — Schema changes (Prisma)

**File:** `apps/server/prisma/schema.prisma`

**No migration required.** The model is already platform-generic:

- `enum Platform { telegram discord }` — already present (schema.prisma:76-79).
- `model SocialAccount { platform Platform @default(telegram) ... sessionString String? ... }`
  — already present (schema.prisma:192-218).

**Decision:** reuse `SocialAccount.sessionString` to hold the **encrypted Discord bot token**
(it is generically "the credential the gateway logs in with"). `externalId` = bot user id,
`handle` = bot username, `phone` = `NULL` for Discord.

> If desired, only a doc-comment tweak on `sessionString` to note it holds the bot token for
> Discord. No column/enum/migration changes.

The Zod + Python mirrors already include `discord`:
- `apps/server/src/schemas/enums.schema.ts` → `PlatformEnum = z.enum(["telegram", "discord"])` ✅
- `agents/schemas/account.py` → `AccountView.platform: str = "telegram"` (accepts any) ✅

---

## Step 2 — Python: store layer (platform-aware)

**File:** `packages/Agents/agents/lib/store.py` — `SocialAccountStore`

1. **`all_active(platform: str | None = None)`** — add an optional
   `AND platform = %s::"Platform"` clause so each gateway loads only its own accounts.
   *(done)*
2. **`upsert(..., platform: str = "telegram")`** — add the `platform` kwarg + column to the
   INSERT / `ON CONFLICT DO UPDATE`. Discord connect passes `"discord"`. *(done)*

**File:** `packages/Agents/agents/gateway/client_manager.py`
- Telegram `start_all` / `connect_new` now call `all_active("telegram")`. *(done)*

---

## Step 3 — Python: dependency

**File:** `packages/Agents/pyproject.toml`
- Add `"discord.py>=2.4"` to `dependencies` (import name `discord`).
- Run `uv lock` to refresh `uv.lock`.

---

## Step 4 — Python: Discord auth

**New file:** `packages/Agents/agents/lib/discord_auth.py` (mirrors `telegram_auth.py`)

```python
class DiscordAuthError(RuntimeError): ...

async def connect_bot(token: str) -> dict:
    """Validate a bot token and return its identity.
    Returns {user_id, username, display_name, token}; raises DiscordAuthError."""
```

- Build `discord.Client(intents=...)`, `await client.login(token)` (validates without
  opening the full gateway), read `client.user`, `await client.close()`.
- No pending-state machine (unlike Telegram's `_PENDING`) — one call, one result.

---

## Step 5 — Python: account API (connect-bot)

**File:** `packages/Agents/agents/schemas/account.py`
- Add `class ConnectBotRequest(BaseModel): brand_id: str = "default"; token: str`.

**File:** `packages/Agents/routers/accounts.py`
- Add endpoint:

  ```
  POST /accounts/connect-bot   {brand_id, token}   -> LoginStepResult(status="connected", account)
  ```

- Handler: `result = await discord_auth.connect_bot(token)` → store via
  `_store.upsert(brand_id, external_id=result["user_id"], handle=result["username"],
  display_name=result["display_name"], session_string=crypto.encrypt(result["token"]),
  status="active", platform="discord")`. Map `DiscordAuthError` → HTTP 400.
- `list_accounts` / `set_status` / `delete` are platform-agnostic — **no change**.

**Endpoint summary (Python agent service, prefixed `/api`):**

| Method | Path | Body | Result |
|---|---|---|---|
| POST | `/accounts/connect-bot` | `{brand_id, token}` | `connected` + account |
| GET | `/accounts?brand_id=` | — | list (no secrets) — existing |
| POST | `/accounts/{id}/status` | `{status}` | existing |
| DELETE | `/accounts/{id}?brand_id=` | — | existing |

---

## Step 6 — Python: Discord gateway

**New dir:** `packages/Agents/agents/gateway/discord/`

| File | Mirrors | Responsibility |
|---|---|---|
| `client_manager.py` | gateway/client_manager.py | `DiscordGatewayClients`: registry keyed by `account_id`; `_connect_account` decrypts token, builds `discord.Client` with listeners attached, `start_all("discord")`, `connect_new()`, `remove()`, `stop_all()`. Each client runs via `asyncio.create_task(client.start(token))`; readiness tracked via `on_ready`. |
| `listeners.py` | gateway/listeners.py | `on_message`: **DM** + known lead → `SalesContext` → `sales_decide` → reply; **guild text** → `TalkContext` → `talk_decide` → **DM the author** + `_capture_member` (active-poster capture). Reuse the same schemas/agents/stores; only object accessors differ. |
| `sender.py` | gateway/sender.py | `drain_once`: same `PendingSendStore` flow; deliver via `client.get_user(id) or fetch_user(id)` → `.send(message)`. 429/`RateLimited` → backoff; auth failure → `handle_dead_account`. |
| `health.py` | gateway/health.py | Periodic `is_ready()` check + `connect_new()` reconciliation (hot-add accounts without restart). |
| `runner.py` | gateway/runner.py | `run_discord_gateway`: `start_all()` then `asyncio.gather(run_sender, run_health_check)` — **no joiner**. Entry: `python -m agents.gateway.discord.runner`. |

- Reuse `agents/constants/gateway.py` tunables (poll/pace/health intervals).

---

## Step 7 — Server (Hono) changes

**File:** `apps/server/src/schemas/agents.schema.ts`
- Add `ConnectBotInputSchema = z.object({ token: z.string().min(1) })`; reuse `LoginStepResultSchema`.

**File:** `apps/server/src/services/agents.service.ts`
- Add `connectBot(ctx, body)` → `callAgents("/accounts/connect-bot", { method: "POST", body, ... })`.

**File:** `apps/server/src/routes/agents/index.ts`
- Add route `POST /agents/accounts/connect-bot` + handler (mirror the `sendCode` wiring).

**No change** to `apps/server/src/routes/accounts/index.ts` or `accounts.service.ts`
(list/update/delete already platform-agnostic). No new server env vars (token comes from UI).

---

## Step 8 — Web changes

**File:** `apps/web/lib/api/agents/agents-apis.ts`
- Add `connectBot(input: { token: string }): Promise<LoginStepResult>` → `/agents/accounts/connect-bot`.

**File:** `apps/web/lib/api/agents/agents-queries.ts`
- Add `connectBotMutationOptions()`.

**File:** `apps/web/components/accounts/connect-account-dialog.tsx`
- Add a **platform picker** (Telegram | Discord). Telegram keeps the phone→code→password flow;
  Discord shows a single **token** field + **Connect bot** button, with the "how to get your token"
  steps as helper text. Reuse the existing dialog shell + `handleResult` / `onError`.
- `account-row.tsx` already renders `account.platform` — no change.

---

## Step 9 — Deployment

**File:** `docker-compose.yml`
- Clone the `gateway` service block into a new **`discord-gateway`** service:
  `image: orbis-agents:latest`, `command: ["uv","run","python","-m","agents.gateway.discord.runner"]`,
  same `env_file` / network, `restart: unless-stopped`.
- Update `LinodeVM/DEPLOY_VM.md` if it enumerates services.

---

## Step 10 — Tests

**Dir:** `packages/Agents/tests/`
- `discord_auth.connect_bot` (mock `discord.Client`).
- `DiscordGatewayClients` register / `connect_new`.
- `sender.drain_once` (inject fake store + fake client; assert sent/failed counts).
- listener: known-lead DM → Sales reply; unknown DM → no reply.

Follow the dependency-injection pattern already used in the Telegram gateway tests.

---

## Verification

1. `cd packages/Agents && pnpm test` (or `uv run pytest`) — new Discord tests pass.
2. `pnpm check-types && pnpm lint` at repo root — Hono + web changes type-clean.
3. Manual: create bot → enable Message Content intent → invite to a server → dashboard
   Accounts → Connect → Discord → paste token → account shows `platform=discord, active`,
   gateway logs "Discord client up: @botname".
4. Inbound: seeded lead DMs the bot → Sales reply; post in a channel → Talk DMs the poster
   and the poster lands in `group_member`.
5. Outbound: enqueue a `pending_send` for that account → sender delivers + marks `sent`.
6. Hot-add: connect a second bot while running → `connect_new()` brings it online, no restart.

---

## Progress

- [x] Step 2 — store layer platform filter (`all_active`, `upsert`) + Telegram manager scope
- [x] Step 3 — discord.py dependency
- [ ] Step 4 — `discord_auth.connect_bot`
- [ ] Step 5 — connect-bot account route + schema
- [ ] Step 6 — Discord gateway (manager/listeners/sender/health/runner)
- [ ] Step 7 — Hono connect-bot proxy
- [ ] Step 8 — web connect dialog (platform picker + Discord token form)
- [ ] Step 9 — docker-compose discord-gateway service
- [ ] Step 10 — tests + full verification
