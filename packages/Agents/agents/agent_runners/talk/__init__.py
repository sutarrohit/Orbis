"""The Talk agent (message-triggered handler) — everything specific to Talk
lives here: the role (``agent.py``, exposing ``decide_reply``) and its constants
(``agents.constants.talk``). Talk is NOT spawned and NOT triggered by the Leader;
the separate gateway service calls ``decide_reply`` once per inbound group
message. Shared foundations live in ``agents.lib``; its prompt and schemas live
in ``agents.prompts.talk`` / ``agents.schemas.talk``."""

from .agent import decide_reply

__all__ = ["decide_reply"]
