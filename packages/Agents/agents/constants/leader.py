"""
agents/constants/leader.py
────────────────────────────
Deterministic thresholds for the Leader's decision rules (Implentation.md §8).
These are re-checked in code (the execute node), not just in the prompt.
"""

from __future__ import annotations

# Spawn Search while joined communities are below this.
JOINED_SEARCH_FLOOR = 5
# Above this many joined communities, don't spawn Search unless goals demand it.
JOINED_SEARCH_CEIL = 10
# Spawn Research once there are this many scoreable members waiting.
SCOREABLE_RESEARCH_MIN = 20

# Max communities one account may be assigned (Implentation.md §11).
MAX_GROUPS_PER_ACCOUNT = 10

# Activity-feed action names (logged under the "leader" agent).
ACTION_CYCLE = "leader_cycle"
ACTION_ASSIGN = "community_assigned"
