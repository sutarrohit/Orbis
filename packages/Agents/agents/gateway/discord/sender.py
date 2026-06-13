"""
agents/gateway/discord/sender.py — outbound (Discord)
────────────────────────────────────────────────────────
Drains the ``pending_send`` queue for Discord accounts and delivers each item via
the account that queued it. Code only delivers what the outbound state machine
already decided — it does not choose recipients or write copy.

  kind=dm           → fetch the user → user.send(message)        (DM the lead)
  kind=channel_post → fetch the channel → channel.send(message)  (post in a channel)
  no client for that account → mark failed
  rate limited (429) → back off, leave the row queued for the next pass

Mirror of ``agents.gateway.sender`` (Telegram). DB calls are sync, so they run
via ``asyncio.to_thread``.
"""

from __future__ import annotations

import asyncio
import logging

import discord

from agents.constants.gateway import (
    DISCORD_SEND_BATCH,
    DISCORD_SEND_PACE_SECONDS,
    POLL_INTERVAL_SECONDS,
)
from agents.gateway.discord import health
from agents.lib.store import PendingSendStore

logger = logging.getLogger(__name__)


async def _deliver(client, row: dict) -> None:
    """Deliver one queued send via ``client`` (a DM or a channel post)."""
    if row.get("kind") == "channel_post":
        target = row.get("target_id")
        if not target:
            raise ValueError("channel_post row has no target_id")
        channel = client.get_channel(int(target)) or await client.fetch_channel(int(target))
        await channel.send(row["message"])
    else:
        recipient = row.get("to_user_id")
        if not recipient:
            raise ValueError("dm row has no recipient")
        user = client.get_user(int(recipient)) or await client.fetch_user(int(recipient))
        await user.send(row["message"])


async def drain_once(clients, *, store: PendingSendStore | None = None, pace: float = 0.0) -> dict:
    """Send every currently-queued Discord item once. Returns counts.

    ``store`` is injectable for testing; defaults to a real ``PendingSendStore``.
    """
    store = store or PendingSendStore()
    batch = await asyncio.to_thread(store.next_queued, DISCORD_SEND_BATCH, platform="discord")
    sent = failed = 0
    for row in batch:
        entry = clients.get(row["account_id"])
        if entry is None:
            logger.warning(
                "No live Discord client for account %s; marking send %s failed.",
                row["account_id"],
                row["id"],
            )
            await asyncio.to_thread(store.mark_failed, row["id"])
            failed += 1
            continue
        try:
            await _deliver(entry["client"], row)
            await asyncio.to_thread(store.mark_sent, row["id"])
            sent += 1
        except discord.HTTPException as exc:
            if getattr(exc, "status", None) == 429:
                # Respect Discord's backoff; leave this row queued for next pass.
                retry = float(getattr(exc, "retry_after", 0) or 5)
                logger.warning("Discord rate limited %ss — backing off.", retry)
                await asyncio.sleep(retry)
                continue
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
            result = await drain_once(clients, pace=DISCORD_SEND_PACE_SECONDS)
            if result["considered"]:
                logger.info("discord sender pass: %s", result)
        except Exception as exc:  # never let the loop die
            logger.exception("discord sender loop error: %s", exc)
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
