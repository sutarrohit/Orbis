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

import logging

from fastapi import APIRouter, BackgroundTasks

from agents.lib.store import CommunityStore, LeadStore
from agents.agent_runners.research import run_research
from agents.schemas.research import ResearchRunRequest, ResearchRunResult
from agents.schemas.search import CommunityRecord, SearchRunResult
from agents.agent_runners.search import run_search
from agents.schemas.search import SearchRunRequest
from agents.agent_runners.sales import decide_reply as decide_sales_reply
from agents.schemas.sales import SalesContext, SalesReply
from agents.schemas.talk import LeadRecord, TalkContext, TalkDecision
from agents.agent_runners.talk import decide_reply
from agents.agent_runners.leader import run_leader_cycle
from agents.schemas.leader import LeaderCycleResult

router = APIRouter()

logger = logging.getLogger(__name__)


def _safe_run(fn, *args, **kwargs) -> None:
    """Run an agent in the background, logging (never raising) on failure.

    Background tasks have no client to report errors to; each agent already
    flips ``agent_state`` back to idle in its own ``finally``.
    """
    try:
        fn(*args, **kwargs)
    except Exception:  # noqa: BLE001 — background task must not crash the worker
        logger.exception("Background agent run failed: %s", getattr(fn, "__name__", fn))


@router.post("/agents/search/run", response_model=SearchRunResult, status_code=202)
def trigger_search(
    request: SearchRunRequest, background_tasks: BackgroundTasks
) -> SearchRunResult:
    """Kick off the Search agent in the background and return immediately.

    The run updates ``agent_state`` (running → idle) for the dashboard to poll,
    so the live status survives page navigation and reloads. The response body
    is an immediate acknowledgement, not the final result.
    """
    background_tasks.add_task(
        _safe_run,
        run_search,
        request.niche,
        brand_id=request.brand_id,
        queries=request.queries,
        limit=request.limit,
        use_llm=request.use_llm,
        firecrawl_mode=request.firecrawl_mode,
    )
    return SearchRunResult(
        brand_id=request.brand_id,
        niche=request.niche,
        queries=request.queries or [],
        firecrawl_mode=(request.firecrawl_mode or "live"),
        used_llm=False,
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


@router.post("/agents/research/run", response_model=ResearchRunResult, status_code=202)
def trigger_research(
    request: ResearchRunRequest, background_tasks: BackgroundTasks
) -> ResearchRunResult:
    """Kick off the Research agent in the background and return immediately.

    Updates ``agent_state`` for the dashboard to poll; the response body is an
    immediate acknowledgement, not the final result.
    """
    background_tasks.add_task(
        _safe_run,
        run_research,
        request.brand_id,
        niche=request.niche,
        use_llm=request.use_llm,
    )
    return ResearchRunResult(brand_id=request.brand_id)


@router.post("/agents/sales/decide", response_model=SalesReply)
def trigger_sales(ctx: SalesContext, account_active: bool = True) -> SalesReply:
    """Respond to one inbound DM from a known lead (the gateway's DM entry point).

    In production the gateway imports ``decide_reply`` directly; this route gives
    the dashboard / integration tests HTTP parity with the same function.
    """
    return decide_sales_reply(ctx, account_active=account_active)


@router.get("/agents/leads", response_model=list[LeadRecord])
def list_leads(brand_id: str | None = None) -> list[LeadRecord]:
    """List flagged leads, optionally filtered by brand."""
    store = LeadStore()
    return store.for_brand(brand_id) if brand_id else store.all()


@router.post("/agents/leader/run", response_model=LeaderCycleResult, status_code=202)
def trigger_leader(
    background_tasks: BackgroundTasks,
    brand_id: str = "default",
    use_checkpointer: bool = True,
) -> LeaderCycleResult:
    """Kick off ONE Leader cycle in the background and return immediately.

    The same cycle the scheduler fires every 5 min (load → decide → execute):
    spawn Search/Research, assign communities, apply lead/account actions, and run
    the outbound pipeline. ``use_checkpointer=false`` skips durable state (handy
    for a quick manual run without the direct DB connection). Updates
    ``agent_state`` for the dashboard to poll; the body is an acknowledgement.
    """
    background_tasks.add_task(
        _safe_run, run_leader_cycle, brand_id, use_checkpointer=use_checkpointer
    )
    return LeaderCycleResult(brand_id=brand_id)
