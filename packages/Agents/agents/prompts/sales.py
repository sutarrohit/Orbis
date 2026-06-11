"""
agents/prompts/sales.py
─────────────────────────
Prompt rendering for the Sales agent. Kept separate from agent logic so prompts
can be iterated on without touching control flow.

Sales reacts to one inbound DM from a known lead and returns a ``SalesDecision``
(handled by structured output). The prompt assembles the brand knowledge base
(persona, product, pricing, conversion action), the DM history, and the current
stage, then asks the model to move the lead one step along the motion while
honouring the §9 copy standard and never inventing facts.
"""

from __future__ import annotations

from agents.prompts._shared import guidance_block
from agents.schemas.sales import BrandProfile, SalesContext

# Cap DM history to keep token use sane.
_MAX_HISTORY = 12


def render_sales_prompt(
    ctx: SalesContext, profile: BrandProfile, *, guidance: str = ""
) -> str:
    """Build the Sales agent's per-DM decision prompt from ``ctx`` + ``profile``."""
    hist = ctx.history[-_MAX_HISTORY:]
    if hist:
        thread = "\n".join(
            f"  {'LEAD' if m.from_lead else 'US'}: {m.text}" for m in hist
        )
    else:
        thread = "  (no earlier messages)"

    pricing = profile.pricing.strip() or "(no pricing provided — do NOT state any price)"
    objections = (
        f"\nPRE-APPROVED OBJECTION ANSWERS:\n{profile.objection_notes}"
        if profile.objection_notes
        else ""
    )
    conversion = profile.conversion_action or "the agreed next step"
    about = f"\nABOUT / KNOWLEDGE (speak only from this):\n{profile.about}" if profile.about else ""
    website = (
        f"\nWEBSITE (share this link only when it's a natural next step, not every "
        f"message): {profile.website}"
        if profile.website
        else ""
    )
    lead = ctx.username or ctx.lead_user_id

    return (
        guidance_block(guidance)
        + "You are the Sales agent handling a 1:1 Telegram DM with a known lead. "
        f"Speak as: {profile.persona or 'a helpful, low-pressure account rep'}.\n\n"
        f"PRODUCT:\n{profile.product_summary or '(not provided)'}\n\n"
        f"PRICING (the only prices you may quote):\n{pricing}\n\n"
        f"CONVERSION ACTION (guide them here): {conversion}{objections}{about}{website}\n\n"
        "Run the sales motion and move the lead ONE step: qualify -> present -> "
        "handle objection -> close. Speak ONLY from the facts above — never invent "
        "pricing, features, links, or guarantees. Sound human: address what they said, give "
        "one value point, then one soft next step. 2-5 sentences, under 120 words, "
        "plain text, no emojis, no hype, no fake urgency, at most one question.\n\n"
        "Also set new_status: 'converted' ONLY on a clear conversion (they took/agreed "
        "to the conversion action), 'lost' on a clear no or opt-out, otherwise "
        "'nurturing'. Leave it null if nothing changed.\n\n"
        f"CURRENT STAGE: {ctx.stage}   LEAD STATUS: {ctx.lead_status}\n"
        f"DM THREAD (oldest first):\n{thread}\n\n"
        f"NEW MESSAGE from {lead}:\n  {ctx.message_text}\n"
    )
