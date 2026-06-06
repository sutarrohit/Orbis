"""
agents/agent_runners/outreach/agent.py — the outbound state machine (§9)
─────────────────────────────────────────────────────────────────────────
Pure deterministic code that turns leads into queued outreach DMs
(Implentation.md §9). Run each Leader cycle (and by the follow-up sweep, §10).
The LLM only writes the *copy*; code drives every transition and guardrail.

The funnel (contact progress is tracked by ``outreachStage``; the status stays
``prospect`` through the sequence — the schema has no separate "contacted" status
— and only changes to ``cold`` when we give up; a reply moves it to ``nurturing``
via Sales, and ``converted``/``lost`` are terminal):

    prospect, stage 0 (score ≥ AUTO_DM_MIN)
       └─ dedup ok ─ write first DM ─ queue ─ stage=1
    prospect, stage 1 + 48h no reply ─ follow-up #1    ─ queue ─ stage=2
    prospect, stage 2 + 48h no reply ─ final follow-up  ─ queue ─ stage=3
    prospect, stage 3 + 48h no reply ─ status=cold

Rules (Implentation.md §9, §11):
  - **Dedup gate** before every *first* DM: skip if the lead already has any
    queued/sent DM (one person is never DM'd twice / by two accounts).
  - **Account selection**: prefer the account assigned to the lead's source
    community; else the least-busy active account under the daily cap.
  - **Queue, don't send**: write to ``pending_send``; the gateway delivers it.
  - **Copy standard**: a generated DM that fails the standard is regenerated
    once, then skipped (we never queue bad copy).
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from agents.constants.outreach import (
    ACTION_COLD,
    ACTION_QUEUED,
    FOLLOWUP_HOURS,
    MAX_QUESTIONS,
    MAX_STAGE,
    MAX_WORDS,
)
from agents.lib import db, guardrails
from agents.lib.config import settings
from agents.lib.llm import brain
from agents.lib.store import PendingSendStore, ProfileStore, SocialAccountStore
from agents.prompts.outreach import render_outreach_prompt
from agents.schemas.outreach import OutboundRunResult, OutreachDraft

logger = logging.getLogger(__name__)

AGENT_TYPE = "leader"  # outreach runs in the Leader cycle (AgentType has no "outreach")

# Rough emoji range check for the plain-text copy standard.
_EMOJI_RE = re.compile(
    "[\U0001f000-\U0001faff\U00002600-\U000027bf\U0001f1e6-\U0001f1ff]"
)


@dataclass
class _OutLead:
    """A lead row the pipeline processes (carries the DB ``id`` and funnel state)."""

    id: str
    user_id: str
    username: str
    note: str
    pain_points: list[str]
    recommended_approach: str
    source_group_chat_id: str
    score: int
    outreach_stage: int


# ─────────────────────────────────────────────────────────────────────────────
# Lead reads / funnel transitions (direct SQL — needs the PK and outreachStage,
# which LeadRecord/LeadStore do not expose)
# ─────────────────────────────────────────────────────────────────────────────

_LEAD_COLS = (
    'id, "userId", username, note, "painPoints", "recommendedApproach", '
    '"sourceGroupChatId", score, "outreachStage"'
)


def _row_to_lead(r: tuple) -> _OutLead:
    return _OutLead(
        id=r[0],
        user_id=r[1],
        username=r[2],
        note=r[3],
        pain_points=r[4] or [],
        recommended_approach=r[5],
        source_group_chat_id=r[6],
        score=r[7],
        outreach_stage=r[8],
    )


def _due_prospects(bid: str, min_score: int) -> list[_OutLead]:
    """Never-contacted prospects above the auto-DM bar (status=prospect, stage 0)."""
    with db.cursor() as cur:
        cur.execute(
            f'SELECT {_LEAD_COLS} FROM lead '
            'WHERE "brandId" = %s AND status = %s::"LeadStatus" '
            'AND "outreachStage" = 0 AND score >= %s',
            (bid, "prospect", min_score),
        )
        return [_row_to_lead(r) for r in cur.fetchall()]


def _due_followups(bid: str) -> list[_OutLead]:
    """Contacted prospects (stage ≥ 1) silent for 48h — due a follow-up or cold."""
    with db.cursor() as cur:
        cur.execute(
            f'SELECT {_LEAD_COLS} FROM lead '
            'WHERE "brandId" = %s AND status = %s::"LeadStatus" '
            'AND "outreachStage" >= 1 AND "lastOutreachAt" IS NOT NULL '
            "AND \"lastOutreachAt\" <= now() - make_interval(hours => %s)",
            (bid, "prospect", FOLLOWUP_HOURS),
        )
        return [_row_to_lead(r) for r in cur.fetchall()]


def _advance_stage(bid: str, lead_id: str, stage: int) -> None:
    """Record a sent DM: bump the outreach stage + lastOutreachAt (status stays
    ``prospect``)."""
    with db.cursor() as cur:
        cur.execute(
            'UPDATE lead SET "outreachStage" = %s, "lastOutreachAt" = now(), '
            '"updatedAt" = now() WHERE "brandId" = %s AND id = %s',
            (stage, bid, lead_id),
        )


def _mark_cold(bid: str, lead_id: str) -> None:
    with db.cursor() as cur:
        cur.execute(
            'UPDATE lead SET status = %s::"LeadStatus", "updatedAt" = now() '
            'WHERE "brandId" = %s AND id = %s',
            ("cold", bid, lead_id),
        )


def _assigned_account(bid: str, group_chat_id: str) -> str | None:
    """The account assigned to the lead's source community, if any."""
    if not group_chat_id:
        return None
    with db.cursor() as cur:
        cur.execute(
            'SELECT "assignedAccountId" FROM community '
            'WHERE "brandId" = %s AND "groupChatId" = %s '
            'AND "assignedAccountId" IS NOT NULL LIMIT 1',
            (bid, group_chat_id),
        )
        row = cur.fetchone()
    return row[0] if row else None


