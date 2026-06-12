# Deploying Orbis to a Linode VM (Docker Compose)

Deploys the **Hono API** + **Python agent service** + **Telegram gateway** +
**Discord gateway** to a single always-on Linux box and exposes the API over
HTTPS behind Nginx.

The database is **managed Supabase** (already in your `.env` files), so there is
no Postgres on the box.

```
                          Internet
                             │  https://api.orbist.space
                             ▼
                    ┌──────────────────┐   host
                    │  Nginx + certbot │   (TLS termination)
                    └────────┬─────────┘
                             │ http://127.0.0.1:4000
        ┌────────────────────┼───────────────────────────┐  docker compose
        │                    ▼                            │
        │            ┌──────────────┐                     │
        │            │   api (Hono) │  :4000              │
        │            └──────┬───────┘                     │
        │   http://agents-api:8000  │                     │
        │            ┌──────▼───────┐   ┌──────────────┐  │
        │            │  agents-api  │   │   gateway    │  │
        │            │  (FastAPI)   │   │ (Telegram)   │  │
        │            └──────────────┘   ├──────────────┤  │
        │                               │ discord-     │  │
        │                               │ gateway      │  │
        │                               └──────────────┘  │
        └─────────────────────────────────────────────────┘
                             │
                             ▼
                   Supabase Postgres (managed)
```

Files added to the repo for this deploy:

| File | Purpose |
|---|---|
| `apps/server/Dockerfile` | Builds the Hono image. **Build context is the repo root** (`context: .` in compose) because it's a pnpm workspace; entry `dist/src/index.js` |
| `packages/Agents/Dockerfile` | One Python image for the FastAPI service and both gateways (Telegram + Discord) |
| `packages/Agents/.dockerignore`, `.dockerignore` | Keep build contexts small & secret-free |
| `docker-compose.yml` | Orchestrates `api` + `agents-api` + `gateway` + `discord-gateway` on one private bridge network (`orbis-net`) |

All services share an explicit bridge network (`orbis-net`) and reach each
other **by service name** — the Hono API calls the Python service at
`http://agents-api:8000`. Inside Docker the service name *is* the private
address; sibling containers are **not** reachable via `localhost`.

---

## 0. Rotate the SSH key first (security)

The private key for `root@172.104.171.139` was pasted into a chat, so treat it as
**compromised**. After you can log in, replace it:

```bash
# On your laptop — make a fresh key
ssh-keygen -t ed25519 -f ~/.ssh/orbis_deploy -C "orbis-deploy"

# Copy the NEW public key up (uses the old key one last time)
ssh-copy-id -i ~/.ssh/orbis_deploy.pub root@172.104.171.139

# Log in with the new key, then remove the old one from authorized_keys
ssh -i ~/.ssh/orbis_deploy root@172.104.171.139
nano ~/.ssh/authorized_keys   # delete the "zdInstance" id_ed25519_new line
```

---

## 1. DNS

Point a domain (e.g. `api.orbist.space`) at the box:

```
A    api.orbist.space    172.104.171.139
```

Wait for it to resolve (`dig +short api.orbist.space` → the IP) before doing TLS in step 7.

---

## 2. Server prep (Docker + firewall)

SSH in and install Docker Engine + the Compose plugin:

```bash
ssh -i ~/.ssh/orbis_deploy root@172.104.171.139

# Docker (official convenience script)
curl -fsSL https://get.docker.com | sh

# Firewall: SSH + HTTP + HTTPS only
apt-get update && apt-get install -y ufw git
ufw allow 22 && ufw allow 80 && ufw allow 443
ufw --force enable

docker --version && docker compose version
```

> Optional but recommended: create a non-root sudo user and deploy as that user
> instead of `root`.

---

## 3. Get the code onto the box

```bash
# On the server
mkdir -p ~/orbis && cd ~/orbis
git clone <YOUR_REPO_URL>     # creates ~/orbis/Orbis
cd Orbis
```

(If the repo is private, add a deploy key or use a token in the clone URL.)

---

## 4. Create the two `.env` files on the server

`.env` files are git-ignored, so they are **not** in the clone. Create them from
your local copies. From your laptop:

```bash
# Run from the repo root; LinodeVM/id_ed25519_new is your SSH private key.
scp -i LinodeVM/id_ed25519_new apps/server/.env        root@172.104.171.139:~/orbis/Orbis/apps/server/.env
scp -i LinodeVM/id_ed25519_new packages/Agents/.env    root@172.104.171.139:~/orbis/Orbis/packages/Agents/.env
```

> The `LinodeVM/` key is git-ignored (kept out of the repo). On Windows, if SSH
> rejects the key with a permissions error, restrict it first:
> `icacls LinodeVM\id_ed25519_new /inheritance:r /grant:r "$($env:USERNAME):R"`.

Then edit the **production** values on the server (`nano ~/orbis/Orbis/apps/server/.env`):

```env
NODE_ENV="production"
FRONTEND_URL="https://orbist.space"                    # your web app's origin (CORS)
PUBLIC_URL="https://api.orbist.space"               # Telegram webhook target (must be HTTPS)
BETTER_AUTH_URL="https://api.orbist.space"
# DATABASE_URL / DIRECT_URL: keep your Supabase values
# AGENTS_JWT_SECRET: MUST match the value in packages/Agents/.env
# AGENTS_SERVICE_URL is overridden to http://agents-api:8000 by docker-compose — leave as-is
```

In `packages/Agents/.env`, confirm:

