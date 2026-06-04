"""
agents/prompts.py
─────────────────
Prompt rendering for the agent layer. Kept separate from agent logic so prompts
can be iterated on without touching control flow.
"""

from __future__ import annotations

from agents.lib.firecrawl_client import WebSearchResult

# Cap how much page text we hand the model per result, to keep token use sane.
_MAX_CHARS_PER_RESULT = 4000


def render_search_prompt(niche: str, results: list[WebSearchResult]) -> str:
    """Build the Search agent's extraction prompt from raw web results.

    The model must return a ``SearchResult`` (handled by structured output): a
    list of real Telegram communities with a 0-100 niche relevance score.
    """
    blocks: list[str] = []
    for i, r in enumerate(results, start=1):
        body = r.text[:_MAX_CHARS_PER_RESULT]
        blocks.append(f"--- RESULT {i} ---\nURL: {r.url}\n{body}".strip())
    corpus = "\n\n".join(blocks) if blocks else "(no web results)"

    return (
        "You are the Search agent for a brand. Your job is to find Telegram "
        "communities (groups or channels) relevant to the brand's niche from the "
        "web search results below.\n\n"
        f"BRAND NICHE: {niche}\n\n"
        "Instructions:\n"
        "- Extract only real Telegram groups/channels — things addressable by an "
        "'@username' or a 't.me/...' link. Ignore articles, people, and unrelated links.\n"
        "- For each, give the exact handle/link, a readable name, and a niche "
        "relevance score from 0 (irrelevant) to 100 (perfect fit) based on the "
        "title/description/context.\n"
        "- Do not invent handles. If you are unsure something is a real Telegram "
        "community, leave it out.\n\n"
        "WEB SEARCH RESULTS:\n"
        f"{corpus}\n"
    )
