"""
agents/lib/custom_llm.py — custom OpenAI-compatible proxy (Responses API)
─────────────────────────────────────────────────────────────────────────
A minimal client for the "crs" proxy (e.g. a self-deployed gpt-5.5) that the
agents can use *instead of* the LangChain path when ``USE_CUSTOM_LLM`` is on.

The proxy is strict (matches the working reference client):
  * wire API   → OpenAI "Responses" (`POST {base_url}/responses`)
  * ``input``  → a list of message items, not a bare string
  * ``stream`` → must be ``True``; the reply arrives as Server-Sent Events
  * auth       → Bearer token

The rest of the codebase only ever calls ``brain(Schema).invoke(prompt)`` and
expects a *validated Pydantic instance* back. This module reproduces that
contract: :class:`CustomResponsesBrain.with_structured_output` returns a small
runnable whose ``.invoke(prompt)`` streams the proxy, extracts the JSON body,
and validates it against ``schema`` — so it is a drop-in for the LangChain
``with_structured_output`` runnable used elsewhere.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Generic, TypeVar

import requests
from pydantic import BaseModel, ValidationError

from agents.lib.config import settings

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


class CustomLLMError(RuntimeError):
    """Raised when the custom proxy call cannot produce a valid object."""


def _extract_json(text: str) -> str:
    """Best-effort: pull the JSON object out of a model reply.

    Handles ```json fenced blocks and stray prose around the object.
    """
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fence:
        return fence.group(1).strip()
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1 and end > start:
        return text[start : end + 1]
    return text


def _text_from_response(response: dict) -> str:
    """Extract text from a final Responses-API ``response`` object (fallback)."""
    if isinstance(response.get("output_text"), str):
        return response["output_text"]
    chunks: list[str] = []
    for item in response.get("output", []) or []:
        for part in item.get("content", []) or []:
            if part.get("type") in ("output_text", "text") and part.get("text"):
                chunks.append(part["text"])
    return "".join(chunks)


def _consume_sse(resp: requests.Response) -> str:
    """Parse a Responses-API SSE stream and assemble the output text."""
    pieces: list[str] = []
    for raw in resp.iter_lines(decode_unicode=True):
        if not raw or not raw.startswith("data:"):
            continue
        data = raw[len("data:") :].strip()
        if data in ("", "[DONE]"):
            continue
        try:
            evt = json.loads(data)
        except json.JSONDecodeError:
            continue

        etype = evt.get("type", "")
        if etype == "response.output_text.delta":
            delta = evt.get("delta", "")
            if delta:
                pieces.append(delta)
        elif etype in ("response.completed", "response.done"):
            if not pieces:
                pieces.append(_text_from_response(evt.get("response", {})))
        elif etype == "error" or "error" in evt:
            err = evt.get("error", evt)
            raise CustomLLMError(f"Proxy stream error: {json.dumps(err)}")
    return "".join(pieces)


class _StructuredRunnable(Generic[T]):
    """Mirrors ``model.with_structured_output(schema)``: ``.invoke`` → schema."""

    def __init__(self, brain: "CustomResponsesBrain", schema: type[T]) -> None:
        self._brain = brain
        self._schema = schema

    def invoke(self, prompt: object) -> T:
        text = _to_text(prompt)
        json_schema = json.dumps(self._schema.model_json_schema())
        instruction = (
            f"{text}\n\n"
            "Respond with ONLY a single JSON object that conforms to this JSON "
            "schema. Do not include any prose, explanation, or markdown fences.\n"
            f"JSON schema:\n{json_schema}"
        )
        raw = self._brain._complete(instruction)
        try:
            return self._schema.model_validate_json(_extract_json(raw))
        except (ValidationError, json.JSONDecodeError) as exc:
            # One stricter retry before giving up.
            logger.warning("Custom LLM JSON invalid, retrying once: %s", exc)
            retry = self._brain._complete(
                instruction + "\n\nYour previous reply was not valid JSON. "
                "Return ONLY the JSON object, nothing else."
            )
            try:
                return self._schema.model_validate_json(_extract_json(retry))
            except (ValidationError, json.JSONDecodeError) as exc2:
                raise CustomLLMError(
                    f"Custom proxy did not return valid {self._schema.__name__} JSON: {exc2}"
                ) from exc2


def _to_text(prompt: object) -> str:
    """Coerce a prompt (str, LangChain message, or messages list) to plain text."""
    if isinstance(prompt, str):
        return prompt
    content = getattr(prompt, "content", None)
    if isinstance(content, str):
        return content
    if isinstance(prompt, (list, tuple)):
        return "\n".join(_to_text(p) for p in prompt)
    return str(prompt)


class CustomResponsesBrain:
    """Streaming Responses-API client exposing ``with_structured_output``."""

    def __init__(self) -> None:
        if not settings.custom_llm_api_key:
            raise CustomLLMError(
                "USE_CUSTOM_LLM is on but CRS_API_KEY is not set."
            )
        self._url = f"{settings.custom_llm_base_url.rstrip('/')}/responses"
        self._model = settings.custom_llm_model
        self._effort = settings.custom_llm_effort
        self._headers = {
            "Authorization": f"Bearer {settings.custom_llm_api_key}",
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        }

    def _complete(self, prompt: str) -> str:
        payload: dict = {
            "model": self._model,
            "stream": True,
            "input": [
                {"role": "user", "content": [{"type": "input_text", "text": prompt}]}
            ],
        }
        if self._effort:
            payload["reasoning"] = {"effort": self._effort}

        with requests.post(
            self._url, headers=self._headers, json=payload, timeout=300, stream=True
        ) as resp:
            if not resp.ok:
                raise CustomLLMError(
                    f"HTTP {resp.status_code} from {self._url}: {resp.text[:500]}"
                )
            return _consume_sse(resp)

    def with_structured_output(self, schema: type[T]) -> _StructuredRunnable[T]:
        return _StructuredRunnable(self, schema)
