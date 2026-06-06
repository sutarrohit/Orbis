"""
agents/schemas/outreach.py
───────────────────────────
Pydantic v2 models for the outbound state machine (Implentation.md §9).

The state machine is **deterministic code** — the LLM only writes the DM *copy*.
So the only decision schema here is :class:`OutreachDraft` (the generated DM).
:class:`OutboundRunResult` is the pipeline's summary return value.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class OutreachDraft(BaseModel):
    """One outbound DM the LLM writes (the only thing it returns).

    Code decides *whether* and *to whom* to send; this is just the wording.
    """

    message: str = Field(
        description="The DM body to send. Sound human: open with context, give one "
        "value point, end with one soft next step. 2-5 sentences, under 120 words, "
        "plain text, no emojis, no hype/guarantees/fake urgency, at most one question. "
        "Reference the lead's message or bio. Never invent pricing, features, or "
        "claims that are not in the brand profile.",
    )


class OutboundRunResult(BaseModel):
    """Summary of one outbound-pipeline run."""

    brand_id: str
    used_llm: bool = False
    active_accounts: int = 0
    first_dms_queued: int = Field(default=0, description="New prospects DM'd.")
    followups_queued: int = Field(default=0, description="Follow-up DMs queued.")
    marked_cold: int = Field(default=0, description="Leads given up on (stage 3 + 48h).")
    skipped_dedup: int = Field(default=0, description="Already DM'd; skipped.")
    skipped_no_account: int = Field(
        default=0, description="No eligible account (all rate-limited)."
    )
    skipped_bad_copy: int = Field(
        default=0, description="Draft failed the copy standard twice; not sent."
    )
