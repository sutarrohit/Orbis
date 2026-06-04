"""
agents/llm.py — the brain
─────────────────────────
One place builds chat models. ``init_chat_model`` creates the brain;
``.with_structured_output(schema)`` forces a validated Pydantic object out, so
the rest of the code only ever receives typed decisions, never free text.

Provider is configured in :mod:`agents.config`:
  - default: ``AGENT_MODEL`` via ``init_chat_model`` (e.g. "openai:gpt-4o-mini")
  - override: set ``AGENT_LLM_BASE_URL`` (+ ``AGENT_LLM_API_KEY``) to point an
    OpenAI-compatible client elsewhere (e.g. OpenRouter) without code changes.

Every call's token usage is logged (Implentation.md §5.1 / §12). With no DB yet
we append it to ``data/token_usage.jsonl``.
"""

from __future__ import annotations

import json
import logging
from typing import Any, TypeVar

from pydantic import BaseModel

from agents.config import settings

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

# Built lazily so importing this module never requires API keys / network.
_model = None


def _build_model():
    """Construct the chat model from settings (OpenAI by default)."""
    if settings.llm_base_url:
        # OpenAI-compatible endpoint override (e.g. OpenRouter).
        from langchain_openai import ChatOpenAI

        model_name = settings.model.split(":", 1)[
            -1
        ]  # strip "openai:" prefix if present
        logger.info(
            "Building ChatOpenAI model=%s base_url=%s",
            model_name,
            settings.llm_base_url,
        )
        return ChatOpenAI(
            model=model_name,
            base_url=settings.llm_base_url,
            api_key=settings.llm_api_key,
        )

    from langchain.chat_models import init_chat_model

    logger.info("Building chat model via init_chat_model(%s)", settings.model)
    return init_chat_model(settings.model)


def get_model():
    """Return the shared chat model, building it on first use."""
    global _model
    if _model is None:
        _model = _build_model()
    return _model


def brain(schema: type[T]):
    """Return a runnable that outputs a validated instance of ``schema``.

    Usage:
        result = brain(SearchResult).invoke(prompt)   # -> SearchResult instance
    """
    return get_model().with_structured_output(schema)


def log_token_usage(response: Any, *, agent: str, call: str) -> None:
    """Append a token-usage record for one LLM call (best-effort, never raises).

    Pass the *raw* model response (an ``AIMessage``) when you have it. When using
    ``with_structured_output`` the usage is often not surfaced on the parsed
    object, so this is best-effort and simply records what it can find.
    """
    usage = None
    for attr in ("usage_metadata", "response_metadata"):
        meta = getattr(response, attr, None)
        if isinstance(meta, dict) and meta:
            usage = meta.get("usage", meta) if attr == "response_metadata" else meta
            if usage:
                break

    record = {"agent": agent, "call": call, "model": settings.model, "usage": usage}
    try:
        settings.token_usage_file.parent.mkdir(parents=True, exist_ok=True)
        with settings.token_usage_file.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
    except OSError as exc:  # logging must never break a run
        logger.debug("Could not write token usage: %s", exc)
