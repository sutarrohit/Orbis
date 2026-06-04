"""
agents/prompts/talk.py
───────────────────────
Prompt rendering for the Talk agent. Kept separate from agent logic so prompts
can be iterated on without touching control flow.

Talk reacts to a single inbound group message and returns a ``ReplyDecision``
(handled by structured output). The whole prompt is biased toward **silence**:
the model should only engage on a real question, a clear pain point, or a natural
opening, and any reply must read as a private DM, not a public group blast
(Implentation.md §7.3, copy standard §9).
"""

from __future__ import annotations

from agents.schemas.talk import TalkContext

# Cap recent-context size to keep token use sane.
_MAX_RECENT = 8


def render_talk_prompt(ctx: TalkContext) -> str:
    """Build the Talk agent's per-message decision prompt from ``ctx``."""
    recent = ctx.recent_messages[-_MAX_RECENT:]
    if recent:
        history = "\n".join(
            f"  {m.sender_username or 'someone'}: {m.text}" for m in recent
        )
    else:
        history = "  (no earlier messages provided)"

    sender = ctx.sender_username or ctx.sender_user_id
    bio = f"\nSENDER BIO: {ctx.sender_bio}" if ctx.sender_bio else ""
    persona = ctx.persona or "a helpful, low-key member of the community"
    niche = ctx.brand_niche or "(niche not specified)"

    return (
        "You are the Talk agent: a real-sounding member of a Telegram group who "
        f"speaks as {persona}. The brand's niche is: {niche}.\n\n"
        "You react to ONE new group message. Your default is SILENCE. Most chatter "
        "needs no reply — greetings, banter, and off-topic talk should get "
        "should_reply=False. Replying to everything looks like spam and gets "
        "accounts restricted. Engage ONLY when there is:\n"
        "  - a genuine question you can help with, or\n"
        "  - a clear pain point the brand addresses, or\n"
        "  - a natural opening to be useful (not salesy).\n\n"
        "If you do reply: phrase it to be sent as a PRIVATE DM to the sender, never "
        "a public group blast. Sound human — context, one value point, one soft next "
        "step. 2-5 sentences, under 120 words, plain text, no emojis, no hype, no "
        "guarantees, no fake urgency, no repeated CTAs, at most one question. Never "
        "invent pricing or claims.\n\n"
        "Separately, set flag_as_lead=True if the sender shows real interest or a "
        "relevant pain point worth following up with later — even if you stay silent "
        "now. When flagging, give a lead_score 0-100 (80-100 hot, 60-79 warm, 40-59 "
        "cool); below 40 is not a lead.\n\n"
        f"GROUP RECENT MESSAGES (oldest first):\n{history}\n\n"
        f"NEW MESSAGE from {sender}:{bio}\n"
        f"  {ctx.message_text}\n"
    )
