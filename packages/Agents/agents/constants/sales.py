"""
agents/constants/sales.py
───────────────────────────
Fixed values for the Sales agent (Implentation.md §7.4, §11), kept out of the
control-flow code. The DM cap is a deterministic guardrail — the LLM is never
trusted to self-limit.
"""

from __future__ import annotations

# Activity-feed action names — also what the rate-limit counter scans for.
ACTION_SENT = "sales_sent"
ACTION_DECIDED = "sales_decided"
