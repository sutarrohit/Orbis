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

from agents.lib.store import CommunityStore
from agents.schemas.search import CommunityRecord, SearchRunResult
from agents.search import run_search
from agents.schemas.search import SearchRunRequest

router = APIRouter()


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