# ─────────────────────────────────────────────────────────────────────────────
# Account selection + copy generation
# ─────────────────────────────────────────────────────────────────────────────


def _pick_account(
    preferred_id: str | None,
    accounts: list[tuple[str, str]],
    counts: dict[str, int],
    cap: int,
) -> str | None:
    """Prefer the assigned account; else the least-busy active account under the
    daily cap. Returns an account id, or None if all are at the cap."""
    eligible = [aid for (aid, _ext) in accounts if counts.get(aid, 0) < cap]
    if not eligible:
        return None
    if preferred_id in eligible:
        return preferred_id
    return min(eligible, key=lambda aid: counts.get(aid, 0))


def _passes_copy_standard(text: str) -> bool:
    """Deterministic gate on a generated DM (Implentation.md §9 copy standard)."""
    if not text:
        return False
    if len(text.split()) > MAX_WORDS:
        return False
    if text.count("?") > MAX_QUESTIONS:
        return False
    if _EMOJI_RE.search(text):
        return False
    return True


def _generate_dm(lead: _OutLead, profile, *, is_followup: bool, use_llm: bool) -> str | None:
    """Generate one DM; regenerate once if it fails the copy standard. None on
    failure (LLM down or copy still bad) — we never queue bad/empty copy."""
    if not use_llm:
        return None
    prompt = render_outreach_prompt(
        username=lead.username,
        note=lead.note,
        pain_points=lead.pain_points,
        recommended_approach=lead.recommended_approach,
        profile=profile,
        is_followup=is_followup,
    )
    for _ in range(2):
        try:
            draft = brain(OutreachDraft).invoke(prompt)
        except Exception as exc:
            logger.warning("Outbound DM generation unavailable: %s", exc)
            return None
        msg = (draft.message or "").strip()
        if _passes_copy_standard(msg):
            return msg
    logger.info("Draft failed the copy standard twice for %s; skipping.", lead.username)
    return None


# ─────────────────────────────────────────────────────────────────────────────
# The pipeline
# ─────────────────────────────────────────────────────────────────────────────


def run_outbound_pipeline(
    brand_id: str = "default", *, use_llm: bool | None = None
) -> OutboundRunResult:
    """Run one pass of the outbound state machine for ``brand_id``.

    Deterministic and idempotent: queueing is guarded by ``(brandId, dedupKey)``
    and the per-lead dedup gate, so re-running never double-sends. Safe to call
    from the Leader's execute node or manually.
    """
    use_llm = True if use_llm is None else use_llm
    result = OutboundRunResult(brand_id=brand_id)
    bid = db.resolve_brand_id(brand_id)

    accounts = SocialAccountStore().active_for_brand(brand_id)
    result.active_accounts = len(accounts)
    if not accounts:
        logger.info("Outbound: no active accounts for brand=%s; nothing to send.", brand_id)
        return result

    profile = ProfileStore().get(brand_id)
    pending = PendingSendStore()
    cap = settings.max_dms_per_day
    counts = pending.count_today_by_account(brand_id)
    min_score = settings.research_autodm_min

    def _queue(lead: _OutLead, stage: int, is_followup: bool) -> bool:
        """Pick an account, generate copy, queue + advance. Updates ``result``."""
        preferred = _assigned_account(bid, lead.source_group_chat_id)
        account_id = _pick_account(preferred, accounts, counts, cap)
        if account_id is None:
            result.skipped_no_account += 1
            return False
        msg = _generate_dm(lead, profile, is_followup=is_followup, use_llm=use_llm)
        if msg is None:
            result.skipped_bad_copy += 1
            return False
        result.used_llm = True
        dedup = f"{lead.id}:{stage}"
        if not pending.queue(bid, lead.id, account_id, msg, stage, dedup):
            return False  # already queued (idempotent re-run)
        _advance_stage(bid, lead.id, stage)
        counts[account_id] = counts.get(account_id, 0) + 1
        guardrails.record_activity(
            brand_id,
            AGENT_TYPE,
            ACTION_QUEUED,
            {"account_id": account_id, "lead": lead.user_id, "stage": stage, "dedup": dedup},
        )
        return True

    # 1) First contact — new prospects above the auto-DM bar.
    for lead in _due_prospects(bid, min_score):
        if pending.already_queued_for_lead(bid, lead.id):
            result.skipped_dedup += 1
            continue
        if _queue(lead, stage=1, is_followup=False):
            result.first_dms_queued += 1

    # 2) Follow-ups (stages 1-2) and cold (stage 3) for silent contacted leads.
    for lead in _due_followups(bid):
        if lead.outreach_stage >= MAX_STAGE:
            _mark_cold(bid, lead.id)
            result.marked_cold += 1
            guardrails.record_activity(
                brand_id, AGENT_TYPE, ACTION_COLD, {"lead": lead.user_id}
            )
            continue
        if _queue(lead, stage=lead.outreach_stage + 1, is_followup=True):
            result.followups_queued += 1

    logger.info(
        "Outbound brand=%s: first=%d followups=%d cold=%d dedup=%d no_account=%d bad_copy=%d",
        bid,
        result.first_dms_queued,
        result.followups_queued,
        result.marked_cold,
        result.skipped_dedup,
        result.skipped_no_account,
        result.skipped_bad_copy,
    )
    return result
