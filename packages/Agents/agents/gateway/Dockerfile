# Gateway image — the long-running Telegram process.
# Build from the packages/Agents directory:
#   docker build -f agents/gateway/Dockerfile -t orbis-gateway .
#   docker run --env-file .env orbis-gateway
FROM python:3.13-slim

# uv for dependency management (matches the project).
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Install dependencies first (better layer caching).
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project

# App code.
COPY . .
RUN uv sync --frozen

ENV PYTHONUNBUFFERED=1

# Long-running; needs an always-on host (NOT Lambda).
CMD ["uv", "run", "python", "-m", "agents.gateway.runner"]
