"""
Manual Firecrawl smoke test — run the Search agent's `search()` wrapper directly,
bypassing the LLM / DB / persistence so you can see exactly what Firecrawl returns.

Usage (from packages/Agents):
    uv run python test_firecrawl.py "crypto trading signals telegram channel"
    uv run python test_firecrawl.py "crypto trading signals telegram channel" 5

Reads FIRECRAWL_API_KEY / FIRECRAWL_MODE / SEARCH_LIMIT from .env via settings.
"""

from __future__ import annotations

import sys

from agents.agent_runners.search.firecrawl_client import search
from agents.lib.config import settings


def main() -> None:
    query = sys.argv[1] if len(sys.argv) > 1 else "crypto trading signals telegram channel"
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else None

    print(f"mode={settings.firecrawl_mode}  api_key_set={bool(settings.firecrawl_api_key)}")
    print(f"query={query!r}  limit={limit or settings.search_limit}")
    print("-" * 70)

    results = search(query, limit=limit, mode="live")

    print(f"\nGot {len(results)} page(s)\n")
    for i, r in enumerate(results, start=1):
        print(f"--- RESULT {i} ---")
        print(f"  url:   {r.url}")
        print(f"  title: {r.title}")
        print(f"  desc:  {r.description[:120]}")
        print(f"  md:    {len(r.markdown)} chars")
        print(f"  t.me links: {r.links}")
        print()


if __name__ == "__main__":
    main()
