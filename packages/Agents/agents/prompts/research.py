"""
agents/prompts/research.py
───────────────────────────
Prompt rendering for the Research agent. Kept separate from agent logic so
prompts can be iterated on without touching control flow.

Two passes (Implentation.md §7.2):
  - inbound  — score people who *spoke* to us (conversations) on real interest.
  - outbound — score scraped group members (cold) on bio/activity/niche fit.

Both ask the model for a ``ResearchResult`` (only the relevant list filled),
using the exact ``user_id`` from each input so the EXECUTE step can match scores
back to people.
"""

from __future__ import annotations

from agents.constants.research import MAX_CHARS_PER_ITEM, MAX_ITEMS_PER_PASS
from agents.prompts._shared import guidance_block, knowledge_block
from agents.schemas.research import ConversationRecord, GroupMemberRecord

_BANDS = (
    "Score 0-100: 80-100 hot (clear, strong fit/interest), 60-79 warm, "
    "40-59 cool, below 40 skip. Set interest_level to the matching band."
)


def render_inbound_prompt(
    niche: str,
    convos: list[ConversationRecord],
    *,
    guidance: str = "",
    knowledge: str = "",
) -> str:
    """Score inbound conversations → people who showed interest."""
    rows = []
    for c in convos[:MAX_ITEMS_PER_PASS]:
        who = c.username or c.user_id
        rows.append(f"- user_id={c.user_id} ({who}): {c.text[:MAX_CHARS_PER_ITEM]}")
    corpus = "\n".join(rows) if rows else "(no conversations)"

    return (
        guidance_block(guidance)
        + knowledge_block(knowledge)
        + "You are the Research agent (inbound pass) for a brand. From the recent "
        "messages below, score each distinct person on how genuinely interested "
        "they are in what the brand offers — a real question, a pain point, or "
        "buying intent scores high; idle chatter scores low.\n\n"
        f"BRAND NICHE: {niche}\n{_BANDS}\n\n"
        "Return a ResearchResult with the scored people in `inbound_leads` (leave "
        "`outbound_prospects` empty). Use the exact user_id shown. Capture concrete "
        "pain_points and a one-line recommended_approach grounded in what they said. "
        "Do not invent people or claims.\n\n"
        f"RECENT MESSAGES:\n{corpus}\n"
    )


def render_outbound_prompt(
    niche: str,
    members: list[GroupMemberRecord],
    *,
    guidance: str = "",
    knowledge: str = "",
) -> str:
    """Score cold group members → outbound prospects."""
    rows = []
    for m in members[:MAX_ITEMS_PER_PASS]:
        who = m.username or m.user_id
        bio = (m.bio or "").strip()[:MAX_CHARS_PER_ITEM]
        activity = f" | activity: {m.activity_note}" if m.activity_note else ""
        rows.append(f"- user_id={m.user_id} ({who}): bio: {bio or '(none)'}{activity}")
    corpus = "\n".join(rows) if rows else "(no members)"

    return (
        guidance_block(guidance)
        + knowledge_block(knowledge)
        + "You are the Research agent (outbound pass) for a brand. These are cold "
        "group members (they have not contacted us). Score each on how good a "
        "prospect they are for the brand, judging from bio relevance, apparent "
        "activity, and niche fit.\n\n"
        f"BRAND NICHE: {niche}\n{_BANDS}\n\n"
        "Return a ResearchResult with the scored people in `outbound_prospects` "
        "(leave `inbound_leads` empty). Use the exact user_id shown. Give likely "
        "pain_points and a one-line recommended_approach for a first DM — specific, "
        "no pricing, no invented claims. Score weak fits as skip rather than omitting.\n\n"
        f"GROUP MEMBERS:\n{corpus}\n"
    )
