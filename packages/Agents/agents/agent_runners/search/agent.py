"""
agents/search/agent.py — Search agent (spawnable worker)
────────────────────────────────────────────────────────
Web-search for relevant Telegram handles → save them as ``communities`` with
``status = pending_join`` and a relevance estimate. **Search discovers but does
not join** — the gateway joins and scrapes members later (Implentation.md §7.1).

This is the ONE place Search lives (Implentation.md §6). Both the dashboard
button (FastAPI) and the Leader call ``run_search`` — the ``is_running`` guard
makes that safe in either direction.

The three steps (the core principle — LLM judges, code executes):
  1. READ    — search the web via Firecrawl for the brand's niche.
  2. DECIDE   — one LLM call returns a typed ``SearchResult`` (handles + scores).
  3. EXECUTE  — plain code runs a regex backstop pass over the raw text to catch
                handles the LLM missed, normalises/dedups, filters by relevance,
                and writes ``pending_join`` records to the store.

When the LLM has no quota (``SEARCH_USE_LLM=false`` or an API error) the DECIDE
step degrades gracefully to the deterministic regex pass alone, so the worker
still produces output.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from agents.constants.search import (AT_RE, REGEX_DEFAULT_RELEVANCE,
                                     RESERVED_USERNAMES, TME_RE,
                                     default_queries)
from agents.lib import guardrails
from agents.lib.config import settings
from agents.lib.db import search_queries_for
from agents.lib.llm import brain
from agents.lib.store import CommunityStore
from agents.prompts.search import render_search_prompt
from agents.schemas.search import (CommunityRecord, FoundCommunity,
                                   SearchResult, SearchRunResult)
from .firecrawl_client import WebSearchResult, search

logger = logging.getLogger(__name__)

AGENT_TYPE = "search"


def normalize_handle(raw: str) -> str | None:
    """Return a canonical handle for a raw '@name' / t.me link, or None.

    - public usernames  → "@name"  (Telegram usernames are case-insensitive → lowercased)
    - invite links      → "https://t.me/+hash" / "https://t.me/joinchat/hash" (kept as-is)
    """
    if not raw:
        return None
    raw = raw.strip().strip(".,)\"'<>")

    m = TME_RE.search(raw)
    if m:
        token = m.group(2)
        if token.startswith("+"):
            return f"https://t.me/{token}"
        if token.lower().startswith("joinchat/"):
            return f"https://t.me/{token}"
        username = token.lower()
        if username in RESERVED_USERNAMES:
            return None
        return f"@{username}"

    m = AT_RE.search(raw if raw.startswith("@") else f" {raw}")
    if m:
        username = m.group(1).lower()
        if username in RESERVED_USERNAMES:
            return None
        return f"@{username}"

    return None


def _regex_extract(results: list[WebSearchResult]) -> dict[str, str]:
    """Find every Telegram handle in the raw text. Returns {handle: source_url}."""
    found: dict[str, str] = {}
    for r in results:
        text = r.text
        candidates: list[str] = []
        for m in TME_RE.finditer(text):
            candidates.append(m.group(0))
        for m in AT_RE.finditer(text):
            candidates.append(m.group(0))
        for cand in candidates:
            handle = normalize_handle(cand)
            if handle and handle not in found:
                found[handle] = r.url
    return found


def _source_url_for(handle: str, results: list[WebSearchResult]) -> str:
    """Best-effort: which result mentioned this handle (for attribution)."""
    needle = handle.lstrip("@").lower()
    for r in results:
        if needle and needle in r.text.lower():
            return r.url
    return ""


def _decide_with_llm(niche: str, results: list[WebSearchResult]) -> SearchResult:
    """DECIDE step: one structured LLM call. Raises on any LLM/transport error."""
    prompt = render_search_prompt(niche, results)
    result = brain(SearchResult).invoke(prompt)
    return result


def run_search(
    niche: str,
    *,
    brand_id: str = "default",
    queries: list[str] | None = None,
    limit: int | None = None,
    use_llm: bool | None = None,
    firecrawl_mode: str | None = None,
) -> SearchRunResult:
    """Run the Search agent once for ``brand_id`` / ``niche``.

    Safe to call manually or from the Leader: the ``is_running`` guard makes a
    concurrent second call a no-op.
    """
    queries = queries or search_queries_for(brand_id) or default_queries(niche)
    use_llm = settings.search_use_llm if use_llm is None else use_llm
    mode = (firecrawl_mode or settings.firecrawl_mode).strip().lower()
    
   

    empty = SearchRunResult(
        brand_id=brand_id,
        niche=niche,
        queries=queries,
        firecrawl_mode=mode,
        used_llm=False,
    )

    # ── Guard: never double-run ──────────────────────────────────────────────
    if guardrails.is_running(brand_id, AGENT_TYPE):
        logger.info("Search already running for brand=%s; skipping.", brand_id)
        return empty

    guardrails.set_state(
        brand_id, AGENT_TYPE, "running", current_task=f"search:{niche}"
    )
    try:
        # ── 1. READ: gather web results across all queries ───────────────────
        results: list[WebSearchResult] = []
        for q in queries:
            try:
                results.extend(search(q, limit=limit, mode=mode))
            except Exception as exc:
                logger.warning("Search query failed (%r): %s", q, exc)
        # Dedup pages by URL.
        seen_urls: set[str] = set()
        results = [
            r for r in results if not (r.url in seen_urls or seen_urls.add(r.url))
        ]
        print("results=================",results)
        logger.info(
            "Search gathered %d pages for brand=%s niche=%r",
            len(results),
            brand_id,
            niche,
        )

        # ── 2. DECIDE: LLM extraction (typed), with graceful fallback ────────
        llm_communities: list[FoundCommunity] = []
        used_llm = False
        if use_llm and results:
            try:
                decision = _decide_with_llm(niche, results)
                llm_communities = decision.communities
                used_llm = True
            except Exception as exc:
                logger.warning(
                    "LLM extraction unavailable, falling back to regex only: %s", exc
                )

        # ── 3. EXECUTE: regex backstop + normalise + dedup + filter ──────────
        now = datetime.now(timezone.utc).isoformat()
        merged: dict[str, CommunityRecord] = {}

        # LLM finds (scored). Apply the relevance threshold to these.
        for fc in llm_communities:
            handle = normalize_handle(fc.handle)
            if not handle:
                continue
            if fc.niche_relevance < settings.search_min_relevance:
                continue
            merged[handle] = CommunityRecord(
                brand_id=brand_id,
                handle=handle,
                name=fc.name or handle,
                niche_relevance=fc.niche_relevance,
                status="pending_join",
                source="search",
                found_via="llm",
                source_url=_source_url_for(handle, results),
                created_at=now,
            )

        # Regex backstop: add handles the LLM missed (kept regardless of score —
        # they matched a real @/ t.me pattern).
        for handle, url in _regex_extract(results).items():
            if handle in merged:
                continue
            merged[handle] = CommunityRecord(
                brand_id=brand_id,
                handle=handle,
                name=handle,
                niche_relevance=REGEX_DEFAULT_RELEVANCE,
                status="pending_join",
                source="search",
                found_via="regex",
                source_url=url,
                created_at=now,
            )

        records = list(merged.values())

        # ── Persist (idempotent upsert by (brand_id, handle)) ────────────────
        store = CommunityStore()
        inserted, duplicates = store.upsert_many(records)

        guardrails.record_activity(
            brand_id,
            AGENT_TYPE,
            "search_completed",
            {
                "niche": niche,
                "pages": len(results),
                "discovered": len(records),
                "saved_new": inserted,
                "duplicates": duplicates,
                "used_llm": used_llm,
            },
        )

        return SearchRunResult(
            brand_id=brand_id,
            niche=niche,
            queries=queries,
            firecrawl_mode=mode,
            used_llm=used_llm,
            pages_searched=len(results),
            discovered=len(records),
            saved_new=inserted,
            duplicates=duplicates,
            communities=records,
        )
    finally:
        guardrails.set_state(brand_id, AGENT_TYPE, "idle")
