"""The Search agent (spawnable worker) — everything specific to Search lives
here: the role (``agent.py``, exposing ``run_search``) and its constants
(``constants.py``). Shared foundations live in ``agents.lib``; its prompt and
schemas live in ``agents.prompts.search`` / ``agents.schemas.search``."""

from agents.search.agent import run_search

__all__ = ["run_search"]
