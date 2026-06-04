"""
agents/search/constants.py
───────────────────────────
Fixed values for the Search agent, kept out of the control-flow code:
Telegram handle patterns, reserved (non-community) usernames, the default
relevance for regex-only finds, and the default web-search query template.
"""

from __future__ import annotations

import re

# Relevance assigned to a handle found only by the regex backstop (the LLM did
# not score it). Neutral-ish so it survives the default threshold but is clearly
# a safety-net find (``found_via="regex"``).
REGEX_DEFAULT_RELEVANCE = 50

# t.me / telegram.me links, including invite (+hash, /joinchat/hash) and the
# /s/ web-preview prefix.
TME_RE = re.compile(
    r"(?:https?://)?(?:www\.)?t(?:elegram)?\.me/(s/)?(\+[\w-]+|joinchat/[\w-]+|[A-Za-z0-9_]{3,32})",
    re.IGNORECASE,
)

# Bare @usernames (5-32 chars per Telegram rules; allow 4+). Must not be part of
# an email address — so the char before '@' must not be alphanumeric/._%+-.
AT_RE = re.compile(r"(?<![\w.%+\-])@([A-Za-z][A-Za-z0-9_]{3,31})\b")

# Usernames that are Telegram system paths, not communities.
RESERVED_USERNAMES = {
    "share",
    "iv",
    "addstickers",
    "addtheme",
    "proxy",
    "socks",
    "login",
    "joinchat",
    "s",
}


def default_queries(niche: str) -> list[str]:
    """Default web search queries for a niche.

    One query by default to conserve Firecrawl credits; override via the
    ``queries`` argument to ``run_search``.
    """
    return [f"best {niche} Telegram groups and channels"]
