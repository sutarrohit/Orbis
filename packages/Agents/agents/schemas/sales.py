"""
agents/schemas/sales.py
────────────────────────
Pydantic v2 models for the Sales agent (message-triggered handler).

Sales is the sibling of Talk (Implentation.md §3, §7.4): the separate gateway
service calls :func:`agents.sales.decide_reply` **once per inbound DM from a
known lead**. Unlike Talk it almost always engages — it runs the sales motion
(understand → present product/pricing → handle objections → guide to the
conversion action) and writes the outcome back to the lead.

Four kinds of model live here:

1. **Knowledge base** — :class:`BrandProfile`: persona + product + pricing the
   model is allowed to speak from (the §7.4 "knowledge base").
2. **Input** — :class:`SalesContext`: everything the gateway hands the handler
   for one DM (Sales never reads the platform directly).
3. **Decision schema** — :class:`SalesDecision`: the *only* thing the LLM
   returns. Field descriptions are effectively part of the prompt.
4. **Return** — :class:`SalesReply`: the decision plus what deterministic code
   actually did (sent? lead updated?).

Leads are the shared :class:`agents.schemas.talk.LeadRecord`; Sales *updates*
them (status/note) via ``LeadStore.update``.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

SalesStage = Literal["qualify", "present", "objection", "close"]
# Statuses Sales may move a lead to (subset of LeadStatus it owns the transition for).
SalesStatus = Literal["nurturing", "converted", "lost", "cold"]


# ─────────────────────────────────────────────────────────────────────────────
# Knowledge base (what the model may speak from)
# ─────────────────────────────────────────────────────────────────────────────


class BrandProfile(BaseModel):
    """The sales brain's knowledge for one brand (the §7.4 knowledge base).

    Everything the model is allowed to claim must come from here — it must never
    invent pricing, features, or guarantees.
    """

    brand_id: str = Field(default="default")
    persona: str = Field(
        default="",
        description="The voice/style the account speaks in (tone, do's and don'ts).",
    )
    product_summary: str = Field(
        default="", description="What the product is and the value it delivers."
    )
    pricing: str = Field(
        default="",
        description="The pricing facts the model may quote. If empty, never state a price.",
    )
    conversion_action: str = Field(
        default="",
        description="The single next step to guide the lead to (e.g. 'book a demo call').",
    )
    objection_notes: str = Field(
        default="", description="Pre-approved answers to common objections."
    )
    website: str = Field(
        default="",
        description="Brand website/landing page; share in DMs only when relevant.",
    )
    about: str = Field(
        default="",
        description="Free-text about/knowledge base; the model may speak from this.",
    )


# ─────────────────────────────────────────────────────────────────────────────
# Input (what the gateway hands the handler per DM)
# ─────────────────────────────────────────────────────────────────────────────


class DmMessage(BaseModel):
    """One prior message in the DM thread, for conversation context."""

    from_lead: bool = Field(
        description="True if the lead sent it, False if it was our account."
    )
    text: str = Field(description="The message body.")


class SalesContext(BaseModel):
    """Everything the gateway supplies for a single inbound DM from a lead."""

    brand_id: str = Field(default="default")
    account_id: str = Field(
        description="The account that would send the reply (rate limiting / health)."
    )
    lead_user_id: str = Field(description="The lead's stable user id (the lead key).")
    username: str = Field(default="", description="The lead's '@handle', if any.")

    message_text: str = Field(description="The inbound DM to respond to.")
    history: list[DmMessage] = Field(
        default_factory=list,
        description="Prior DM thread, oldest first, for continuity.",
    )

    lead_status: str = Field(
        default="new", description="The lead's current status in the funnel."
    )
    stage: SalesStage = Field(
        default="qualify", description="Where the conversation currently is."
    )
    profile: BrandProfile | None = Field(
        default=None,
        description="Override the stored BrandProfile for this call; falls back to "
        "the ProfileStore when omitted.",
    )


# ─────────────────────────────────────────────────────────────────────────────
# Decision schema (what the LLM returns)
# ─────────────────────────────────────────────────────────────────────────────


class SalesDecision(BaseModel):
    """How to respond to one inbound DM and where the lead now stands.

    Move the lead one step along the motion. Speak only from the provided brand
    profile — never invent pricing, features, or guarantees. If pricing is not in
    the profile, do not state a price.
    """

    message: str = Field(
        description="The DM reply to send. Sound human: address what they said, one "
        "value point, one soft next step toward the conversion action. 2-5 sentences, "
        "under 120 words, plain text, no emojis, no hype or fake urgency, at most one "
        "question. Empty only if no reply is warranted.",
    )
    stage: SalesStage = Field(
        description="The stage this reply moves the conversation to.",
    )
    new_status: SalesStatus | None = Field(
        default=None,
        description="Update the lead's status: 'converted' ONLY on a clear conversion, "
        "'lost' on a clear no/unsubscribe, otherwise 'nurturing'. Null to leave as-is.",
    )
    objection: str = Field(
        default="", description="The objection being handled, if any."
    )
    note: str = Field(
        default="",
        description="One-line outcome summary recorded on the lead for the dashboard.",
    )


# ─────────────────────────────────────────────────────────────────────────────
# Handler return (decision + what code actually did)
# ─────────────────────────────────────────────────────────────────────────────


class SalesReply(BaseModel):
    """What the Sales handler returns to the gateway for one DM.

    The gateway delivers ``decision.message`` if ``sent`` is True. ``sent``
    reflects deterministic gating (rate limit, account health, dedup) which may
    override a wanted reply.
    """

    decision: SalesDecision
    sent: bool = Field(
        default=False,
        description="True if a reply is permitted to be sent (LLM produced one AND "
        "guardrails allowed it).",
    )
    suppressed_reason: str = Field(
        default="",
        description="Why a wanted reply was suppressed: 'rate_limited', "
        "'account_inactive', 'duplicate', or '' if not suppressed.",
    )
    lead_updated: bool = Field(
        default=False, description="True if the lead's status/note was written back."
    )
    used_llm: bool = Field(
        default=False, description="False when the LLM was skipped/failed (no-op)."
    )
