"""
agents/gateway/sender.py — Phase 1 (outbound)
────────────────────────────────────────────────
Drains the ``pending_send`` queue and delivers each DM via the account that
queued it. Code only delivers what the outbound state machine already decided —
it does not choose recipients or write copy.

  queued row → find the client for its accountId → send_message → mark sent
  no client for that account → mark failed
  FloodWait → wait it out, leave the row queued for the next pass

DB calls are sync (the store layer), so they run via ``asyncio.to_thread``.
"""

from __future__ import annotations

import asyncio
import logging

from pyrogram.errors import FloodWait

from agents.constants.gateway import POLL_INTERVAL_SECONDS, SEND_BATCH, SEND_PACE_SECONDS
from agents.gateway import health
from agents.lib.store import PendingSendStore

logger = logging.getLogger(__name__)


def _peer(user_id: str):
    """Telegram ids are ints; fall back to the raw value (e.g. a username)."""
    try:
        return int(user_id)
    except (TypeError, ValueError):
        return user_id


async def drain_once(clients, *, store: PendingSendStore | None = None, pace: float = 0.0) -> dict:
    """Send every currently-queued DM once. Returns counts.

    ``store`` is injectable for testing; defaults to a real ``PendingSendStore``.
    """
    store = store or PendingSendStore()
    batch = await asyncio.to_thread(store.next_queued, SEND_BATCH, platform="telegram")
    sent = failed = 0
    for row in batch:
        entry = clients.get(row["account_id"])
        if entry is None:
            logger.warning(
                "No live client for account %s; marking send %s failed.",
                row["account_id"],
                row["id"],
            )
            await asyncio.to_thread(store.mark_failed, row["id"])
            failed += 1
            continue
        try:
            await entry["client"].send_message(_peer(row["to_user_id"]), row["message"])
            await asyncio.to_thread(store.mark_sent, row["id"])
            sent += 1
        except FloodWait as exc:
            # Respect Telegram's backoff; leave this row queued for next pass.
            logger.warning("FloodWait %ss — backing off.", exc.value)
            await asyncio.sleep(int(exc.value))
        except Exception as exc:
            logger.warning("Send %s failed: %s", row["id"], exc)
            if health.is_account_dead(exc):
                await health.handle_dead_account(clients, row["account_id"], str(exc))
            await asyncio.to_thread(store.mark_failed, row["id"])
            failed += 1
        if pace:
            await asyncio.sleep(pace)
    return {"considered": len(batch), "sent": sent, "failed": failed}


async def run_sender(clients, *, stop_event: asyncio.Event | None = None) -> None:
    """Poll-and-send forever (until ``stop_event`` is set)."""
    while stop_event is None or not stop_event.is_set():
        try:
            result = await drain_once(clients, pace=SEND_PACE_SECONDS)
            if result["considered"]:
                logger.info("sender pass: %s", result)
        except Exception as exc:  # never let the loop die
            logger.exception("sender loop error: %s", exc)
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
