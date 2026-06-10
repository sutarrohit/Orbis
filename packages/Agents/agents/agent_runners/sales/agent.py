"""
agents/sales/agent.py — Sales agent (message-triggered handler)
───────────────────────────────────────────────────────────────
The sibling of Talk (Implentation.md §3, §7.4): the separate gateway service
calls :func:`decide_reply` **once per inbound DM from a known lead**. Sales is
NOT spawned and NOT triggered by the Leader. Unlike Talk it almost always
engages — it runs the sales motion and writes the outcome back to the lead.

The three steps (LLM judges, code executes):
  1. READ    — the gateway hands us a ``SalesContext``; we load the BrandProfile
               (knowledge base) and the lead's current record.
  2. DECIDE  — one LLM call returns a typed ``SalesDecision`` (reply + outcome).
  3. EXECUTE — deterministic gating (account health, per-account daily DM cap,
               dedup on the inbound message), then write the lead status/note
               back via ``LeadStore.update`` and record activity.

On any LLM error the DECIDE step degrades to a **safe no-op** (no message, no
status change) — a flaky model must never send garbage to a paying lead.
"""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone

from agents.constants.defaults import default_system_prompt
from agents.constants.sales import ACTION_DECIDED, ACTION_SENT
from agents.lib import guardrails
from agents.lib.config import settings
from agents.lib.db import system_prompt_for
from agents.lib.llm import brain
from agents.lib.store import LeadStore, ProfileStore
from agents.prompts.sales import render_sales_prompt
from agents.schemas.sales import BrandProfile, SalesContext, SalesDecision, SalesReply

logger = logging.getLogger(__name__)

AGENT_TYPE = "sales"


def _resolve_profile(ctx: SalesContext) -> BrandProfile:
    """Context override wins; else load from the store; else an empty profile."""
    if ctx.profile is not None:
        return ctx.profile
    stored = ProfileStore().get(ctx.brand_id)
    return stored or BrandProfile(brand_id=ctx.brand_id)


def _dedup_key(ctx: SalesContext) -> str:
    """Stable key for one inbound DM, so a retry is answered at most once."""
    raw = f"{ctx.account_id}|{ctx.lead_user_id}|{ctx.message_text}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def _decide_with_llm(ctx: SalesContext, profile: BrandProfile) -> SalesDecision:
    """DECIDE step: one structured LLM call. Raises on any LLM/transport error."""
    guidance = system_prompt_for(ctx.brand_id, "sales") or default_system_prompt("sales")
    return brain(SalesDecision).invoke(render_sales_prompt(ctx, profile, guidance=guidance))


def decide_reply(ctx: SalesContext, *, account_active: bool = True) -> SalesReply:
    """Respond to one inbound DM from a known lead and return a :class:`SalesReply`.

    Pure per-message handler — safe to call directly from the gateway.
    ``account_active`` lets the gateway pass the account's health so code can gate
    sending on it (§11).
    """
    now = datetime.now(timezone.utc).isoformat()
    profile = _resolve_profile(ctx)
    use_llm = settings.sales_use_llm

    # ── 2. DECIDE: structured LLM call, degrade to a safe no-op on any error ──
    used_llm = False
    if use_llm:
        try:
            decision = _decide_with_llm(ctx, profile)
            used_llm = True
        except Exception as exc:
            logger.warning("Sales LLM unavailable; no-op: %s", exc)
            decision = SalesDecision(message="", stage=ctx.stage)
    else:
        decision = SalesDecision(message="", stage=ctx.stage)

    # ── 3. EXECUTE: deterministic gating ─────────────────────────────────────
    sent = bool(decision.message.strip())
    suppressed_reason = ""
    dedup = _dedup_key(ctx)

    if sent and not account_active:
        sent, suppressed_reason = False, "account_inactive"

    if sent and guardrails.seen_dedup_key(ctx.brand_id, AGENT_TYPE, ACTION_SENT, dedup):
        sent, suppressed_reason = False, "duplicate"

    if sent:
        sent_today = guardrails.count_actions_today(
            ctx.brand_id, AGENT_TYPE, ACTION_SENT, account_id=ctx.account_id
        )
        if sent_today >= settings.max_sales_dms_per_day:
            sent, suppressed_reason = False, "rate_limited"

    # Write the outcome bqack to the lead (status/note) regardless of send gating —
    # the judgement about where the lead now stands still holds.
    lead_updated = False
    if decision.new_status is not None or decision.note:
        changes: dict = {}
        if decision.new_status is not None:
            changes["status"] = decision.new_status
        if decision.note:
            changes["note"] = decision.note
        if sent:
            changes["last_outreach_at"] = now
        updated = LeadStore().update(ctx.brand_id, ctx.lead_user_id, **changes)
        lead_updated = updated is not None

    if sent:
        guardrails.record_activity(
            ctx.brand_id,
            AGENT_TYPE,
            ACTION_SENT,
            {"account_id": ctx.account_id, "lead_user_id": ctx.lead_user_id, "dedup": dedup},
        )

    guardrails.record_activity(
        ctx.brand_id,
        AGENT_TYPE,
        ACTION_DECIDED,
        {
            "account_id": ctx.account_id,
            "lead_user_id": ctx.lead_user_id,
            "stage": decision.stage,
            "new_status": decision.new_status,
            "sent": sent,
            "suppressed_reason": suppressed_reason,
            "lead_updated": lead_updated,
            "used_llm": used_llm,
        },
    )

    return SalesReply(
        decision=decision,
        sent=sent,
        suppressed_reason=suppressed_reason,
        lead_updated=lead_updated,
        used_llm=used_llm,
    )
