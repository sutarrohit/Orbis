"""
agents/prompts/leader.py
─────────────────────────
Prompt builder for the Leader's one decision per cycle (Implentation.md §8).

The snapshot (the brand's full state) goes in; the model returns a LeaderPlan.
The hard rules are stated here AND re-checked in code — the prompt is guidance,
not the enforcement.
"""

from __future__ import annotations

from agents.constants.leader import (
    JOINED_SEARCH_CEIL,
    JOINED_SEARCH_FLOOR,
    SCOREABLE_RESEARCH_MIN,
)


def render_leader_prompt(snap: dict) -> str:
    """Build the Leader's decide prompt from a brand-state snapshot."""
    accounts = ", ".join(
        f"{a['account_id']}({a['status']})" for a in snap.get("accounts", [])
    ) or "none"
    leads = snap.get("leads_by_status", {})
    leads_str = ", ".join(f"{k}={v}" for k, v in leads.items()) or "none"
    recent = "\n".join(
        f"  - {l['user_id']} {l['username']} [{l['status']}, score {l['score']}] {l['note']}"
        for l in snap.get("recent_leads", [])
    ) or "  (none)"
    learnings = "\n".join(f"  - {t}" for t in snap.get("learnings", [])) or "  (none)"
    running = ", ".join(k for k, v in snap.get("running", {}).items() if v) or "none"

    return f"""You are the Leader orchestrating one brand's lead-generation funnel.
Decide this cycle's plan. You do not act directly — deterministic code applies
your plan under hard limits. Prefer doing nothing over acting without a reason.

BRAND STATE
- Niche: {snap.get('niche', '')!r}
- Joined communities: {snap.get('joined_communities', 0)}
- Pending (discovered, not joined): {snap.get('pending_communities', 0)}
- Joined communities with no account assigned: {snap.get('unassigned_joined', 0)}
- Scoreable members waiting (have a username, not yet a lead): {snap.get('scoreable_members', 0)}
- Leads by status: {leads_str}
- Prospects ready for outreach: {snap.get('prospects', 0)}
- Accounts: {accounts}
- Workers currently running: {running}

RECENT LEADS
{recent}

WHAT YOU'VE LEARNED SO FAR
{learnings}

HARD RULES (follow these)
- If joined communities < {JOINED_SEARCH_FLOOR}: spawn Search.
- If joined >= {JOINED_SEARCH_FLOOR} and scoreable members > {SCOREABLE_RESEARCH_MIN}: spawn Research (not Search).
- If joined >= {JOINED_SEARCH_CEIL}: do NOT spawn Search unless the niche clearly needs more groups.
- Never spawn a worker that is already running (see "Workers currently running").
- Outbound DMs to prospects happen automatically — you do NOT need a worker for them.
- Only pause an account for a clear reason (e.g. it looks restricted); only move a
  lead's status when the recent-leads notes justify it.

Return a LeaderPlan: which workers to spawn, any account/lead actions, and any new
learnings worth keeping. Add a short strategy_notes explaining your reasoning.
"""
