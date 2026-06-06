"""
agents/constants/outreach.py
─────────────────────────────
Deterministic thresholds for the outbound state machine (Implentation.md §9).
"""

from __future__ import annotations

# Hours of no reply before the next follow-up / cold transition.
FOLLOWUP_HOURS = 48

# Stage the funnel runs to: prospect(0) → contacted stages 1..3 → cold.
MAX_STAGE = 3

# Outbound copy standard (Implentation.md §9) — used to reject bad drafts.
MAX_WORDS = 120
MAX_QUESTIONS = 1

# Activity-feed actions (logged under the "leader" agent — outreach runs in the
# Leader cycle and AgentType has no separate "outreach" value).
ACTION_QUEUED = "dm_queued"
ACTION_COLD = "lead_cold"
