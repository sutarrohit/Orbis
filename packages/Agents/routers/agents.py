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

from agents.lib.store import CommunityStore, LeadStore
from agents.research import run_research
from agents.schemas.research import ResearchRunRequest, ResearchRunResult
from agents.schemas.search import CommunityRecord, SearchRunResult
from agents.search import run_search
from agents.schemas.search import SearchRunRequest
from agents.schemas.talk import LeadRecord, TalkContext, TalkDecision
from agents.talk import decide_reply

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


@router.post("/agents/talk/decide", response_model=TalkDecision)
def trigger_talk(ctx: TalkContext, account_active: bool = True) -> TalkDecision:
    """Judge one inbound group message (the gateway's per-message entry point).

    In production the gateway imports ``decide_reply`` directly; this route gives
    the dashboard / integration tests HTTP parity with the same function.
    """
    return decide_reply(ctx, account_active=account_active)


@router.post("/agents/research/run", response_model=ResearchRunResult, status_code=201)
def trigger_research(request: ResearchRunRequest) -> ResearchRunResult:
    """Run the Research agent once: score conversations + members into leads."""
    return run_research(
        request.brand_id, niche=request.niche, use_llm=request.use_llm
    )


@router.get("/agents/leads", response_model=list[LeadRecord])
def list_leads(brand_id: str | None = None) -> list[LeadRecord]:
    """List flagged leads, optionally filtered by brand."""
    store = LeadStore()
    return store.for_brand(brand_id) if brand_id else store.all()
