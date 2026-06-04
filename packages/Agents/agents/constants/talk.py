"""
agents/constants/talk.py
─────────────────────────
Fixed values for the Talk agent, kept out of the control-flow code.

The rate limit is a deterministic guardrail (Implentation.md §11): the LLM is
never trusted to self-limit, so code caps how many group replies one account may
send per day.
"""

from __future__ import annotations

# Max group replies a single account may send per brand per day (Implentation.md
# §11). Over this, code forces silence regardless of what the LLM decided.
MAX_GROUP_REPLIES_PER_DAY = 30

# Activity-feed action names — also what the rate-limit counter scans for.
ACTION_REPLIED = "talk_replied"
ACTION_DECIDED = "talk_decided"

# Lead score → interest band (Implentation.md §7.2 bands; "skip" < 40 is not
# saved as a lead).
def interest_level(score: int) -> str:
    """Map a 0-100 lead score to an interest band."""
    if score >= 80:
        return "hot"
    if score >= 60:
        return "warm"
    if score >= 40:
        return "cool"
    return "skip"
