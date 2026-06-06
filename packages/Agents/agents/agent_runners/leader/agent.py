"""
agents/agent_runners/leader/agent.py — the Leader (orchestrator, §8)
─────────────────────────────────────────────────────────────────────
The only stateful, branching role, so it is a LangGraph graph with three nodes
(Implentation.md §8):

    load   — read the brand's full state from Postgres (the snapshot)
    decide — ONE LLM call → a typed LeaderPlan, constrained by the hard rules
    execute — deterministic code applies the plan: spawn workers, assign
              communities, apply gateway/lead actions, run the outbound pipeline

The core principle holds (Implentation.md §1): the LLM only judges; code executes
and re-checks every hard rule. Durable per-brand state is kept by the LangGraph
Postgres checkpointer (one ``thread_id`` per brand).
"""

from __future__ import annotations

import logging
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from agents.agent_runners.outreach import run_outbound_pipeline
from agents.agent_runners.research import run_research
from agents.agent_runners.search import run_search
from agents.constants.leader import ACTION_CYCLE, MAX_GROUPS_PER_ACCOUNT
from agents.lib import db, guardrails
from agents.lib.llm import brain
from agents.lib.store import LeadStore, SocialAccountStore
from agents.prompts.leader import render_leader_prompt
from agents.schemas.leader import LeaderCycleResult, LeaderPlan

logger = logging.getLogger(__name__)

AGENT_TYPE = "leader"


# ─────────────────────────────────────────────────────────────────────────────
# LOAD — read the brand's full state
# ─────────────────────────────────────────────────────────────────────────────


