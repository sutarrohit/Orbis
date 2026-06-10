"""
agents/prompts/_shared.py
──────────────────────────
Shared prompt fragments so every agent injects operator config the same way.

Each agent's prompt prepends an operator-guidance block (the agent's
``agent_config.systemPrompt``, with a generic per-role default filling the gap)
and, where useful, a brand-knowledge block (``agent_config.knowledgeBase``).
Both render to ``""`` when empty, so a prompt is unchanged when nothing is set.
"""

from __future__ import annotations


def guidance_block(text: str) -> str:
    """Operator instructions for the agent (weigh, but never break the rules below)."""
    text = (text or "").strip()
    if not text:
        return ""
    return (
        "OPERATOR GUIDANCE (how to behave — weigh this in your judgement; it "
        "never overrides the rules below):\n"
        f"{text}\n\n"
    )


def knowledge_block(text: str) -> str:
    """Brand product/positioning context (state only facts given here)."""
    text = (text or "").strip()
    if not text:
        return ""
    return (
        "BRAND KNOWLEDGE (product, positioning, FAQs — context only; state no "
        "facts that are not given here):\n"
        f"{text}\n\n"
    )
