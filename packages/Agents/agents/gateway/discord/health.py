"""
agents/gateway/discord/health.py — resilience (Discord)
──────────────────────────────────────────────────────────
Keep the bot roster honest. discord.py auto-reconnects through transient network
blips, so "dead" means the client's run task has ended (an invalid/revoked token
surfaces as ``discord.LoginFailure``) or the client is permanently closed. When
that happens we mark the account ``restricted`` and drop it from rotation.
"""

from __future__ import annotations

import asyncio
import logging

import discord

from agents.constants.gateway import HEALTH_CHECK_INTERVAL
from agents.lib.store import SocialAccountStore

logger = logging.getLogger(__name__)


def is_account_dead(exc: Exception) -> bool:
    """True if an exception means the bot token is no longer usable."""
    return isinstance(exc, discord.LoginFailure)


async def handle_dead_account(clients, account_id: str, reason: str = "") -> None:
    """Mark an account ``restricted`` and remove its client from the registry."""
    logger.error("Discord account %s dead (%s); marking restricted.", account_id, reason)
    await asyncio.to_thread(SocialAccountStore().mark_health, account_id, "restricted")
    await clients.remove(account_id)


async def run_health_check(clients, *, stop_event: asyncio.Event | None = None) -> None:
    """Periodically check each client; stamp health, drop dead ones.

    Also reconciles the roster: connects any active Discord account added (or
    re-activated) since the last pass, so a freshly-connected bot starts
    sending/listening without restarting the gateway.
    """
    store = SocialAccountStore()
    while stop_event is None or not stop_event.is_set():
        await asyncio.sleep(HEALTH_CHECK_INTERVAL)
        try:
            added = await clients.connect_new()
            if added:
                logger.info("Health: connected %d newly-added bot(s).", added)
        except Exception as exc:  # never let reconciliation kill the loop
            logger.warning("Health: connect_new failed: %s", exc)
        for account_id in clients.account_ids():
            entry = clients.get(account_id)
            if not entry:
                continue
            task = entry.get("task")
            client = entry["client"]
            # The run task ending, or a closed client, means it won't recover.
            if (task is not None and task.done()) or client.is_closed():
                exc = task.exception() if task is not None and task.done() else None
                await handle_dead_account(clients, account_id, str(exc) if exc else "client closed")
            else:
                await asyncio.to_thread(store.mark_health, account_id, "active")
