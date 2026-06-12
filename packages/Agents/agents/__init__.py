"""
agents/
───────
PostPilot's five-agent squad (reasoning + orchestration + deterministic
executors). See ``Implentation.md`` for the full design.

Build order (we are building these one by one):
  1. Search   — spawnable worker, web-search for communities  ← implemented
  2. Research — spawnable worker, score leads
  3. Outreach — outbound state machine
  4. Leader   — LangGraph orchestrator
  5. Talk / Sales — gateway message handlers

Core principle (do not violate):
    The LLM makes judgments; deterministic code executes them.
    Every agent does three steps: Read → Decide (one typed LLM call) → Execute.

For now there is **no Postgres and no Gateway** — the "bus" is a local JSON
file store (see ``agents.store``). Swap ``store`` for real DB repositories later
without touching agent logic.
"""

import asyncio

# Pyrogram calls asyncio.get_event_loop() at import time, which raises
# RuntimeError in Python ≥3.14 when no loop is running yet. Ensure one exists
# before any submodule imports pyrogram.
try:
    asyncio.get_running_loop()
except RuntimeError:
    asyncio.set_event_loop(asyncio.new_event_loop())
