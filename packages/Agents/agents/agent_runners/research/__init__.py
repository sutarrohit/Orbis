"""The Research agent (spawnable worker) — everything specific to Research lives
here: the role (``agent.py``, exposing ``run_research``) and its constants
(``agents.constants.research``). Research reads conversations + group members
from the bus and writes scored people into the shared lead store (``LeadStore``).
Shared foundations live in ``agents.lib``; its prompts and schemas live in
``agents.prompts.research`` / ``agents.schemas.research``."""

from .agent import run_research

__all__ = ["run_research"]
