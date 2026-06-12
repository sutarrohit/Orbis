"""
agents/gateway/discord/client_manager.py — connection layer (Discord)
─────────────────────────────────────────────────────────────────────────
Loads every active Discord account and holds one connected discord.py client
per bot (all on one shared asyncio loop). Each account's encrypted bot token is
decrypted and used to log in. This is the gateway's connection layer; the sender
/ listeners use these clients.

Unlike Pyrogram (whose ``start()`` returns once connected), discord.py's
``start()`` runs the client for its whole lifetime — so each bot runs as a
background task, and we wait for ``on_ready`` (or the task failing) to know
whether it came online.
"""

from __future__ import annotations

import asyncio
import logging

import discord

from agents.constants.gateway import DISCORD_READY_TIMEOUT
from agents.gateway.discord.health import handle_dead_account  # noqa: F401 (API parity)
from agents.gateway.discord.listeners import GatewayBot
from agents.lib import crypto
from agents.lib.store import SocialAccountStore

logger = logging.getLogger(__name__)


def _intents() -> discord.Intents:
    """Non-privileged defaults + Message Content (privileged; enable it in the
    developer portal). Server Members is intentionally NOT requested — we capture
    members from messages, not from the roster."""
    intents = discord.Intents.default()
    intents.message_content = True
    return intents


class DiscordGatewayClients:
    """Registry of live discord.py clients, keyed by ``social_account.id``."""

    def __init__(self) -> None:
        self._clients: dict[str, dict] = {}

    def __len__(self) -> int:
        return len(self._clients)

    def get(self, account_id: str) -> dict | None:
        """Return ``{client, brand_id, external_id, task}`` for an account, or None."""
        return self._clients.get(account_id)

    def account_ids(self) -> list[str]:
        """Snapshot of connected account ids (safe to iterate while removing)."""
        return list(self._clients.keys())

    def register(self, account_id: str, client, brand_id: str, external_id: str, task=None) -> None:
        """Add a client to the registry (used by ``start_all`` and by tests)."""
        self._clients[account_id] = {
            "client": client,
            "brand_id": brand_id,
            "external_id": external_id,
            "task": task,
        }

    async def remove(self, account_id: str) -> None:
        """Stop and drop a client (e.g. a dead token) from the registry."""
        entry = self._clients.pop(account_id, None)
        if entry:
            await self._shutdown(entry)

    @staticmethod
    async def _shutdown(entry: dict) -> None:
        """Close a client and cancel its run task (best-effort)."""
        try:
            if not entry["client"].is_closed():
                await entry["client"].close()
        except Exception:  # best-effort
            pass
        task = entry.get("task")
        if task is not None and not task.done():
            task.cancel()

    async def _connect_account(self, acc: dict) -> bool:
        """Log in one bot and register its client. Returns True on success.

        An invalid token (``LoginFailure``) marks the account ``restricted``; a
        transient error is left alone so a later pass can retry it.
        """
        client = GatewayBot(acc["brand_id"], acc["id"], intents=_intents())
        token = crypto.decrypt(acc["session_string"])
        task = asyncio.ensure_future(client.start(token))
        ready = asyncio.ensure_future(client.wait_until_ready())
        try:
            await asyncio.wait(
                {task, ready},
                timeout=DISCORD_READY_TIMEOUT,
                return_when=asyncio.FIRST_COMPLETED,
            )
            if task.done():
                # start() returned/raised before ready → connection failed.
                ready.cancel()
                exc = task.exception()
                raise exc if exc else RuntimeError("client stopped before ready")
            if not ready.done():
                raise asyncio.TimeoutError("bot did not become ready in time")

            self.register(acc["id"], client, acc["brand_id"], acc["external_id"], task)
            await asyncio.to_thread(SocialAccountStore().mark_health, acc["id"], "active")
            return True
        except discord.LoginFailure as exc:  # dead/revoked token → out of rotation
            logger.error(
                "Bot %s token invalid (%s); marking restricted.", acc.get("external_id"), exc
            )
            await self._shutdown({"client": client, "task": task})
            await asyncio.to_thread(SocialAccountStore().mark_health, acc["id"], "restricted")
        except Exception as exc:  # transient — don't penalise the account
            logger.error("Could not start bot %s: %s", acc.get("external_id"), exc)
            await self._shutdown({"client": client, "task": task})
        return False

    async def start_all(self) -> int:
        """Connect a client for every active Discord account with a token."""
        accounts = await asyncio.to_thread(SocialAccountStore().all_active, "discord")
        for acc in accounts:
            await self._connect_account(acc)
        return len(self._clients)

    async def connect_new(self) -> int:
        """Connect any active Discord account not already in the registry —
        accounts added (or re-activated) after the gateway started. Returns how
        many came online this pass."""
        accounts = await asyncio.to_thread(SocialAccountStore().all_active, "discord")
        connected = 0
        for acc in accounts:
            if acc["id"] in self._clients:
                continue
            if await self._connect_account(acc):
                connected += 1
        return connected

    async def stop_all(self) -> None:
        for entry in self._clients.values():
            await self._shutdown(entry)
        self._clients.clear()
