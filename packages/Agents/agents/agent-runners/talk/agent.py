"""
agents/talk/agent.py — Talk agent (message-triggered handler)
─────────────────────────────────────────────────────────────
The separate gateway service calls :func:`decide_reply` **once per inbound
group message** and gets back a :class:`TalkDecision`. Talk is NOT spawned and
NOT triggered by the Leader (Implentation.md §3, §7.3).

The three steps (the core principle — LLM judges, code executes):
  1. READ    — the gateway hands us a ``TalkContext`` (Talk never reads Telegram).
  2. DECIDE  — one LLM call returns a typed ``ReplyDecision`` (reply? lead?).
  3. EXECUTE — plain code gates the reply against deterministic guardrails
               (per-account daily reply cap §11, account health), upserts a
               ``LeadRecord`` when flagged, and records activity.

Default is **silence**: on any LLM error the DECIDE step degrades to a silent,
non-lead decision so a flaky model can never cause the account to post.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from agents.constants.talk import (ACTION_DECIDED, ACTION_REPLIED,
                                    MAX_GROUP_REPLIES_PER_DAY, interest_level)
from agents.lib import guardrails
from agents.lib.llm import brain
from agents.lib.store import LeadStore
from agents.prompts.talk import render_talk_prompt
from agents.schemas.talk import (LeadRecord, ReplyDecision, TalkContext,
                                 TalkDecision)

logger = logging.getLogger(__name__)

AGENT_TYPE = "talk"


def _decide_with_llm(ctx: TalkContext) -> ReplyDecision:
    """DECIDE step: one structured LLM call. Raises on any LLM/transport error."""
    return brain(ReplyDecision).invoke(render_talk_prompt(ctx))


def _save_lead(ctx: TalkContext, decision: ReplyDecision, now: str) -> bool:
    """Upsert a LeadRecord for a flagged sender. Returns True if newly inserted."""
    score = decision.lead_score if decision.lead_score is not None else 0
    band = interest_level(score)
    if band == "skip":
        return False
    note = (decision.message or ctx.message_text)[:280]
    record = LeadRecord(
        brand_id=ctx.brand_id,
        user_id=ctx.sender_user_id,
        username=ctx.sender_username,
        score=score,
        interest_level=band,  # type: ignore[arg-type]
        status="new",
        source="talk",
        note=note,
        source_group_chat_id=ctx.group_chat_id,
        created_at=now,
    )
    return LeadStore().upsert(record)


def decide_reply(ctx: TalkContext, *, account_active: bool = True) -> TalkDecision:
    """Judge one inbound group message and return a :class:`TalkDecision`.

    Pure per-message handler — safe to call directly from the gateway. ``ctx``
    is everything the gateway knows about the message. ``account_active`` lets
    the gateway pass the account's health so code can gate replies on it (§11).
    """
    now = datetime.now(timezone.utc).isoformat()

    # ── 2. DECIDE: structured LLM call, degrade to silence on any error ───────
    used_llm = False
    try:
        decision = _decide_with_llm(ctx)
        used_llm = True
    except Exception as exc:
        logger.warning("Talk LLM unavailable; staying silent: %s", exc)
        decision = ReplyDecision(should_reply=False)

    # ── 3. EXECUTE: deterministic gating + persistence ───────────────────────
    replied = bool(decision.should_reply and decision.message.strip())
    suppressed_reason = ""

    if replied and not account_active:
        replied, suppressed_reason = False, "account_inactive"

    if replied:
        sent_today = guardrails.count_actions_today(
            ctx.brand_id, AGENT_TYPE, ACTION_REPLIED, account_id=ctx.account_id
        )
        if sent_today >= MAX_GROUP_REPLIES_PER_DAY:
            replied, suppressed_reason = False, "rate_limited"

    lead_saved = False
    if decision.flag_as_lead:
        lead_saved = _save_lead(ctx, decision, now)

    if replied:
        guardrails.record_activity(
            ctx.brand_id,
            AGENT_TYPE,
            ACTION_REPLIED,
            {"account_id": ctx.account_id, "group_chat_id": ctx.group_chat_id},
        )

    guardrails.record_activity(
        ctx.brand_id,
        AGENT_TYPE,
        ACTION_DECIDED,
        {
            "account_id": ctx.account_id,
            "group_chat_id": ctx.group_chat_id,
            "should_reply": decision.should_reply,
            "replied": replied,
            "suppressed_reason": suppressed_reason,
            "flag_as_lead": decision.flag_as_lead,
            "lead_score": decision.lead_score,
            "lead_saved": lead_saved,
            "used_llm": used_llm,
        },
    )

    return TalkDecision(
        reply=decision,
        replied=replied,
        suppressed_reason=suppressed_reason,
        lead_saved=lead_saved,
        used_llm=used_llm,
    )
