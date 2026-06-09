"""
agents/lib/console.py — console encoding safety
────────────────────────────────────────────────
On Windows the default console encoding is cp1252, which cannot encode common
characters that appear in scraped web content and community names (em dash "—",
arrow "→", emoji, non-Latin scripts). Printing or logging those raises
``UnicodeEncodeError`` and can abort an otherwise-successful run.

Call :func:`ensure_utf8_stdio` once at process start (CLI + service entrypoints)
to switch stdout/stderr to UTF-8 with ``errors="replace"`` so output degrades
gracefully instead of crashing.
"""

from __future__ import annotations

import sys


def ensure_utf8_stdio() -> None:
    """Best-effort: make stdout/stderr UTF-8 and non-fatal on encoding errors."""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is None:
            continue
        try:
            reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            # Never let console hardening break startup.
            pass
