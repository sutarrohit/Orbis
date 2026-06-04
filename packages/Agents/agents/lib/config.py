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

    # ── File store (stand-in for Postgres) ───────────────────────────────────
    data_dir: Path = field(
        default_factory=lambda: Path(
            os.environ.get("AGENT_DATA_DIR", str(PACKAGE_ROOT / "data"))
        )
    )

    @property
    def communities_file(self) -> Path:
        return self.data_dir / "communities.json"

    @property
    def leads_file(self) -> Path:
        return self.data_dir / "leads.json"

    @property
    def conversations_file(self) -> Path:
        return self.data_dir / "conversations.json"

    @property
    def group_members_file(self) -> Path:
        return self.data_dir / "group_members.json"

    @property
    def token_usage_file(self) -> Path:
        return self.data_dir / "token_usage.jsonl"

    @property
    def activity_file(self) -> Path:
        return self.data_dir / "agent_activity.jsonl"

    @property
    def fixtures_dir(self) -> Path:
        return PACKAGE_ROOT / "agents" / "fixtures"


# Module-level singleton; import this everywhere.
settings = Settings()
