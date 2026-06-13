"""
agents/gateway/discord/client_manager.py
──────────────────────────────────────────
Loads every active **Discord** account and holds one connected ``discord.Client``
per account. Each account's encrypted bot token is decrypted and used to log in.

discord.py's ``client.start(token)`` runs the client's event loop until the
client disconnects, so we run it as a background asyncio task and wait for the
``READY`` event before treating the account as connected. A bad/expired token
surfaces as ``discord.LoginFailure`` — we mark the account ``restricted`` and
drop it; a transient error is left for a later pass to retry.

Mirror of ``agents.gateway.client_manager.GatewayClients`` (Telegram); the
sender / listeners / joiner use these clients the same way.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging

import discord

from agents.constants.gateway import DISCORD_CONNECT_TIMEOUT
from agents.gateway.discord.listeners import attach_listeners
from agents.lib import crypto
from agents.lib.store import SocialAccountStore

logger = logging.getLogger(__name__)


class DiscordGatewayClients:
    """Registry of live ``discord.Client``s, keyed by ``social_account.id``."""

    def __init__(self) -> None:
        # account_id -> {client, task, brand_id, external_id}
        self._clients: dict[str, dict] = {}

    def __len__(self) -> int:
        return len(self._clients)

    def get(self, account_id: str) -> dict | None:
        """Return ``{client, task, brand_id, external_id}`` for an account, or None."""
        return self._clients.get(account_id)

    def account_ids(self) -> list[str]:
        """Snapshot of connected account ids (safe to iterate while removing)."""
        return list(self._clients.keys())

    def register(
        self, account_id: str, client, task, brand_id: str, external_id: str
    ) -> None:
        """Add a client (and its run task) to the registry."""
        self._clients[account_id] = {
            "client": client,
            "task": task,
            "brand_id": brand_id,
            "external_id": external_id,
        }

    async def remove(self, account_id: str) -> None:
        """Stop and drop a client (e.g. a dead session) from the registry."""
        entry = self._clients.pop(account_id, None)
        if not entry:
            return
        await self._shutdown(entry["client"], entry.get("task"))

    @staticmethod
    async def _shutdown(client, task) -> None:
        """Close a client and tear down its run task — best effort."""
        try:
            await client.close()
        except Exception:  # best-effort
            pass
        if task is not None and not task.done():
            task.cancel()
        if task is not None:
            with contextlib.suppress(Exception):
                await task

    async def _connect_account(self, acc: dict) -> bool:
        """Log in one account and register its client. Returns True on success.

        A bad token (``LoginFailure``) marks the account ``restricted``; a
        transient error / timeout is left alone so a later pass can retry it.
        """
        try:
            token = crypto.decrypt(acc["session_string"])
        except Exception as exc:
            logger.error(
                "Could not decrypt token for account %s: %s",
                acc.get("external_id"),
                exc,
            )
            return False

        # Bot gateway needs explicit intents: message content to read messages,
        # members to scrape rosters. Both are privileged — enable them on the bot
        # in the Developer Portal too, or those features stay empty.
        intents = discord.Intents.default()
        intents.message_content = True
        intents.members = True
        client = discord.Client(intents=intents)
        attach_listeners(client, acc["brand_id"], acc["id"])
        start_task = asyncio.create_task(client.start(token))
        ready_task = asyncio.create_task(client.wait_until_ready())
        try:
            done, _pending = await asyncio.wait(
                {start_task, ready_task},
                timeout=DISCORD_CONNECT_TIMEOUT,
                return_when=asyncio.FIRST_COMPLETED,
            )
        except Exception as exc:  # unexpected — clean up
            logger.error(
                "Error connecting Discord account %s: %s", acc.get("external_id"), exc
            )
            await self._abort(client, start_task, ready_task)
            return False

        # Success: ready fired and the run loop is still going.
        if ready_task in done and not start_task.done():
            if not ready_task.done():  # defensive
                ready_task.cancel()
            me = client.user
            self.register(
                acc["id"], client, start_task, acc["brand_id"], acc["external_id"]
            )
            await asyncio.to_thread(
                SocialAccountStore().mark_health, acc["id"], "active"
            )
            logger.info(
                "Discord client up: account=%s (@%s)",
                acc["external_id"],
                getattr(me, "name", "?"),
            )
            return True

        # Failure: the run loop ended (errored) or we timed out before READY.
        if start_task.done():
            exc = start_task.exception()
            if isinstance(exc, discord.LoginFailure):
                logger.error(
                    "Account %s token invalid (%s); marking restricted.",
                    acc.get("external_id"),
                    exc,
                )
                await asyncio.to_thread(
                    SocialAccountStore().mark_health, acc["id"], "restricted"
                )
            else:
                logger.error(
                    "Could not start Discord client for account %s: %s",
                    acc.get("external_id"),
                    exc,
                )
        else:
            logger.error(
                "Discord account %s did not reach READY within %ss; will retry.",
                acc.get("external_id"),
                DISCORD_CONNECT_TIMEOUT,
            )
        await self._abort(client, start_task, ready_task)
        return False

    @staticmethod
    async def _abort(client, start_task, ready_task=None) -> None:
        if ready_task is not None and not ready_task.done():
            ready_task.cancel()
        try:
            await client.close()
        except Exception:  # best-effort
            pass
        if not start_task.done():
            start_task.cancel()
        with contextlib.suppress(Exception):
            await start_task

    async def start_all(self) -> int:
        """Connect a client for every active Discord account. Returns count."""
        accounts = await asyncio.to_thread(
            SocialAccountStore().all_active, platform="discord"
        )
        for acc in accounts:
            await self._connect_account(acc)
        return len(self._clients)

    async def connect_new(self) -> int:
        """Connect any active Discord account that isn't in the registry yet —
        accounts added (or re-activated) after the gateway started. Returns how
        many came online this pass. Mirrors the Telegram gateway's reconciliation
        so a freshly-connected account starts acting without a restart.
        """
        accounts = await asyncio.to_thread(
            SocialAccountStore().all_active, platform="discord"
        )
        connected = 0
        for acc in accounts:
            if acc["id"] in self._clients:
                continue
            if await self._connect_account(acc):
                connected += 1
        return connected

    async def stop_all(self) -> None:
        for account_id in list(self._clients.keys()):
            await self.remove(account_id)
