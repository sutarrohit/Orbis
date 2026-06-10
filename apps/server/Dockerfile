# Hono API (@repo/api) — long-running Node service for a VM.
#
# IMPORTANT: the build context is the repository ROOT, not apps/server,
# because this is a pnpm workspace and the package depends on @repo/* configs.
# docker-compose.yml sets `context: .` accordingly.
FROM node:20-slim

# OpenSSL + CA certs are required by Prisma's query engine at runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# pnpm 9 via corepack (pinned by `packageManager` in package.json).
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /repo

# Copy the whole workspace. The root .dockerignore keeps node_modules,
# .venv, dist and .env out of the context.
COPY . .

# Install only @repo/api and the workspace packages it depends on (the trailing
# "..." pulls in @repo/typescript-config etc.), generate the Prisma client, then
# compile TypeScript to dist/.
RUN pnpm install --frozen-lockfile --filter @repo/api... \
  && pnpm --filter @repo/api db:generate \
  && pnpm --filter @repo/api build

WORKDIR /repo/apps/server
ENV NODE_ENV=production
EXPOSE 4000

# rootDir "." in tsconfig emits the entry to dist/src/index.js (NOT dist/index.js).
CMD ["node", "dist/src/index.js"]
