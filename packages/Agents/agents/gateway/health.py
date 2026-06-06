"""
agents/gateway/health.py — Phase 5 (resilience)
────────────────────────────────────────────────
Keep the account roster honest. A Telegram session can die (revoked, expired,
the account deactivated/banned) — Pyrogram surfaces these as ``Unauthorized``
(401) errors. When that happens we mark the account ``restricted`` in the DB and
drop its client from rotation so the sender/joiner stop using it.

``FloodWait`` is NOT a health failure (it's transient) — it's handled where it
occurs, not here.
"""

from __future__ import annotations

import asyncio
import logging

from pyrogram.errors import Unauthorized

from agents.constants.gateway import HEALTH_CHECK_INTERVAL
from agents.lib.store import SocialAccountStore

logger = logging.getLogger(__name__)


def is_account_dead(exc: Exception) -> bool:
    """True if an exception means the account's session is no longer usable
    (revoked / expired / deactivated / banned)."""
    return isinstance(exc, Unauthorized)


async def handle_dead_account(clients, account_id: str, reason: str = "") -> None:
    """Mark an account ``restricted`` and remove its client from the registry."""
    logger.error("Account %s session dead (%s); marking restricted.", account_id, reason)
    await asyncio.to_thread(SocialAccountStore().mark_health, account_id, "restricted")
    await clients.remove(account_id)


async def run_health_check(clients, *, stop_event: asyncio.Event | None = None) -> None:
    """Periodically ping each client (``get_me``); stamp health, drop dead ones."""
    store = SocialAccountStore()
    while stop_event is None or not stop_event.is_set():
        await asyncio.sleep(HEALTH_CHECK_INTERVAL)
        for account_id in clients.account_ids():
            entry = clients.get(account_id)
            if not entry:
                continue
            try:
                await entry["client"].get_me()
                await asyncio.to_thread(store.mark_health, account_id, "active")
            except Unauthorized as exc:
                await handle_dead_account(clients, account_id, str(exc))
            except Exception as exc:  # transient (network, etc.) — leave as-is
                logger.warning("Health ping failed for %s: %s", account_id, exc)
