"""
agents/gateway/discord/sender.py — outbound (Discord)
─────────────────────────────────────────────────────────
Drains the ``pending_send`` queue and delivers each DM via the bot that queued
it. Code only delivers what the outbound state machine already decided — it does
not choose recipients or write copy.

  queued row → find the client for its accountId → resolve user → send → mark sent
  no client for that account → mark failed
  cannot DM (Forbidden: DMs closed / no shared server) → mark failed
  rate limited (429) → back off, leave the row queued for the next pass

A bot can only DM a user it shares a server with. DB calls are sync, so they run
via ``asyncio.to_thread``.
"""

from __future__ import annotations

import asyncio
import logging

import discord

from agents.constants.gateway import POLL_INTERVAL_SECONDS, SEND_BATCH, SEND_PACE_SECONDS
from agents.gateway.discord import health
from agents.lib.store import PendingSendStore

logger = logging.getLogger(__name__)


async def _resolve_user(client, user_id: str):
    """Get a discord User by id (cache first, then fetch). Returns None if the
    id is not a valid user."""
    try:
        uid = int(user_id)
    except (TypeError, ValueError):
        return None
    user = client.get_user(uid)
    if user is None:
        user = await client.fetch_user(uid)
    return user


async def drain_once(clients, *, store: PendingSendStore | None = None, pace: float = 0.0) -> dict:
    """Send every currently-queued DM once. Returns counts.

    ``store`` is injectable for testing; defaults to a real ``PendingSendStore``.
    """
    store = store or PendingSendStore()
    batch = await asyncio.to_thread(store.next_queued, SEND_BATCH)
    sent = failed = 0
    for row in batch:
        entry = clients.get(row["account_id"])
        if entry is None:
            logger.warning(
                "No live bot for account %s; marking send %s failed.",
                row["account_id"],
                row["id"],
            )
            await asyncio.to_thread(store.mark_failed, row["id"])
            failed += 1
            continue
        try:
            user = await _resolve_user(entry["client"], row["to_user_id"])
            if user is None:
                raise ValueError(f"unresolvable user id {row['to_user_id']}")
            await user.send(row["message"])
            await asyncio.to_thread(store.mark_sent, row["id"])
            sent += 1
        except discord.HTTPException as exc:
            if getattr(exc, "status", None) == 429:  # rate limited → back off
                retry = float(getattr(exc, "retry_after", 0) or 5)
                logger.warning("Rate limited %ss — backing off.", retry)
                await asyncio.sleep(retry)
                continue  # leave this row queued for next pass
            logger.warning("Send %s failed: %s", row["id"], exc)
            await asyncio.to_thread(store.mark_failed, row["id"])
            failed += 1
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
                logger.info("discord sender pass: %s", result)
        except Exception as exc:  # never let the loop die
            logger.exception("discord sender loop error: %s", exc)
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
