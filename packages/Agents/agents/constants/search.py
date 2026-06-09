"""
agents/constants/search.py
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

# tg://resolve?domain=<username> deep-links — how some pages render a Telegram
# handle (e.g. result 1 in a search). The /s/ web preview can't see these unless
# we recover the username first.
TG_RESOLVE_RE = re.compile(
    r"tg://resolve\?domain=([A-Za-z][A-Za-z0-9_]{3,31})", re.IGNORECASE
)

# "12,345 members / subscribers / followers" as shown on a t.me/s preview page.
MEMBERS_RE = re.compile(
    r"([\d ,\.]+)\s*(?:members|subscribers|followers)", re.IGNORECASE
)

# Generic words to drop when turning the niche/queries into match keywords.
_KEYWORD_STOPWORDS = {
    "best", "top", "the", "and", "for", "list", "free", "with", "new",
    "telegram", "group", "groups", "channel", "channels", "community",
    "communities", "join", "online",
}


def keywords_from(niche: str, queries: list[str]) -> list[str]:
    """Derive lowercased match keywords from the brand niche + search queries.

    Used by the verification step to score a channel's real preview content.
    Drops generic scaffolding words so only the meaningful terms remain.
    """
    text = " ".join([niche, *queries]).lower()
    out: list[str] = []
    for word in re.findall(r"[a-z0-9]{3,}", text):
        if word not in _KEYWORD_STOPWORDS and word not in out:
            out.append(word)
    return out

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
