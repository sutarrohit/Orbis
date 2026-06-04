"""
routers/agents.py
─────────────────
FastAPI routes for the agent layer (manual / dashboard-button entry points).

Mirrors the dual-entry pattern from Implentation.md §6: the endpoint calls the
exact same ``run_search`` function the Leader would call automatically.

Wire into the app with::

    from routers import agents
    app.include_router(agents.router, prefix="/api", tags=["Agents"])
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from agents.lib.schemas import CommunityRecord, SearchRunResult
from agents.lib.store import CommunityStore
from agents.roles.search import run_search

router = APIRouter()


class SearchRunRequest(BaseModel):
    """Body for triggering the Search agent."""

    niche: str = Field(description="The brand's niche, e.g. 'AI startup founders'.")
    brand_id: str = Field(
        default="default", description="Which brand to attribute finds to."
    )
    queries: list[str] | None = Field(
        default=None,
        description="Override the web search queries. Defaults to one derived from the niche.",
    )
    limit: int | None = Field(default=None, description="Max web results per query.")
    use_llm: bool | None = Field(default=None, description="Override SEARCH_USE_LLM.")
    firecrawl_mode: str | None = Field(
        default=None, description="'live' or 'fixture' override."
    )


@router.post("/agents/search/run", response_model=SearchRunResult, status_code=201)
def trigger_search(request: SearchRunRequest) -> SearchRunResult:
    """Run the Search agent once and persist discovered communities (pending_join)."""
    return run_search(
        request.niche,
        brand_id=request.brand_id,
        queries=request.queries,
        limit=request.limit,
        use_llm=request.use_llm,
        firecrawl_mode=request.firecrawl_mode,
    )


@router.get("/agents/communities", response_model=list[CommunityRecord])
def list_communities(brand_id: str | None = None) -> list[CommunityRecord]:
    """List discovered communities, optionally filtered by brand."""
    store = CommunityStore()
    return store.for_brand(brand_id) if brand_id else store.all()
