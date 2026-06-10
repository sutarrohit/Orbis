"""
agents/constants/defaults.py
─────────────────────────────
Generic, role-aware fallback config for each agent.

These apply at **runtime** when a brand has not set the matching
``agent_config`` field (the column is empty/unset), so an agent always has
sensible guidance even before an operator configures it from the dashboard. A
saved value always wins; the default only fills the gap.

"Generic" means no brand specifics — just defaults that fit each agent's job.
Today only fields an agent actually consumes take effect (the Leader's
``system_prompt``); ``persona_name`` / ``response_style`` and the non-Leader
agents are defined here so they are ready the moment those agents start reading
their config.
"""

from __future__ import annotations

AGENT_DEFAULTS: dict[str, dict[str, str]] = {
    "leader": {
        "persona_name": "Orchestrator",
        "response_style": "concise",
        "system_prompt": (
            "Run a steady, efficient lead-generation funnel for the brand. Keep "
            "enough relevant communities flowing in, turn their members into "
            "scored leads, and move qualified prospects toward outreach. Prefer "
            "doing nothing over acting without a clear reason — every worker "
            "spawned and every status change has real cost. Favor lead quality "
            "over raw volume, and keep the funnel balanced rather than over-"
            "investing in any one stage."
        ),
    },
    "search": {
        "persona_name": "Scout",
        "response_style": "concise",
        "system_prompt": (
            "Find active, on-topic communities worth joining for the brand's "
            "niche. Favor engaged, relevant groups over large inactive ones, and "
            "avoid spam, scams, and off-topic spaces."
        ),
    },
    "talk": {
        "persona_name": "Alex",
        "response_style": "friendly",
        "system_prompt": (
            "Engage naturally in community conversations. Be genuinely helpful "
            "and human, match the room's tone, and never spam links or hard-"
            "sell. Build familiarity and trust before any ask."
        ),
    },
    "research": {
        "persona_name": "Analyst",
        "response_style": "concise",
        "system_prompt": (
            "Identify community members who fit the brand's ideal customer. "
            "Score on genuine intent and fit — real signals of need, not vanity "
            "metrics — and note why each lead qualifies."
        ),
    },
    "sales": {
        "persona_name": "Sam",
        "response_style": "professional",
        "system_prompt": (
            "Run respectful one-to-one DM outreach and follow-ups. Lead with "
            "value, keep messages short and personal, and propose one clear soft "
            "next step. Never be pushy or spammy."
        ),
    },
}


def _field(agent_type: str, key: str) -> str:
    cfg = AGENT_DEFAULTS.get(agent_type)
    return cfg.get(key, "") if cfg else ""


def default_system_prompt(agent_type: str) -> str:
    """Generic fallback system prompt / goals for an agent (``""`` if unknown)."""
    return _field(agent_type, "system_prompt")


def default_persona_name(agent_type: str) -> str:
    """Generic fallback persona name for an agent (``""`` if unknown)."""
    return _field(agent_type, "persona_name")


def default_response_style(agent_type: str) -> str:
    """Generic fallback response style for an agent (``""`` if unknown)."""
    return _field(agent_type, "response_style")
