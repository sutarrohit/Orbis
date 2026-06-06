"""
run_search.py — CLI runner for the Search agent
────────────────────────────────────────────────
A tiny standalone entry point so the Search agent can be exercised end-to-end
without the full FastAPI app (the demo ``main.py`` imports modules — db/, the
prediction router — that are not part of this agent build).

Usage (from packages/Agents):

    # Free / offline — uses the bundled fixture + regex extraction (no credits):
    uv run python run_search.py "AI startup founders" --mode fixture --no-llm

    # Live — needs Firecrawl credits (and an LLM with quota for --llm):
    uv run python run_search.py "AI startup founders" --mode live

Results are printed and saved to data/communities.json.
"""

from __future__ import annotations

import argparse
import logging

from agents.search import run_search


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Search agent.")
    parser.add_argument("niche", help="The brand's niche, e.g. 'AI startup founders'.")
    parser.add_argument(
        "--brand", default="default", help="Brand id to attribute finds to."
    )
    parser.add_argument(
        "--query",
        action="append",
        dest="queries",
        help="Override search query (repeatable).",
    )
    parser.add_argument(
        "--limit", type=int, default=None, help="Max web results per query."
    )
    parser.add_argument(
        "--mode", choices=["live", "fixture"], default=None, help="Firecrawl mode."
    )
    llm = parser.add_mutually_exclusive_group()
    llm.add_argument(
        "--llm", dest="use_llm", action="store_true", help="Force LLM extraction."
    )
    llm.add_argument(
        "--no-llm", dest="use_llm", action="store_false", help="Regex-only extraction."
    )
    parser.set_defaults(use_llm=None)
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO, format="%(levelname)s %(name)s: %(message)s"
    )

    result = run_search(
        args.niche,
        brand_id=args.brand,
        queries=args.queries,
        limit=args.limit,
        use_llm=args.use_llm,
        firecrawl_mode=args.mode,
    )

    print("\n=== Search run ===")
    print(f"brand={result.brand_id} niche={result.niche!r}")
    print(f"firecrawl_mode={result.firecrawl_mode} used_llm={result.used_llm}")
    print(
        f"pages_searched={result.pages_searched} discovered={result.discovered} "
        f"saved_new={result.saved_new} duplicates={result.duplicates}"
    )
    print("\nCommunities (saved to the Postgres `community` table):")
    for c in result.communities:
        print(f"  [{c.niche_relevance:3d}] {c.handle:<32} ({c.found_via}) {c.name}")


if __name__ == "__main__":
    main()
