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

"""

from __future__ import annotations

import logging
from typing import TypeVar

from pydantic import BaseModel

from agents.lib.config import settings

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
