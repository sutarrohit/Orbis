"""
agents/constants/research.py
─────────────────────────────
Fixed values for the Research agent (Implentation.md §7.2), kept out of the
control-flow code. The thresholds are deterministic gates the LLM is never
trusted to apply itself.
"""

from __future__ import annotations

# Score gates (overridable via config / env).
PROSPECT_SAVE_MIN = 50   # save an outbound prospect at or above this
AUTO_DM_MIN = 60         # outreach (§9) DMs prospects at or above this

# Cap how much input text we hand the model per pass, to keep token use sane.
MAX_ITEMS_PER_PASS = 60
MAX_CHARS_PER_ITEM = 800


def interest_level(score: int) -> str:
    """Map a 0-100 score to an interest band (Implentation.md §7.2)."""
    if score >= 80:
        return "hot"
    if score >= 60:
        return "warm"
    if score >= 40:
        return "cool"
    return "skip"
