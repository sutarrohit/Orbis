# Deploying Orbis to a Linode VM (Docker Compose)

Deploys the **Hono API** + **Python agent service** + **Telegram gateway** to a
single always-on Linux box and exposes the API over HTTPS behind Nginx.

The database is **managed Supabase** (already in your `.env` files), so there is
no Postgres on the box.

```
                          Internet
                             │  https://api.your-domain.com
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
        │            └──────────────┘   └──────────────┘  │
        └─────────────────────────────────────────────────┘
                             │
                             ▼
                   Supabase Postgres (managed)
```

Files added to the repo for this deploy:

| File | Purpose |
|---|---|
| `apps/server/Dockerfile` | Builds the Hono image. **Build context is the repo root** (`context: .` in compose) because it's a pnpm workspace; entry `dist/src/index.js` |
| `packages/Agents/Dockerfile` | One Python image for both the FastAPI service and the gateway |
| `packages/Agents/.dockerignore`, `.dockerignore` | Keep build contexts small & secret-free |
| `docker-compose.yml` | Orchestrates `api` + `agents-api` + `gateway` on one private bridge network (`orbis-net`) |

All three services share an explicit bridge network (`orbis-net`) and reach each
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

Point a domain (e.g. `api.your-domain.com`) at the box:

```
A    api.your-domain.com    172.104.171.139
```

Wait for it to resolve (`dig +short api.your-domain.com` → the IP) before doing TLS in step 7.

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
mkdir -p /opt && cd /opt
git clone <YOUR_REPO_URL> orbis
cd orbis
```

(If the repo is private, add a deploy key or use a token in the clone URL.)

---

## 4. Create the two `.env` files on the server

`.env` files are git-ignored, so they are **not** in the clone. Create them from
your local copies. From your laptop:

```bash
scp -i ~/.ssh/orbis_deploy apps/server/.env        root@172.104.171.139:/opt/orbis/apps/server/.env
scp -i ~/.ssh/orbis_deploy packages/Agents/.env    root@172.104.171.139:/opt/orbis/packages/Agents/.env
```

Then edit the **production** values on the server (`nano /opt/orbis/apps/server/.env`):

```env
NODE_ENV="production"
FRONTEND_URL="https://your-frontend-domain.com"        # for CORS
PUBLIC_URL="https://api.your-domain.com"               # Telegram webhook target (must be HTTPS)
BETTER_AUTH_URL="https://api.your-domain.com"
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
redirect URI `https://api.your-domain.com/api/auth/callback/google`.

---

## 5. Build & start

```bash
cd /opt/orbis
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

Create `/etc/nginx/sites-available/orbis`:

```nginx
server {
    listen 80;
    server_name api.your-domain.com;

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
```

Enable it and get a certificate (certbot rewrites the block to 443 + auto-renews):

```bash
ln -s /etc/nginx/sites-available/orbis /etc/nginx/sites-enabled/orbis
nginx -t && systemctl reload nginx
certbot --nginx -d api.your-domain.com
```

Verify from your laptop:

```bash
curl -s https://api.your-domain.com/
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
cd /opt/orbis
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
  `SCHEDULER_ENABLED=true`. The `gateway` service is separate and always runs the
  Telegram send/join/health loops.
- **Run exactly one gateway.** A Telegram session string is a single authorized
  login; don't scale the `gateway` service to more than one replica.
- **No volumes needed.** Pyrogram sessions are stored (encrypted) in the DB, not
  on disk, so containers are stateless and safe to recreate.
- **Secrets** live only in the two `.env` files on the server (and are excluded
  from images by `.dockerignore`). Keep them off git and rotate the SSH key.
```
