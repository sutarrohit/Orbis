"""The Sales agent (message-triggered handler) — everything specific to Sales
lives here: the role (``agent.py``, exposing ``decide_reply``) and its constants
(``agents.constants.sales``). Sales is NOT spawned and NOT triggered by the
Leader; the separate gateway service calls ``decide_reply`` once per inbound DM
from a known lead. Shared foundations live in ``agents.lib``; its prompt and
schemas live in ``agents.prompts.sales`` / ``agents.schemas.sales``."""

from .agent import decide_reply

__all__ = ["decide_reply"]