```env
AGENTS_JWT_SECRET="<same value as apps/server/.env>"
SCHEDULER_ENABLED="true"     # set true if you want the Leader clock to run (in agents-api)
# DATABASE_URL / DIRECT_URL: your Supabase values
# TELEGRAM_API_ID / TELEGRAM_API_HASH / encryption keys / LLM keys: production values
```

> Critical: **`AGENTS_JWT_SECRET` must be identical** in both files — it's the
> shared secret Hono uses to sign the service token the Python side verifies.

Also update **Google OAuth**: in the Google Cloud console add the authorized
redirect URI `https://api.orbist.space/api/auth/callback/google`.

---

## 5. Build & start

```bash
cd ~/orbis/Orbis
docker compose up -d --build
docker compose ps
```

First build is slow. The Hono image installs the whole pnpm workspace and runs
`prisma generate`; the Python image pulls Pyrogram and (currently) Torch — see
the Torch caveat at the bottom. Watch logs:

```bash
docker compose logs -f api
docker compose logs -f agents-api
docker compose logs -f gateway
docker compose logs -f discord-gateway
```

Sanity-check inside the box:

```bash
curl -s http://127.0.0.1:4000/                # Hono
curl -s http://127.0.0.1:8000/health          # agents-api (published on localhost) → {"status":"ok"}
```

> `agents-api` publishes `127.0.0.1:8000` for host-side debugging only; it is
> **not** exposed publicly (the firewall in step 2 opens 22/80/443 only). The
> Hono API still reaches it over the compose network at `http://agents-api:8000`,
> not via this host port.

---

## 6. Database migrations (optional)

Your Supabase DB is already migrated from local dev, so usually nothing to do.
If you ever need to apply pending migrations:

```bash
docker compose run --rm api pnpm --filter @repo/api exec prisma migrate deploy
```

(Uses `DIRECT_URL`.)

---

## 7. Nginx + HTTPS (host)

```bash
apt-get install -y nginx certbot python3-certbot-nginx
```

First confirm DNS resolves (certbot's HTTP-01 challenge fails otherwise):

```bash
dig +short api.orbist.space      # must print 172.104.171.139
```

Create the site with a quoted heredoc (so `$host` etc. land verbatim):

```bash
cat >/etc/nginx/sites-available/orbis <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name api.orbist.space;

    # Better Auth sets cookies; large headers on OAuth — give it room.
    proxy_buffer_size   16k;
    proxy_buffers       4 16k;

    location / {
        proxy_pass         http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}
NGINX
```

Enable it (and remove the stock default site, which otherwise shadows ours on
port 80), then get a certificate — certbot rewrites the block to 443, adds an
HTTP→HTTPS redirect, and installs an auto-renew timer:

```bash
ln -sf /etc/nginx/sites-available/orbis /etc/nginx/sites-enabled/orbis
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

ufw allow 443 && ufw reload      # also allow 443 in the Linode Cloud Firewall
certbot --nginx -d api.orbist.space
certbot renew --dry-run          # confirm auto-renew works
```

Verify from your laptop:

```bash
curl -s https://api.orbist.space/
```

---

## 8. Register the Telegram webhook

Now that `PUBLIC_URL` is a real HTTPS URL:

```bash
docker compose exec api pnpm --filter @repo/api webhook:telegram
```

---

## 9. Updating after code changes

```bash
cd ~/orbis/Orbis
git pull
docker compose up -d --build      # rebuilds only what changed
docker compose logs -f
```

---

## Operations cheat-sheet

| Action | Command |
|---|---|
| Status | `docker compose ps` |
| Logs (one service) | `docker compose logs -f gateway` |
| Restart one service | `docker compose restart agents-api` |
| Stop all | `docker compose down` |
| Rebuild from scratch | `docker compose build --no-cache && docker compose up -d` |
| Shell into a container | `docker compose exec api sh` |
| Disk usage / cleanup | `docker system df` / `docker system prune -af` |

---

## Caveats & notes

- **Torch is an unused dependency (remove it).** `torch>=2.0` (and `einops`) are
  listed in `packages/Agents/pyproject.toml` but **not imported anywhere** in the
  agent code. On Linux, `torch` pulls the full CUDA stack (the `nvidia-*` wheels,
  ~2–3 GB) even with no GPU, bloating build time and disk on a small Linode.
  Removing `torch` and `einops` from `pyproject.toml` and re-running `uv lock`
  drops the entire CUDA download. (If a future feature ever needs Torch on a
  CPU-only box, pin it to the CPU wheel index `https://download.pytorch.org/whl/cpu`
  instead of the default PyPI build.)
- **`prisma generate` runs at build time without secrets.** The runtime `.env` is
  injected later via compose `env_file`, so `prisma.config.ts` reads `DIRECT_URL`
  straight from the environment with a build-time placeholder rather than the
  app's strict `src/env.ts` validator. The real env is still validated when the
  server actually boots.
- **The clock / scheduler** runs inside the `agents-api` (FastAPI) lifespan when
  `SCHEDULER_ENABLED=true`. The `gateway` (Telegram) and `discord-gateway` services
  are separate and always run their platform's send/health loops; the Telegram
  gateway also runs the community join/scrape loop (Discord bots can't cold-join).
- **Run exactly one of each gateway.** A Telegram session string / Discord bot
  token is a single authorized login; don't scale either gateway service past one
  replica.
- **No volumes needed.** Pyrogram sessions are stored (encrypted) in the DB, not
  on disk, so containers are stateless and safe to recreate.
- **Secrets** live only in the two `.env` files on the server (and are excluded
  from images by `.dockerignore`). Keep them off git and rotate the SSH key.
```
