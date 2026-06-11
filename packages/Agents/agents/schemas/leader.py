"""
agents/schemas/leader.py
─────────────────────────
Pydantic v2 models for the Leader (orchestrator, Implentation.md §8).

The Leader makes **one** structured judgment per cycle — :class:`LeaderPlan` —
and deterministic code (the execute node) applies it under hard rules. The LLM
never acts; it only returns this plan.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class GatewayAction(BaseModel):
    """Activate or pause one sending account."""

    account_id: str = Field(
        description="The account's external id, exactly as shown in the snapshot."
    )
    action: Literal["activate", "pause"]
    reason: str = Field(default="", description="One line on why.")


class LeadAction(BaseModel):
    """Move one lead to a new status."""

    user_id: str = Field(
        description="The lead's user_id, copied exactly from the snapshot."
    )
    new_status: Literal["nurturing", "cold", "lost", "converted"]
    note: str = Field(default="", description="One-line reason, recorded on the lead.")


class LeaderPlan(BaseModel):
    """The Leader's plan for this cycle.

    Follow the hard rules in the prompt. Prefer doing nothing over acting without
    a reason — spawning workers and changing statuses has real cost.
    """

    spawn_search: bool = Field(
        default=False,
        description="Spawn the Search worker to discover more communities.",
    )
    spawn_research: bool = Field(
        default=False,
        description="Spawn the Research worker to score people into leads.",
    )
    gateway_actions: list[GatewayAction] = Field(default_factory=list)
    lead_actions: list[LeadAction] = Field(default_factory=list)
    new_learnings: list[str] = Field(
        default_factory=list,
        description="New strategy insights worth remembering for future cycles.",
    )
    strategy_notes: str = Field(
        default="", description="Short reasoning for this cycle's plan."
    )


class LeaderCycleResult(BaseModel):
    """Summary of one Leader cycle — what the deterministic execute step did."""

    brand_id: str
    used_llm: bool = False
    spawned_search: bool = False
    search_skipped_pending: int = 0
    spawned_research: bool = False
    communities_assigned: int = 0
    gateway_actions_applied: int = 0
    lead_actions_applied: int = 0
    learnings_saved: int = 0
    outbound: dict | None = Field(
        default=None, description="The OutboundRunResult summary for this cycle."
    )
    strategy_notes: str = ""
