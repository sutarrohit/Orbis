"""
agents/prompts/outreach.py
───────────────────────────
Prompt builder for the outbound DM copy (Implentation.md §9 copy standard).

The LLM only writes the message; everything it may claim must come from the
brand profile passed in (never invent pricing/features/guarantees).
"""

from __future__ import annotations

from agents.schemas.sales import BrandProfile


def render_outreach_prompt(
    *,
    username: str,
    note: str,
    pain_points: list[str],
    recommended_approach: str,
    profile: BrandProfile | None,
    is_followup: bool,
) -> str:
    """Build the prompt for one outbound DM (first contact or follow-up)."""
    persona = profile.persona if profile else ""
    product = profile.product_summary if profile else ""
    pricing = profile.pricing if profile else ""
    cta = profile.conversion_action if profile else ""
    pains = ", ".join(pain_points) if pain_points else ""

    if is_followup:
        intent = (
            "Write a brief, polite FOLLOW-UP DM — they have not replied yet. Add a "
            "little new value or angle; do not nag or repeat the previous message."
        )
    else:
        intent = "Write a first, warm outreach DM to open a conversation with this lead."

    return f"""You write outbound DMs for a brand. {intent}

BRAND (the only facts you may state)
- Persona / voice: {persona}
- Product: {product}
- Pricing (state only these facts; if empty, never mention a price): {pricing}
- Goal — the single soft next step to invite: {cta}

LEAD
- Handle: {username}
- Why they were flagged: {note}
- Pain points: {pains}
- Suggested approach: {recommended_approach}

RULES (regenerate the draft if it violates any of these)
- Sound human. Structure: context -> one value point -> one soft next step.
- 2-5 sentences, under 120 words, plain text, no emojis.
- No hype, guarantees, fake urgency, or repeated calls to action.
- At most one question.
- Never invent pricing, features, or claims not given above.
"""
