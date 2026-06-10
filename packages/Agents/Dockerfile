# Python agent layer. ONE image, TWO roles:
#   - the FastAPI HTTP service Hono proxies to (default CMD, port 8000)
#   - the long-running Telegram gateway runner (command overridden in compose)
#
# Build context = packages/Agents (see docker-compose.yml).
# Build standalone with:
#   docker build -t orbis-agents .
FROM python:3.13-slim

# uv for dependency management (matches the project + the gateway Dockerfile).
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# libgomp1 is needed by torch/numpy at runtime on slim images.
RUN apt-get update \
  && apt-get install -y --no-install-recommends libgomp1 ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app

# Dependencies first for better layer caching.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project

# App code.
COPY . .
RUN uv sync --frozen

EXPOSE 8000

# Default role: the FastAPI service (matches AGENTS_SERVICE_URL).
# The gateway service in docker-compose.yml overrides this command.
CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
