"""
agents/gateway/client_manager.py — Phase 0
─────────────────────────────────────────────
Loads every active account and holds one connected Pyrogram client per account
(one shared asyncio loop). Each account's encrypted session string is decrypted
and used to log in — no re-auth, no OTP. This is the gateway's connection layer;
the sender / listeners use these clients.
"""

from __future__ import annotations

import asyncio
import logging

from pyrogram import Client
from pyrogram.errors import Unauthorized

from agents.gateway.listeners import attach_listeners
from agents.lib import crypto
from agents.lib.config import settings
from agents.lib.store import SocialAccountStore

logger = logging.getLogger(__name__)


class GatewayClients:
    """Registry of live Pyrogram clients, keyed by ``social_account.id``."""

    def __init__(self) -> None:
        self._clients: dict[str, dict] = {}

    def __len__(self) -> int:
        return len(self._clients)

    def get(self, account_id: str) -> dict | None:
        """Return ``{client, brand_id, external_id}`` for an account, or None."""
        return self._clients.get(account_id)

    def account_ids(self) -> list[str]:
        """Snapshot of connected account ids (safe to iterate while removing)."""
        return list(self._clients.keys())

    async def remove(self, account_id: str) -> None:
        """Stop and drop a client (e.g. a dead session) from the registry."""
        entry = self._clients.pop(account_id, None)
        if entry:
            try:
                await entry["client"].stop()
            except Exception:  # best-effort
                pass

    def register(self, account_id: str, client, brand_id: str, external_id: str) -> None:
        """Add a client to the registry (used by ``start_all`` and by tests)."""
        self._clients[account_id] = {
            "client": client,
            "brand_id": brand_id,
            "external_id": external_id,
        }

    async def start_all(self) -> int:
        """Connect a client for every active account with a session. Returns count."""
        if not settings.telegram_api_id or not settings.telegram_api_hash:
            raise RuntimeError("TELEGRAM_API_ID / TELEGRAM_API_HASH are not set.")
        accounts = await asyncio.to_thread(SocialAccountStore().all_active)
        for acc in accounts:
            try:
                session = crypto.decrypt(acc["session_string"])
                client = Client(
                    name=f"gw:{acc['id']}",
                    api_id=settings.telegram_api_id,
                    api_hash=settings.telegram_api_hash,
                    session_string=session,
                    in_memory=True,
                )
                await client.start()
                me = await client.get_me()
                attach_listeners(client, acc["brand_id"], acc["id"])
                self.register(acc["id"], client, acc["brand_id"], acc["external_id"])
                await asyncio.to_thread(
                    SocialAccountStore().mark_health, acc["id"], "active"
                )
                logger.info(
                    "Gateway client up: account=%s (@%s)", acc["external_id"], me.username
                )
            except Unauthorized as exc:  # dead session → take it out of rotation
                logger.error(
                    "Account %s session invalid (%s); marking restricted.",
                    acc.get("external_id"),
                    exc,
                )
                await asyncio.to_thread(
                    SocialAccountStore().mark_health, acc["id"], "restricted"
                )
            except Exception as exc:  # transient — don't penalise the account
                logger.error(
                    "Could not start client for account %s: %s",
                    acc.get("external_id"),
                    exc,
                )
        return len(self._clients)

    async def stop_all(self) -> None:
        for entry in self._clients.values():
            try:
                await entry["client"].stop()
            except Exception:  # best-effort
                pass
        self._clients.clear()
