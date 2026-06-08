"""
agents/firecrawl_client.py
──────────────────────────
Thin wrapper around Firecrawl's search API (SDK ``firecrawl-py``), used by the
Search agent to find web pages that list Telegram communities.

Two modes (set ``FIRECRAWL_MODE`` in .env):
  - ``live``    → call Firecrawl (requires credits on the account).
  - ``fixture`` → read ``agents/fixtures/search_*.json`` instead, so the rest of
                  the Search pipeline (LLM extraction, regex, dedup, file store)
                  can be exercised for free / offline / in tests.

We normalise every result to a small ``WebSearchResult`` regardless of mode so
the agent code does not care which backend produced it.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field

from agents.lib.config import settings

logger = logging.getLogger(__name__)


def _meta_get(meta, key: str) -> str:
    """Read a metadata field whether ``meta`` is a model, a dict, or None."""
    if meta is None:
        return ""
    if isinstance(meta, dict):
        return meta.get(key, "") or ""
    return getattr(meta, key, "") or ""


@dataclass
class WebSearchResult:
    """One web page returned by a search (transport-agnostic)."""

    url: str
    title: str = ""
    description: str = ""
    markdown: str = ""
    # Telegram-relevant links (t.me/...) Firecrawl extracted from the page. These
    # often live in footers beyond the markdown we hand the LLM, so we surface
    # them explicitly — they're the highest-signal source of real handles.
    links: list[str] = field(default_factory=list)

    @property
    def text(self) -> str:
        """All textual content, for LLM extraction and the regex pass."""
        parts = [self.title, self.description, self.markdown]
        if self.links:
            parts.append("TELEGRAM LINKS:\n" + "\n".join(self.links))
        return "\n".join(p for p in parts if p)


class FirecrawlSearchError(RuntimeError):
    """Raised when a live Firecrawl search cannot be completed."""


def _search_live(query: str, *, limit: int, scrape: bool) -> list[WebSearchResult]:
    if not settings.firecrawl_api_key:
        raise FirecrawlSearchError(
            "FIRECRAWL_API_KEY is not set; cannot run a live search."
        )

    from firecrawl import Firecrawl
    from firecrawl.v2.types import ScrapeOptions

    fc = Firecrawl(api_key=settings.firecrawl_api_key)
    kwargs: dict = {"limit": limit, "sources": ["web"]}
    if scrape:
        # Pull page markdown AND the extracted link list so the LLM/regex can see
        # handles in the body and in footer links, not just the title/description.
        kwargs["scrape_options"] = ScrapeOptions(formats=["markdown", "links"])

    try:
        data = fc.search(query, **kwargs)
    except Exception as exc:  # SDK raises typed errors (PaymentRequiredError, etc.)
        raise FirecrawlSearchError(f"Firecrawl search failed: {exc}") from exc

    web = getattr(data, "web", None) or []
    results: list[WebSearchResult] = []
    for item in web:
        # Two possible shapes: a scraped ``Document`` (markdown top-level, but
        # url/title/description under ``.metadata``) or a flat ``SearchResultWeb``
        # (url/title/description on the item, no markdown). Handle both.
        meta = getattr(item, "metadata", None)
        url = getattr(item, "url", "") or _meta_get(meta, "url")
        title = getattr(item, "title", "") or _meta_get(meta, "title")
        description = getattr(item, "description", "") or _meta_get(meta, "description")
        markdown = getattr(item, "markdown", "") or ""
        all_links = getattr(item, "links", None) or []
        tg_links = list(
            dict.fromkeys(l for l in all_links if isinstance(l, str) and "t.me/" in l.lower())
        )
        results.append(
            WebSearchResult(
                url=url,
                title=title,
                description=description,
                markdown=markdown,
                links=tg_links,
            )
        )
    return results


def _search_fixture(query: str, *, limit: int) -> list[WebSearchResult]:
    """Return canned results from ``agents/fixtures/search_sample.json``.

    The fixture is a list of ``{url, title, description, markdown}`` objects.
    """
    fixture = settings.fixtures_dir / "search_sample.json"
    if not fixture.exists():
        logger.warning("Fixture %s not found; returning no results.", fixture)
        return []
    with fixture.open("r", encoding="utf-8") as fh:
        rows = json.load(fh)
    results = [
        WebSearchResult(
            url=row.get("url", ""),
            title=row.get("title", ""),
            description=row.get("description", ""),
            markdown=row.get("markdown", ""),
        )
        for row in rows
    ]
    logger.info(
        "Fixture search for %r -> %d canned results", query, len(results[:limit])
    )
    return results[:limit]


def search(
    query: str,
    *,
    limit: int | None = None,
    scrape: bool = True,
    mode: str | None = None,
) -> list[WebSearchResult]:
    """Search the web for ``query`` and return normalised results.

    ``mode`` overrides ``FIRECRAWL_MODE`` for this call ("live" or "fixture").
    ``scrape=True`` asks Firecrawl to also return page markdown (more handles,
    more credits).
    """
    limit = limit or settings.search_limit
    mode = (mode or settings.firecrawl_mode).strip().lower()
    
    print("query=================",query)
    print("limit=================",limit)
    print("scrap=================",scrape)
    print("mode=================",mode) 
    return 
    
    
    if mode == "fixture":
        return _search_fixture(query, limit=limit)
    return _search_live(query, limit=limit, scrape=scrape)
