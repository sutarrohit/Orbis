"""
agents/guardrails.py — deterministic only
──────────────────────────────────────────
Never trust the LLM to self-limit (Implentation.md §11). The rules that protect
the system are plain code. For the Search agent we need the foundational ones:

  - ``is_running`` / ``set_state`` — the double-run guard (Implentation.md §6 §11).
    "Never spawn a worker already running." Clicking Run while the scheduler also
    triggers a worker must be a no-op for the second caller.
  - ``record_activity`` — append a meaningful action to the activity feed (§12).

With no Postgres yet these are backed by small JSON/JSONL files under ``data/``.
The state file plays the role of the future ``agent_state`` table.
"""

from __future__ import annotations

import json
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path

from agents.config import settings

logger = logging.getLogger(__name__)

_LOCK = threading.Lock()


def _state_file() -> Path:
    return settings.data_dir / "agent_state.json"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _read_state() -> dict:
    path = _state_file()
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8")) or {}
    except (json.JSONDecodeError, OSError):
        return {}


def _state_key(brand_id: str, agent_type: str) -> str:
    return f"{brand_id}:{agent_type}"


def is_running(brand_id: str, agent_type: str) -> bool:
    """True if ``agent_type`` for ``brand_id`` is currently marked running."""
    with _LOCK:
        entry = _read_state().get(_state_key(brand_id, agent_type))
    return bool(entry and entry.get("status") == "running")


def set_state(
    brand_id: str, agent_type: str, status: str, current_task: str = ""
) -> None:
    """Update ``agent_state`` for the dashboard and the ``is_running`` guard."""
    with _LOCK:
        state = _read_state()
        state[_state_key(brand_id, agent_type)] = {
            "brand_id": brand_id,
            "agent_type": agent_type,
            "status": status,
            "current_task": current_task,
            "updated_at": _now(),
        }
        path = _state_file()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(state, indent=2, ensure_ascii=False), encoding="utf-8"
        )


def record_activity(
    brand_id: str, agent_type: str, action: str, detail: dict | None = None
) -> None:
    """Append a line to the activity feed (best-effort, never raises)."""
    record = {
        "ts": _now(),
        "brand_id": brand_id,
        "agent": agent_type,
        "action": action,
        "detail": detail or {},
    }
    try:
        settings.activity_file.parent.mkdir(parents=True, exist_ok=True)
        with settings.activity_file.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
    except OSError as exc:
        logger.debug("Could not write activity: %s", exc)
