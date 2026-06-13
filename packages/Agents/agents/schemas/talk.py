"""
agents/schemas/talk.py
───────────────────────
Pydantic v2 models for the Talk agent (message-triggered handler).

Talk does not "run" and is not spawned by the Leader. The separate gateway
service calls :func:`agents.talk.decide_reply` **once per inbound group
message**, passing a :class:`TalkContext`, and gets back a :class:`TalkDecision`
(Implentation.md §3, §7.3).

Three kinds of model live here:

1. **Input** — :class:`TalkContext`: everything the gateway hands the handler
   for one message. Talk never reads the platform directly (the core principle).
2. **Decision schema** — :class:`ReplyDecision`: the *only* thing the LLM is
   allowed to return. With ``.with_structured_output(ReplyDecision)`` the class
   name, docstring, and field descriptions are effectively part of the prompt.
3. **Stored record / return** — :class:`LeadRecord` (persisted when Talk flags a
   lead) and :class:`TalkDecision` (what the handler returns to the gateway:
   the decision plus what deterministic code actually did).

``LeadRecord`` / ``LeadStore`` are shared with the future Research agent — both
write leads keyed by ``(brand_id, user_id)`` (Implentation.md §5.3).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# ─────────────────────────────────────────────────────────────────────────────
# Talk — input (what the gateway hands the handler per message)
# ─────────────────────────────────────────────────────────────────────────────


class GroupMessage(BaseModel):
    """One prior message in the group, supplied for short-term context."""

    sender_username: str = Field(
        default="", description="The '@handle' of whoever sent it (may be empty)."
    )
    text: str = Field(description="The message body.")


class TalkContext(BaseModel):
    """Everything the gateway supplies for a single inbound group message.

    Talk reacts to this; it never reads Telegram itself.
    """

    brand_id: str = Field(
        default="default", description="Which brand this account speaks for."
    )
    account_id: str = Field(
        description="The user account that would send any reply (for rate limiting "
        "and account-health gating)."
    )
    platform: str = Field(
        default="telegram",
        description="telegram | discord — carried through so a flagged lead is "
        "tagged with the right platform. Not used for any reply logic.",
    )
    group_chat_id: str = Field(description="The group the message arrived in.")

    message_text: str = Field(description="The inbound message to react to.")
    sender_user_id: str = Field(description="Stable user id of the message sender.")
    sender_username: str = Field(
        default="", description="The sender's '@handle', if any."
    )
    sender_bio: str = Field(
        default="", description="The sender's bio, if the gateway has it."
    )

    brand_niche: str = Field(
        default="", description="The brand's niche, for relevance judgement."
    )
    persona: str = Field(
        default="",
        description="Short description of the voice/persona the account speaks in.",
    )
    recent_messages: list[GroupMessage] = Field(
        default_factory=list,
        description="A few preceding group messages, oldest first, for context.",
    )


# ─────────────────────────────────────────────────────────────────────────────
# Talk — decision schema (what the LLM returns)
# ─────────────────────────────────────────────────────────────────────────────


class ReplyDecision(BaseModel):
    """Whether and how to react to one inbound group message.

    Default to **silence**. Most group chatter needs no reply — only engage when
    there is a genuine question, a clear pain point, or a natural opening that the
    brand can help with. Replying to everything reads as spam and gets accounts
    restricted.
    """

    should_reply: bool = Field(
        description="True ONLY for a real question / pain point / natural opening. "
        "For ordinary chatter, greetings, or off-topic talk, return False.",
    )
    message: str = Field(
        default="",
        description="If should_reply is True, the reply text — phrased to be sent as "
        "a private DM to the sender, NOT a public group blast. Sound human: one value "
        "point, one soft next step, 2-5 sentences, plain text, no emojis, no hype or "
        "fake urgency, at most one question. Empty when should_reply is False.",
    )
    flag_as_lead: bool = Field(
        default=False,
        description="True if the sender showed real interest or a relevant pain point "
        "worth following up with, even if you chose not to reply.",
    )
    lead_score: int | None = Field(
        default=None,
        ge=0,
        le=100,
        description="If flag_as_lead is True, how strong the lead is, 0 (weak) to 100 "
        "(hot). Bands: 80-100 hot, 60-79 warm, 40-59 cool. Null when not a lead.",
    )


# ─────────────────────────────────────────────────────────────────────────────
# Lead — stored record (shared with the future Research agent)
# ─────────────────────────────────────────────────────────────────────────────

LeadStatus = Literal["new", "prospect", "nurturing", "cold", "lost", "converted"]
LeadSource = Literal["talk", "inbound", "outbound"]
InterestLevel = Literal["hot", "warm", "cool", "skip"]


class LeadRecord(BaseModel):
    """A lead as persisted to the store (dedup key ``(brand_id, user_id)``)."""

    brand_id: str = Field(description="Which brand this lead belongs to.")
    platform: str = Field(default="telegram", description="telegram | discord.")
    user_id: str = Field(description="Stable platform user id (the dedup key).")
    username: str = Field(default="", description="The lead's '@handle', if any.")
    score: int = Field(default=0, ge=0, le=100)
    interest_level: InterestLevel = "cool"
    status: LeadStatus = "new"
    source: LeadSource = "talk"
    note: str = Field(
        default="", description="Why this person was flagged (context for outreach)."
    )
    pain_points: list[str] = Field(
        default_factory=list,
        description="Specific needs/frustrations surfaced (mainly set by Research).",
    )
    recommended_approach: str = Field(
        default="",
        description="How to open with this lead (mainly set by Research outbound).",
    )
    source_group_chat_id: str = Field(
        default="", description="The group the lead was first seen in."
    )
    created_at: str = Field(
        default="", description="UTC ISO-8601 timestamp of first discovery."
    )
    last_outreach_at: str = Field(
        default="",
        description="UTC ISO-8601 of the last DM we sent this lead (set by Sales; "
        "the §9 follow-up sweep reads it).",
    )


# ─────────────────────────────────────────────────────────────────────────────
# Talk — handler return (decision + what code actually did)
# ─────────────────────────────────────────────────────────────────────────────


class TalkDecision(BaseModel):
    """What the Talk handler returns to the gateway for one message.

    The gateway decides whether to actually deliver ``reply.message`` (as a DM);
    Talk only judges + records. ``replied`` reflects what deterministic code
    permitted after rate-limit / account-health gating, which may override the
    LLM's ``should_reply``.
    """

    reply: ReplyDecision
    replied: bool = Field(
        default=False,
        description="True if a reply is permitted to be sent (LLM said yes AND "
        "guardrails allowed it).",
    )
    suppressed_reason: str = Field(
        default="",
        description="Why a wanted reply was suppressed: 'rate_limited', "
        "'account_inactive', or '' if not suppressed.",
    )
    lead_saved: bool = Field(
        default=False, description="True if a LeadRecord was upserted this call."
    )
    used_llm: bool = Field(
        default=False, description="False when the LLM was skipped/failed (silent)."
    )
