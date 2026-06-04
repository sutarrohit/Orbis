"""
agents/schemas/research.py
───────────────────────────
Pydantic v2 models for the Research agent (spawnable worker).

Research scores people into leads (Implentation.md §7.2). Like every worker it
makes one (here: up to two) structured LLM call(s) and the rest is deterministic
code. Three kinds of model live here:

1. **Input records** — the shapes Research READS from the bus (the gateway
   populates them): :class:`ConversationRecord`, :class:`GroupMemberRecord`.
2. **Decision schemas** — the *only* thing the LLM returns: :class:`ScoredLead`
   and :class:`ResearchResult`. Field descriptions are part of the prompt.
3. **Run result** — :class:`ResearchRunResult`, the worker's return/response.

Leads themselves are persisted as the shared :class:`agents.schemas.talk.LeadRecord`
(one lead bus for Talk and Research, Implentation.md §5.3).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

InterestLevel = Literal["hot", "warm", "cool", "skip"]


class ResearchRunRequest(BaseModel):
    """Body for triggering the Research agent."""

    brand_id: str = Field(
        default="default", description="Which brand to score people for."
    )
    niche: str = Field(
        default="", description="The brand's niche, used for relevance judgement."
    )
    use_llm: bool | None = Field(default=None, description="Override RESEARCH_USE_LLM.")


# ─────────────────────────────────────────────────────────────────────────────
# Research — input records (what the gateway writes; Research reads)
# ─────────────────────────────────────────────────────────────────────────────


class ConversationRecord(BaseModel):
    """A recent inbound interaction the gateway captured (the inbound bus).

    Dedup key ``(brand_id, user_id, group_chat_id, ts)`` — but Research only
    reads these, so the key matters to the writer, not here.
    """

    brand_id: str
    user_id: str = Field(description="The person who spoke.")
    username: str = Field(default="", description="Their '@handle', if any.")
    group_chat_id: str = Field(default="", description="Where it happened.")
    text: str = Field(description="What they said.")
    ts: str = Field(default="", description="UTC ISO-8601 timestamp.")


class GroupMemberRecord(BaseModel):
    """A scraped member of a joined group (the outbound-prospect pool).

    Written by the gateway after it joins a community and scrapes members
    (dedup key ``(brand_id, user_id, group_chat_id)``, Implentation.md §5.3).
    """

    brand_id: str
    user_id: str
    username: str = Field(default="", description="Their '@handle' (no username → skip).")
    group_chat_id: str = Field(default="", description="The group they were scraped from.")
    bio: str = Field(default="", description="Profile bio, for relevance scoring.")
    activity_note: str = Field(
        default="", description="Any signal on how active/recent they are."
    )


# ─────────────────────────────────────────────────────────────────────────────
# Research — decision schemas (what the LLM returns)
# ─────────────────────────────────────────────────────────────────────────────


class ScoredLead(BaseModel):
    """One person scored for the brand's niche."""

    user_id: str = Field(
        description="The exact user_id from the input — copy it verbatim, do not invent."
    )
    score: int = Field(
        ge=0,
        le=100,
        description="Fit/interest 0 (irrelevant) to 100 (perfect). Bands: 80-100 hot, "
        "60-79 warm, 40-59 cool, below 40 skip.",
    )
    interest_level: InterestLevel = Field(
        description="The band for `score`: hot, warm, cool, or skip."
    )
    pain_points: list[str] = Field(
        default_factory=list,
        description="Specific needs or frustrations this person expressed or implied.",
    )
    recommended_approach: str = Field(
        default="",
        description="One sentence on how to open with them, grounded in their "
        "message/bio. No pricing or invented claims.",
    )


class ResearchResult(BaseModel):
    """Everyone Research scored this run, split by pass.

    Only include people present in the supplied inputs. Use the exact `user_id`
    from each input. People who are clearly irrelevant should be scored `skip`
    (below 40) rather than omitted, so the decision is explicit.
    """

    inbound_leads: list[ScoredLead] = Field(default_factory=list)
    outbound_prospects: list[ScoredLead] = Field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────────────
# Research — run result (worker return / API response)
# ─────────────────────────────────────────────────────────────────────────────


class ResearchRunResult(BaseModel):
    """Summary of one Research agent run."""

    brand_id: str
    used_llm: bool = False
    conversations_read: int = 0
    members_considered: int = Field(
        default=0,
        description="Group members left after the deterministic pre-filter.",
    )
    inbound_saved: int = Field(default=0, description="New inbound leads written.")
    outbound_saved: int = Field(default=0, description="New outbound prospects written.")
    duplicates: int = Field(
        default=0, description="Scored people already in the lead store (skipped)."
    )
    skipped_no_data: bool = Field(
        default=False, description="True when there was nothing to score."
    )
