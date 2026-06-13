"""
agents/gateway/discord/health.py
──────────────────────────────────
Keep the Discord account roster honest. A user token can die (revoked, expired,
the account banned/deleted) — discord.py surfaces auth failures as
``discord.LoginFailure``; a running client whose connection drops for good has a
finished run task or a closed socket.

When an account is dead we mark it ``restricted`` in the DB and drop its client
from rotation so the sender / joiner stop using it. The health loop also
reconciles the roster (``connect_new``) so an account connected after boot starts
acting without a restart — mirrors the Telegram gateway.

Transient blips (a single failed reconnect that discord.py is already retrying)
are left alone.
"""

from __future__ import annotations

import asyncio
import logging

import discord

from agents.constants.gateway import HEALTH_CHECK_INTERVAL
from agents.lib.store import SocialAccountStore

logger = logging.getLogger(__name__)


def is_account_dead(exc: Exception) -> bool:
    """True if an exception means the account's token is no longer usable."""
    return isinstance(exc, discord.LoginFailure)


async def handle_dead_account(clients, account_id: str, reason: str = "") -> None:
    """Mark an account ``restricted`` and remove its client from the registry."""
    logger.error("Discord account %s dead (%s); marking restricted.", account_id, reason)
    await asyncio.to_thread(SocialAccountStore().mark_health, account_id, "restricted")
    await clients.remove(account_id)


async def run_health_check(clients, *, stop_event: asyncio.Event | None = None) -> None:
    """Periodically reconcile the roster and drop dead clients.

    The connection itself is maintained by discord.py, so liveness is read from
    the client's run task / socket rather than by pinging the API:
      - run task finished      → the client stopped (errored or disconnected) → dead
      - socket closed          → dead
      - otherwise              → healthy, stamp ``active``
    """
    store = SocialAccountStore()
    while stop_event is None or not stop_event.is_set():
        await asyncio.sleep(HEALTH_CHECK_INTERVAL)
        try:
            added = await clients.connect_new()
            if added:
                logger.info("Discord health: connected %d newly-added account(s).", added)
        except Exception as exc:  # never let reconciliation kill the loop
            logger.warning("Discord health: connect_new failed: %s", exc)
        for account_id in clients.account_ids():
            entry = clients.get(account_id)
            if not entry:
                continue
            client = entry["client"]
            task = entry.get("task")
            try:
                if task is not None and task.done():
                    exc = None if task.cancelled() else task.exception()
                    await handle_dead_account(
                        clients, account_id, str(exc) if exc else "client stopped"
                    )
                elif client.is_closed():
                    await handle_dead_account(clients, account_id, "connection closed")
                else:
                    await asyncio.to_thread(store.mark_health, account_id, "active")
            except Exception as exc:  # transient — leave as-is
                logger.warning("Discord health check failed for %s: %s", account_id, exc)
