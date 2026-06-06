"""
agents/research/agent.py — Research agent (spawnable worker)
────────────────────────────────────────────────────────────
Score people into the shared lead bus (Implentation.md §7.2). Two passes:

  - inbound  — analyse recent ``conversations`` → people who showed interest →
               save as leads ``status="new", source="inbound"``.
  - outbound — pull ``group_members`` with a username, not already a lead →
               score on bio/activity/niche fit → save the good ones
               ``status="prospect", source="outbound"`` with a recommended approach.

This is the ONE place Research lives (Implentation.md §6); both the dashboard
button and the Leader call ``run_research`` — the ``is_running`` guard makes that
safe in either direction. **Skips cleanly when there is no data.**

The three steps (LLM judges, code executes):
  1. READ    — load conversations + group members for the brand from the bus.
  2. DECIDE  — up to two structured LLM calls returning ``ResearchResult``.
  3. EXECUTE — threshold filter (≥ prospect_min), map score→band, build
               ``LeadRecord``s, idempotent upsert, record activity.

Unlike Search there is no regex backstop: scoring needs judgement, so if the LLM
is unavailable a pass simply produces nothing (logged), rather than guessing.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from agents.constants.research import interest_level
from agents.lib import guardrails
from agents.lib.config import settings
from agents.lib.llm import brain
from agents.lib.store import ConversationStore, GroupMemberStore, LeadStore
from agents.prompts.research import (render_inbound_prompt,
                                     render_outbound_prompt)
from agents.schemas.research import ResearchResult, ResearchRunResult, ScoredLead
from agents.schemas.talk import LeadRecord

logger = logging.getLogger(__name__)

AGENT_TYPE = "research"


def _score_inbound(niche: str, convos) -> list[ScoredLead]:
    """DECIDE (inbound): one structured call. Raises on any LLM/transport error."""
    result: ResearchResult = brain(ResearchResult).invoke(
        render_inbound_prompt(niche, convos)
    )
    return result.inbound_leads


def _score_outbound(niche: str, members) -> list[ScoredLead]:
    """DECIDE (outbound): one structured call. Raises on any LLM/transport error."""
    result: ResearchResult = brain(ResearchResult).invoke(
        render_outbound_prompt(niche, members)
    )
    return result.outbound_prospects


def run_research(
    brand_id: str = "default",
    *,
    niche: str = "",
    use_llm: bool | None = None,
) -> ResearchRunResult:
    """Run the Research agent once for ``brand_id``.

    Safe to call manually or from the Leader: the ``is_running`` guard makes a
    concurrent second call a no-op.
    """
    use_llm = settings.research_use_llm if use_llm is None else use_llm
    prospect_min = settings.research_prospect_min

    empty = ResearchRunResult(brand_id=brand_id)

    # ── Guard: never double-run ──────────────────────────────────────────────
    if guardrails.is_running(brand_id, AGENT_TYPE):
        logger.info("Research already running for brand=%s; skipping.", brand_id)
        return empty

    guardrails.set_state(brand_id, AGENT_TYPE, "running", current_task="research")
    try:
        # ── 1. READ ──────────────────────────────────────────────────────────
        convos = ConversationStore().for_brand(brand_id)
        members_all = GroupMemberStore().for_brand(brand_id)

        # Pre-filter the outbound pool (deterministic): must have a username, must
        # not already be a lead. Dedup against existing leads before spending tokens.
        existing = LeadStore().user_ids(brand_id)
        seen: set[str] = set()
        members: list = []
        for m in members_all:
            if not m.username or m.user_id in existing or m.user_id in seen:
                continue
            seen.add(m.user_id)
            members.append(m)

        if not convos and not members:
            logger.info("Research has no data for brand=%s; skipping.", brand_id)
            guardrails.record_activity(
                brand_id, AGENT_TYPE, "research_skipped", {"reason": "no_data"}
            )
            empty.skipped_no_data = True
            return empty

        # ── 2. DECIDE (up to two passes, each degrades to empty on error) ─────
        used_llm = False
        inbound: list[ScoredLead] = []
        outbound: list[ScoredLead] = []
        if use_llm:
            if convos:
                try:
                    inbound = _score_inbound(niche, convos)
                    used_llm = True
                except Exception as exc:
                    logger.warning("Research inbound pass unavailable: %s", exc)
            if members:
                try:
                    outbound = _score_outbound(niche, members)
                    used_llm = True
                except Exception as exc:
                    logger.warning("Research outbound pass unavailable: %s", exc)

        # ── 3. EXECUTE: threshold filter + build leads + idempotent upsert ────
        now = datetime.now(timezone.utc).isoformat()
        store = LeadStore()
        convo_groups = {c.user_id: c for c in convos}
        member_groups = {m.user_id: m for m in members}

        inbound_saved = outbound_saved = duplicates = 0

        # Inbound leads: anyone scored cool+ (>= 40) is a real inbound lead.
        for sl in inbound:
            if sl.score < 40:
                continue
            src = convo_groups.get(sl.user_id)
            rec = LeadRecord(
                brand_id=brand_id,
                user_id=sl.user_id,
                username=src.username if src else "",
                score=sl.score,
                interest_level=interest_level(sl.score),  # type: ignore[arg-type]
                status="new",
                source="inbound",
                note=(src.text[:280] if src else ""),
                pain_points=sl.pain_points,
                recommended_approach=sl.recommended_approach,
                source_group_chat_id=src.group_chat_id if src else "",
                created_at=now,
            )
            if store.upsert(rec):
                inbound_saved += 1
            else:
                duplicates += 1

        # Outbound prospects: only save at or above the prospect threshold.
        for sl in outbound:
            if sl.score < prospect_min:
                continue
            src = member_groups.get(sl.user_id)
            rec = LeadRecord(
                brand_id=brand_id,
                user_id=sl.user_id,
                username=src.username if src else "",
                score=sl.score,
                interest_level=interest_level(sl.score),  # type: ignore[arg-type]
                status="prospect",
                source="outbound",
                note=(src.bio[:280] if src else ""),
                pain_points=sl.pain_points,
                recommended_approach=sl.recommended_approach,
                source_group_chat_id=src.group_chat_id if src else "",
                created_at=now,
            )
            if store.upsert(rec):
                outbound_saved += 1
            else:
                duplicates += 1

        guardrails.record_activity(
            brand_id,
            AGENT_TYPE,
            "research_completed",
            {
                "conversations": len(convos),
                "members_considered": len(members),
                "inbound_saved": inbound_saved,
                "outbound_saved": outbound_saved,
                "duplicates": duplicates,
                "used_llm": used_llm,
            },
        )

        return ResearchRunResult(
            brand_id=brand_id,
            used_llm=used_llm,
            conversations_read=len(convos),
            members_considered=len(members),
            inbound_saved=inbound_saved,
            outbound_saved=outbound_saved,
            duplicates=duplicates,
        )
    finally:
        guardrails.set_state(brand_id, AGENT_TYPE, "idle")
