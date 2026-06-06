"""
agents/guardrails.py — deterministic only
──────────────────────────────────────────
Never trust the LLM to self-limit (Implentation.md §11). The rules that protect
the system are plain code, backed by Postgres:

  - ``is_running`` / ``set_state`` — the double-run guard (§6, §11), backed by
    the ``agent_state`` table (one row per ``(brandId, agentType)``).
  - ``count_actions_today`` / ``seen_dedup_key`` — per-day rate limits and the
    idempotency guard, answered by indexed queries over ``agent_activity``.
  - ``record_activity`` — append a meaningful action to the ``agent_activity``
    feed (§12); ``account_id`` and ``dedup`` are promoted to indexed columns so
    the two guards above are real lookups, not JSON scans.

The schema is owned by Prisma (``apps/server``); we only read/write rows.
"""

from __future__ import annotations

import logging

from psycopg.types.json import Json

from agents.lib import db

logger = logging.getLogger(__name__)


def is_running(brand_id: str, agent_type: str) -> bool:
    """True if ``agent_type`` for ``brand_id`` is currently marked running."""
    bid = db.resolve_brand_id(brand_id)
    with db.cursor() as cur:
        cur.execute(
            'SELECT status FROM agent_state '
            'WHERE "brandId" = %s AND "agentType" = %s::"AgentType"',
            (bid, agent_type),
        )
        row = cur.fetchone()
    return bool(row and row[0] == "running")


def set_state(
    brand_id: str, agent_type: str, status: str, current_task: str = ""
) -> None:
    """Upsert ``agent_state`` for the dashboard and the ``is_running`` guard.

    ``startedAt`` is stamped whenever the agent transitions to ``running`` and
    otherwise preserved.
    """
    bid = db.resolve_brand_id(brand_id)
    set_started = status == "running"
    with db.cursor() as cur:
        cur.execute(
            'INSERT INTO agent_state '
            '(id, "brandId", "agentType", status, "currentTask", "startedAt", "updatedAt") '
            'VALUES (%s, %s, %s::"AgentType", %s::"AgentRunStatus", %s, '
            "CASE WHEN %s THEN now() ELSE NULL END, now()) "
            'ON CONFLICT ("brandId", "agentType") DO UPDATE SET '
            "status = EXCLUDED.status, "
            '"currentTask" = EXCLUDED."currentTask", '
            '"startedAt" = CASE WHEN %s THEN now() ELSE agent_state."startedAt" END, '
            '"updatedAt" = now()',
            (
                db.new_id(),
                bid,
                agent_type,
                status,
                current_task,
                set_started,
                set_started,
            ),
        )


def count_actions_today(
    brand_id: str, agent_type: str, action: str, *, account_id: str | None = None
) -> int:
    """Count ``agent_activity`` rows for ``action`` logged today (UTC).

    Backs deterministic per-day rate limits (Implentation.md §11). Optionally
    scope to a single ``account_id``. Best-effort: errors count as zero.
    """
    bid = db.resolve_brand_id(brand_id)
    sql = (
        "SELECT count(*) FROM agent_activity "
        'WHERE "brandId" = %s AND agent = %s::"AgentType" AND action = %s '
        "AND ts >= date_trunc('day', now())"
    )
    params: list = [bid, agent_type, action]
    if account_id is not None:
        sql += ' AND "accountId" = %s'
        params.append(account_id)
    try:
        with db.cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
        return int(row[0]) if row else 0
    except Exception as exc:  # a guard must never break a run
        logger.debug("count_actions_today failed: %s", exc)
        return 0


def seen_dedup_key(brand_id: str, agent_type: str, action: str, dedup: str) -> bool:
    """True if an ``action`` carrying ``dedupKey == dedup`` was already logged.

    Idempotency guard (Implentation.md §11): lets a handler refuse to act twice
    on the same input (e.g. a gateway-retried DM). Best-effort.
    """
    if not dedup:
        return False
    bid = db.resolve_brand_id(brand_id)
    try:
        with db.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM agent_activity "
                'WHERE "brandId" = %s AND agent = %s::"AgentType" AND action = %s '
                'AND "dedupKey" = %s LIMIT 1',
                (bid, agent_type, action, dedup),
            )
            return cur.fetchone() is not None
    except Exception as exc:
        logger.debug("seen_dedup_key failed: %s", exc)
        return False


def record_activity(
    brand_id: str, agent_type: str, action: str, detail: dict | None = None
) -> None:
    """Append a row to the ``agent_activity`` feed (best-effort, never raises).

    ``detail['account_id']`` and ``detail['dedup']`` are promoted to the indexed
    ``accountId`` / ``dedupKey`` columns that back the two guards above.
    """
    detail = detail or {}
    try:
        bid = db.resolve_brand_id(brand_id)
        with db.cursor() as cur:
            cur.execute(
                'INSERT INTO agent_activity '
                '(id, "brandId", agent, action, detail, "dedupKey", "accountId", ts) '
                'VALUES (%s, %s, %s::"AgentType", %s, %s, %s, %s, now())',
                (
                    db.new_id(),
                    bid,
                    agent_type,
                    action,
                    Json(detail),
                    detail.get("dedup"),
                    detail.get("account_id"),
                ),
            )
    except Exception as exc:  # logging must never break a run
        logger.debug("Could not write activity: %s", exc)