def load_full_state(brand_id: str) -> dict:
    """Snapshot the brand's funnel state for the decide step."""
    bid = db.resolve_brand_id(brand_id)
    with db.cursor() as cur:
        cur.execute('SELECT niche, active FROM brand WHERE id = %s', (bid,))
        row = cur.fetchone()
        niche, active = (row[0], row[1]) if row else ("", True)

        cur.execute(
            'SELECT status, count(*) FROM community WHERE "brandId" = %s GROUP BY status',
            (bid,),
        )
        comm = {r[0]: r[1] for r in cur.fetchall()}

        cur.execute(
            'SELECT count(*) FROM community WHERE "brandId" = %s '
            'AND status = %s::"CommunityStatus" AND "assignedAccountId" IS NULL',
            (bid, "joined"),
        )
        unassigned_joined = cur.fetchone()[0]

        cur.execute(
            'SELECT count(*) FROM group_member gm WHERE gm."brandId" = %s '
            "AND gm.username <> '' AND NOT EXISTS ("
            'SELECT 1 FROM lead l WHERE l."brandId" = gm."brandId" '
            'AND l."userId" = gm."userId")',
            (bid,),
        )
        scoreable_members = cur.fetchone()[0]

        cur.execute(
            'SELECT status, count(*) FROM lead WHERE "brandId" = %s GROUP BY status',
            (bid,),
        )
        leads_by_status = {r[0]: r[1] for r in cur.fetchall()}

        cur.execute(
            'SELECT "externalId", status FROM social_account WHERE "brandId" = %s',
            (bid,),
        )
        accounts = [{"account_id": r[0], "status": r[1]} for r in cur.fetchall()]

        cur.execute(
            'SELECT "userId", username, status, score, note FROM lead '
            'WHERE "brandId" = %s ORDER BY "createdAt" DESC LIMIT 20',
            (bid,),
        )
        recent_leads = [
            {"user_id": r[0], "username": r[1], "status": r[2], "score": r[3], "note": r[4]}
            for r in cur.fetchall()
        ]

        cur.execute(
            'SELECT text FROM learning WHERE "brandId" = %s '
            'ORDER BY "createdAt" DESC LIMIT 10',
            (bid,),
        )
        learnings = [r[0] for r in cur.fetchall()]

    return {
        "brand_id": brand_id,
        "niche": niche,
        "active": active,
        "joined_communities": comm.get("joined", 0),
        "pending_communities": comm.get("pending_join", 0),
        "unassigned_joined": unassigned_joined,
        "scoreable_members": scoreable_members,
        "leads_by_status": leads_by_status,
        "prospects": leads_by_status.get("prospect", 0),
        "accounts": accounts,
        "active_accounts": sum(1 for a in accounts if a["status"] == "active"),
        "recent_leads": recent_leads,
        "learnings": learnings,
        "running": {
            "search": guardrails.is_running(brand_id, "search"),
            "research": guardrails.is_running(brand_id, "research"),
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# EXECUTE — deterministic appliers (each re-checks the hard rules)
# ─────────────────────────────────────────────────────────────────────────────


def _save_learnings(brand_id: str, learnings: list[str]) -> int:
    bid = db.resolve_brand_id(brand_id)
    saved = 0
    with db.cursor() as cur:
        for text in learnings:
            if not text.strip():
                continue
            cur.execute(
                'INSERT INTO learning (id, "brandId", text) VALUES (%s, %s, %s)',
                (db.new_id(), bid, text.strip()),
            )
            saved += 1
    return saved


def auto_assign_communities(brand_id: str) -> int:
    """Round-robin assign joined-but-unassigned communities to active accounts,
    capped at ``MAX_GROUPS_PER_ACCOUNT`` per account."""
    bid = db.resolve_brand_id(brand_id)
    accounts = [aid for (aid, _ext) in SocialAccountStore().active_for_brand(brand_id)]
    if not accounts:
        return 0
    assigned = 0
    with db.cursor() as cur:
        cur.execute(
            'SELECT id FROM community WHERE "brandId" = %s '
            'AND status = %s::"CommunityStatus" AND "assignedAccountId" IS NULL',
            (bid, "joined"),
        )
        unassigned = [r[0] for r in cur.fetchall()]
        cur.execute(
            'SELECT "assignedAccountId", count(*) FROM community '
            'WHERE "brandId" = %s AND "assignedAccountId" IS NOT NULL '
            'GROUP BY "assignedAccountId"',
            (bid,),
        )
        load = {r[0]: r[1] for r in cur.fetchall()}
        for comm_id in unassigned:
            eligible = [a for a in accounts if load.get(a, 0) < MAX_GROUPS_PER_ACCOUNT]
            if not eligible:
                break
            target = min(eligible, key=lambda a: load.get(a, 0))
            cur.execute(
                'UPDATE community SET "assignedAccountId" = %s, "updatedAt" = now() '
                "WHERE id = %s",
                (target, comm_id),
            )
            load[target] = load.get(target, 0) + 1
            assigned += 1
    return assigned


def _apply_gateway_actions(brand_id: str, actions: list) -> int:
    bid = db.resolve_brand_id(brand_id)
    mapping = {"activate": "active", "pause": "paused"}
    applied = 0
    with db.cursor() as cur:
        for a in actions:
            status = mapping.get(a.action)
            if not status:
                continue
            cur.execute(
                'UPDATE social_account SET status = %s::"SocialAccountStatus", '
                '"updatedAt" = now() WHERE "brandId" = %s AND "externalId" = %s',
                (status, bid, a.account_id),
            )
            applied += cur.rowcount
    return applied


def _apply_lead_actions(brand_id: str, actions: list) -> int:
    store = LeadStore()
    applied = 0
    for a in actions:
        if store.update(brand_id, a.user_id, status=a.new_status, note=a.note):
            applied += 1
    return applied


# ─────────────────────────────────────────────────────────────────────────────
# The graph nodes
# ─────────────────────────────────────────────────────────────────────────────


class LeaderState(TypedDict, total=False):
    brand_id: str
    snapshot: dict
    plan: Any
    used_llm: bool
    result: Any


def load_node(state: LeaderState) -> LeaderState:
    return {"snapshot": load_full_state(state["brand_id"])}


def decide_node(state: LeaderState) -> LeaderState:
    try:
        plan = brain(LeaderPlan).invoke(render_leader_prompt(state["snapshot"]))
        return {"plan": plan, "used_llm": True}
    except Exception as exc:  # safe no-op plan on any LLM failure
        logger.warning("Leader decide unavailable; empty plan: %s", exc)
        return {"plan": LeaderPlan(), "used_llm": False}


def execute_node(state: LeaderState) -> LeaderState:
    brand_id = state["brand_id"]
    snap = state["snapshot"]
    plan: LeaderPlan = state["plan"]
    result = LeaderCycleResult(
        brand_id=brand_id,
        used_llm=state.get("used_llm", False),
        strategy_notes=plan.strategy_notes,
    )

    result.learnings_saved = _save_learnings(brand_id, plan.new_learnings)

    # Spawn workers — re-check the running guard (never double-run, §6/§11).
    if plan.spawn_search and not guardrails.is_running(brand_id, "search"):
        run_search(snap.get("niche", ""), brand_id=brand_id)
        result.spawned_search = True
    if plan.spawn_research and not guardrails.is_running(brand_id, "research"):
        run_research(brand_id, niche=snap.get("niche", ""))
        result.spawned_research = True

    result.communities_assigned = auto_assign_communities(brand_id)
    result.gateway_actions_applied = _apply_gateway_actions(brand_id, plan.gateway_actions)
    result.lead_actions_applied = _apply_lead_actions(brand_id, plan.lead_actions)

    outbound = run_outbound_pipeline(brand_id)
    result.outbound = outbound.model_dump()

    guardrails.record_activity(
        brand_id,
        AGENT_TYPE,
        ACTION_CYCLE,
        {
            "spawned_search": result.spawned_search,
            "spawned_research": result.spawned_research,
            "communities_assigned": result.communities_assigned,
            "lead_actions": result.lead_actions_applied,
            "used_llm": result.used_llm,
        },
    )
    return {"result": result}


# ─────────────────────────────────────────────────────────────────────────────
# Graph build + checkpointer + cycle runner
# ─────────────────────────────────────────────────────────────────────────────

_checkpointer = None
_graph = None


def get_checkpointer():
    """The shared LangGraph Postgres checkpointer (built once).

    Uses the direct/session-pooler connection (prepared statements + DDL), not
    the transaction pooler. ``setup()`` creates its own tables (owned by
    LangGraph, not Prisma).
    """
    global _checkpointer
    if _checkpointer is None:
        from langgraph.checkpoint.postgres import PostgresSaver
        from psycopg_pool import ConnectionPool

        pool = ConnectionPool(
            db.direct_conninfo(),
            min_size=1,
            max_size=3,
            kwargs={"autocommit": True, "prepare_threshold": 0},
            open=True,
        )
        cp = PostgresSaver(pool)
        cp.setup()
        _checkpointer = cp
    return _checkpointer


def build_leader_graph(checkpointer=None):
    """Compile the Leader graph. Pass a checkpointer for durable per-brand state."""
    builder = StateGraph(LeaderState)
    builder.add_node("load", load_node)
    builder.add_node("decide", decide_node)
    builder.add_node("execute", execute_node)
    builder.add_edge(START, "load")
    builder.add_edge("load", "decide")
    builder.add_edge("decide", "execute")
    builder.add_edge("execute", END)
    return builder.compile(checkpointer=checkpointer)


def run_leader_cycle(
    brand_id: str = "default", *, use_checkpointer: bool = True
) -> LeaderCycleResult:
    """Run one Leader cycle for ``brand_id`` (load → decide → execute).

    With ``use_checkpointer`` the graph keeps durable per-brand state under a
    ``thread_id`` of ``leader:<brand_id>`` (crash recovery + continuity).
    """
    global _graph
    if _graph is None:
        cp = get_checkpointer() if use_checkpointer else None
        _graph = build_leader_graph(cp)
    config = {"configurable": {"thread_id": f"leader:{brand_id}"}}
    final = _graph.invoke({"brand_id": brand_id}, config=config)
    return final["result"]
