"""
agents/llm.py — the brain
─────────────────────────
One place builds chat models. ``init_chat_model`` creates the brain;
``.with_structured_output(schema)`` forces a validated Pydantic object out, so
the rest of the code only ever receives typed decisions, never free text.

Provider is configured in :mod:`agents.config`:
  - default: ``AGENT_MODEL`` via ``init_chat_model`` (e.g. "openai:gpt-4o-mini")
  - override: set ``AGENT_LLM_BASE_URL`` (+ ``AGENT_LLM_API_KEY``) to point an
    OpenAI-compatible client elsewhere without code changes.
  - fallback: set ``OPENROUTER_API_KEY`` and every call falls back to OpenRouter
    if the primary model errors (e.g. an OpenAI quota / 429).

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
_fallback_model = None
_fallback_built = False
_custom_brain = None


def get_custom_brain():
    """Return the shared custom-proxy brain (built once), or None when off."""
    global _custom_brain
    if not settings.use_custom_llm:
        return None
    if _custom_brain is None:
        from agents.lib.custom_llm import CustomResponsesBrain

        logger.info(
            "Routing all LLM calls to custom proxy model=%s base_url=%s",
            settings.custom_llm_model,
            settings.custom_llm_base_url,
        )
        _custom_brain = CustomResponsesBrain()
    return _custom_brain


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


def _build_fallback_model():
    """Construct the OpenRouter fallback model, or None when not configured."""
    if not settings.openrouter_api_key:
        return None
    from langchain_openai import ChatOpenAI

    logger.info(
        "Building OpenRouter fallback model=%s", settings.openrouter_model
    )
    return ChatOpenAI(
        model=settings.openrouter_model,
        base_url=settings.openrouter_base_url,
        api_key=settings.openrouter_api_key,
    )


def get_fallback_model():
    """Return the shared OpenRouter fallback model (None if no key), built once."""
    global _fallback_model, _fallback_built
    if not _fallback_built:
        _fallback_model = _build_fallback_model()
        _fallback_built = True
    return _fallback_model


def brain(schema: type[T]):
    """Return a runnable that outputs a validated instance of ``schema``.

    If ``OPENROUTER_API_KEY`` is set, the runnable falls back to OpenRouter when
    the primary model raises (e.g. an OpenAI quota / 429 error).

    Usage:
        result = brain(SearchResult).invoke(prompt)   # -> SearchResult instance
    """
    # When USE_CUSTOM_LLM is on, send every request to the custom proxy and skip
    # the LangChain model + OpenRouter fallback entirely.
    custom = get_custom_brain()
    if custom is not None:
        return custom.with_structured_output(schema)

    primary = get_model().with_structured_output(schema)
    fallback = get_fallback_model()
    if fallback is not None:
        return primary.with_fallbacks([fallback.with_structured_output(schema)])
    return primary
