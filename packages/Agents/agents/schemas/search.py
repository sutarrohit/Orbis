"""
agents/schemas/search.py
─────────────────────────
Pydantic v2 models for the Search agent.

Two kinds of model live here:

1. **Decision schemas** — the *only* thing an LLM is ever allowed to return.
   With ``.with_structured_output(Schema)`` the class name, docstring, and field
   descriptions are effectively part of the prompt, so they are written for the
   model to read. If validation fails, the worker fails loudly — it never
   half-executes free-form text.

2. **Stored records** — the shape persisted to the file store (the Postgres
   stand-in). These carry bookkeeping the LLM never sees (status, source,
   timestamps, dedup key).

Only the Search agent's models are filled in for now; the others are sketched
from Implentation.md §5.2 for when those agents are built.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# ─────────────────────────────────────────────────────────────────────────────
# Search — decision schema (what the LLM returns)
# ─────────────────────────────────────────────────────────────────────────────


class FoundCommunity(BaseModel):
    """A single Telegram community discovered for the brand's niche."""

    handle: str = Field(
        description="The Telegram handle or link: a '@username', a 't.me/username' "
        "link, or a 't.me/+invitehash' invite link. Copy it exactly as it appears.",
    )
    name: str = Field(
        description="Human-readable name of the group/channel. Use the handle if no name is given.",
    )
    niche_relevance: int = Field(
        ge=0,
        le=100,
        description="How relevant this community is to the brand's niche, 0 (irrelevant) "
        "to 100 (perfect fit). Judge from the title/description/context.",
    )


class SearchResult(BaseModel):
    """All Telegram communities extracted from the supplied web search results.

    Only include real Telegram groups or channels (things addressable by an
    @username or a t.me link). Ignore unrelated links, articles, and people.
    """

    communities: list[FoundCommunity] = Field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────────────
# Search — stored record (the file store / future `communities` table)
# ─────────────────────────────────────────────────────────────────────────────

CommunityStatus = Literal["pending_join", "joined", "rejected"]
CommunitySource = Literal["search"]


class CommunityRecord(BaseModel):
    """A community as persisted to the store.

    Search **discovers but does not join** — every record is written with
    ``status="pending_join"``; the gateway joins and scrapes members later.
    """

    brand_id: str = Field(description="Which brand this community was found for.")
    handle: str = Field(
        description="Canonical Telegram handle/link (the dedup key, with brand_id)."
    )
    name: str = ""
    niche_relevance: int = Field(default=0, ge=0, le=100)
    status: CommunityStatus = "pending_join"
    source: CommunitySource = "search"
    found_via: str = Field(
        default="llm", description="How it was extracted: 'llm' or 'regex'."
    )
    source_url: str = Field(
        default="", description="The web page the handle was found on."
    )
    created_at: str = Field(
        default="", description="UTC ISO-8601 timestamp of first discovery."
    )


# ─────────────────────────────────────────────────────────────────────────────
# Run result returned by the Search worker (API/CLI response payload)
# ─────────────────────────────────────────────────────────────────────────────


class SearchRunResult(BaseModel):
    """Summary of one Search agent run."""

    brand_id: str
    niche: str
    queries: list[str]
    firecrawl_mode: str
    used_llm: bool
    pages_searched: int = 0
    discovered: int = Field(
        default=0,
        description="Distinct communities found this run (pre-dedup vs store).",
    )
    saved_new: int = Field(
        default=0, description="New communities written to the store."
    )
    duplicates: int = Field(default=0, description="Found but already in the store.")
    communities: list[CommunityRecord] = Field(default_factory=list)
