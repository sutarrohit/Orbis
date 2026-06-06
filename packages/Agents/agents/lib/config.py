"""
agents/config.py
────────────────
Central settings for the agent layer, loaded from the environment (.env).

Everything an agent needs to know about *where* to run (which LLM, live vs.
offline Firecrawl, where the file store lives, the deterministic thresholds)
is read once here so the rest of the code stays free of ``os.environ`` lookups.

The defaults are chosen so the pipeline can be exercised **without spending any
credits** (``FIRECRAWL_MODE=fixture`` + regex-only extraction) while still
running live the moment real API keys have quota.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

# Load .env once, at import time. The file already exists in this repo.
load_dotenv()

# Repository root for this package (D:\Orbis\packages\Agents).
# This file lives at agents/lib/config.py → parents[2] is the package root.
PACKAGE_ROOT = Path(__file__).resolve().parents[2]


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    try:
        return int(raw)
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    """Resolved agent-layer settings (immutable snapshot of the environment)."""

    # ── LLM (the brain) ──────────────────────────────────────────────────────
    # ``init_chat_model`` style string, e.g. "openai:gpt-4o-mini".
    model: str = field(
        default_factory=lambda: os.environ.get("AGENT_MODEL", "openai:gpt-4o-mini")
    )
    # Optional overrides to point the OpenAI-compatible client somewhere else
    # (e.g. OpenRouter). When base_url is set we build ChatOpenAI directly.
    llm_base_url: str | None = field(
        default_factory=lambda: os.environ.get("AGENT_LLM_BASE_URL") or None
    )
    llm_api_key: str | None = field(
        default_factory=lambda: os.environ.get("AGENT_LLM_API_KEY")
        or os.environ.get("OPENAI_API_KEY")
        or None
    )

    # ── OpenRouter fallback ──────────────────────────────────────────────────
    # When set, every LLM call falls back to OpenRouter if the primary model
    # errors (e.g. an OpenAI quota / 429). OpenRouter is OpenAI-compatible.
    openrouter_api_key: str | None = field(
        default_factory=lambda: os.environ.get("OPENROUTER_API_KEY") or None
    )
    openrouter_model: str = field(
        default_factory=lambda: os.environ.get("OPENROUTER_MODEL", "openai/gpt-4o-mini")
    )
    openrouter_base_url: str = field(
        default_factory=lambda: os.environ.get(
            "OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"
        )
    )

    # ── Telegram (account login via MTProto / Pyrogram) ──────────────────────
    telegram_api_id: int = field(
        default_factory=lambda: _env_int("TELEGRAM_API_ID", 0)
    )
    telegram_api_hash: str | None = field(
        default_factory=lambda: os.environ.get("TELEGRAM_API_HASH") or None
    )
    # Fernet key (url-safe base64, 32 bytes) used to encrypt account session
    # strings at rest. Generate one with:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    account_enc_key: str | None = field(
        default_factory=lambda: os.environ.get("ACCOUNT_ENC_KEY") or None
    )

    # ── Firecrawl ────────────────────────────────────────────────────────────
    firecrawl_api_key: str | None = field(
        default_factory=lambda: os.environ.get("FIRECRAWL_API_KEY") or None
    )
    # "live"   → call Firecrawl (needs credits)
    # "fixture"→ read a local fixture file instead (free, for development/tests)
    firecrawl_mode: str = field(
        default_factory=lambda: os.environ.get("FIRECRAWL_MODE", "live").strip().lower()
    )

    # ── Search agent knobs ───────────────────────────────────────────────────
    search_limit: int = field(default_factory=lambda: _env_int("SEARCH_LIMIT", 5))
    # Use the LLM to extract/score communities. When False (or no LLM quota),
    # the agent falls back to a deterministic regex-only pass.
    search_use_llm: bool = field(
        default_factory=lambda: _env_bool("SEARCH_USE_LLM", True)
    )
    # Minimum niche relevance (0-100) for a community to be kept.
    search_min_relevance: int = field(
        default_factory=lambda: _env_int("SEARCH_MIN_RELEVANCE", 30)
    )

    # ── Research agent knobs ─────────────────────────────────────────────────
    research_use_llm: bool = field(
        default_factory=lambda: _env_bool("RESEARCH_USE_LLM", True)
    )
    # Minimum score (0-100) to save a prospect; the auto-DM bar is higher (§7.2).
    research_prospect_min: int = field(
        default_factory=lambda: _env_int("RESEARCH_PROSPECT_MIN", 50)
    )
    research_autodm_min: int = field(
        default_factory=lambda: _env_int("RESEARCH_AUTODM_MIN", 60)
    )

    # ── Sales agent knobs ────────────────────────────────────────────────────
    sales_use_llm: bool = field(
        default_factory=lambda: _env_bool("SALES_USE_LLM", True)
    )
    # Max DM replies one account may send per brand per day (§11).
    max_sales_dms_per_day: int = field(
        default_factory=lambda: _env_int("MAX_SALES_DMS_PER_DAY", 15)
    )

    # ── Outbound state machine knobs (§9) ────────────────────────────────────
    # Max outbound DMs one account may queue per brand per day (§11).
    max_dms_per_day: int = field(
        default_factory=lambda: _env_int("MAX_DMS_PER_DAY", 15)
    )

    # ── Scheduler — the clock (§10) ──────────────────────────────────────────
    # When enabled, the FastAPI app fires the Leader cycle + follow-up sweep on
    # an interval. Off by default so importing the app never starts timers.
    scheduler_enabled: bool = field(
        default_factory=lambda: _env_bool("SCHEDULER_ENABLED", False)
    )
    leader_interval_minutes: int = field(
        default_factory=lambda: _env_int("LEADER_INTERVAL_MINUTES", 5)
    )
    followup_interval_minutes: int = field(
        default_factory=lambda: _env_int("FOLLOWUP_INTERVAL_MINUTES", 15)
    )

    # ── Postgres (the source of truth) ───────────────────────────────────────
    # The pooled connection string shared with apps/server. When set, the
    # repositories in ``store.py`` write here instead of the JSON file store.
    database_url: str | None = field(
        default_factory=lambda: os.environ.get("DATABASE_URL") or None
    )
    # Direct (non-pgBouncer) connection for tools that need prepared statements
    # or run DDL — notably the LangGraph checkpointer. If unset, db.py derives a
    # session-pooler URL from DATABASE_URL.
    direct_url: str | None = field(
        default_factory=lambda: os.environ.get("DIRECT_URL") or None
    )
    # Slug/name of the brand the agents attribute work to when they pass the
    # legacy string ``brand_id`` (e.g. "default"). Resolved to a real Brand row
    # by ``agents.lib.db.resolve_brand_id`` (get-or-create).
    default_brand_slug: str = field(
        default_factory=lambda: os.environ.get("AGENT_DEFAULT_BRAND_SLUG", "default")
    )

    @property
    def fixtures_dir(self) -> Path:
        """Bundled Firecrawl fixtures (offline Search mode). Not a data store."""
        return PACKAGE_ROOT / "agents" / "fixtures"


# Module-level singleton; import this everywhere.
settings = Settings()
