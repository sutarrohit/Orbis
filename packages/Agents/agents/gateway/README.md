# Gateway

The single long-running process that owns **all** Telegram I/O. The agents only
read/write Postgres; the gateway is the bridge that turns those rows into real
Telegram activity, and feeds real messages back to the agents.

```
Postgres  ◄────►  Gateway (Pyrogram, one client per active account)  ◄────►  Telegram
```

## What it does

Started once, it logs every `active` account in (with its stored session string),
then runs four things concurrently:

| Part | What it does | DB |
|---|---|---|
| **listeners** | inbound DM → **Sales**; group message → **Talk** (reply is a private DM, never a group blast) | reads `lead`/`brand_profile`, writes `conversation` |
| **sender** | drains queued outbound DMs and delivers them | `pending_send` queued → sent |
| **joiner** | joins assigned `pending_join` communities, scrapes members | `community` → joined, writes `group_member` |
| **health** | pings each account every 5 min; dead sessions → `restricted` + dropped | `social_account` |

## Prerequisites

1. **Database migrated**, including the `social_account` login columns
   (`phone`, `sessionString`, `displayName`, `lastHealthCheckAt`):
   ```
   cd ../../apps/server && pnpm db:migrate
   ```
2. **Env** (`packages/Agents/.env`):
   ```
   DATABASE_URL=postgresql://...           # pooled (pgbouncer) is fine
   DIRECT_URL=postgresql://...             # optional; only the Leader checkpointer needs it
   TELEGRAM_API_ID=...                     # from my.telegram.org
   TELEGRAM_API_HASH=...
   ACCOUNT_ENC_KEY=...                     # Fernet key; see below
   ```
   Generate the encryption key once:
   ```
   uv run python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   ```
3. **At least one connected account** — added via the login flow
   (`POST /api/accounts/send-code` → `verify-code` → `verify-password`), which
   stores an `active` `social_account` row with an encrypted `sessionString`.
   With no accounts, the gateway starts and idles.

## Run locally

```bash
cd packages/Agents
uv run python -m agents.gateway.runner
```

## Deploy

The gateway holds **persistent** Telegram connections, so it must run on an
**always-on host** — a container (ECS/Fargate, Fly.io, Railway, a small VM) —
**not AWS Lambda** (which is request-scoped and can't keep connections open).

- Run **one** instance. A Telegram session string is a single authorized
  connection; running the same account from two processes triggers
  `AUTH_KEY_DUPLICATED` and logs it out.
- A `Dockerfile` is provided in this folder.

```bash
docker build -f agents/gateway/Dockerfile -t orbis-gateway .
docker run --env-file .env orbis-gateway
```

## Operational notes

- **Pacing is deliberate** — sends are spaced (`SEND_PACE_SECONDS`), joins more so
  (`JOIN_PACE_SECONDS`); acting fast from a user account gets it spam-banned.
- **Per-account daily caps** are enforced upstream by the agents
  (`max_dms_per_day`), not here.
- **Dead sessions self-heal out**: a revoked/banned account is marked `restricted`
  and dropped; reconnect it via the login flow.
- **Compliance**: automating Telegram *user* accounts runs against Telegram's ToS
  and risks bans (Implentation.md §14). Use dedicated accounts, conservative
  pacing, and prefer inbound/opt-in flows.
```

## Tunables

All in `agents/constants/gateway.py`: poll intervals, send/join pacing, scrape
limit, health-check interval.
