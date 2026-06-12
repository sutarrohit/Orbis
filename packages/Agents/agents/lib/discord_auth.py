"""
agents/lib/discord_auth.py — Discord bot login (discord.py)
──────────────────────────────────────────────────────────────
Connecting a Discord **bot** is a single step — the bot token *is* the reusable
credential (unlike Telegram's multi-step MTProto login). We just validate the
token and read back the bot's identity:

    connect_bot(token) → {user_id, username, display_name, token}
    → SUCCESS: the caller ENCRYPTS the token and stores it on the account row.

Validation logs in over Discord's REST API only (``Client.login``); it does NOT
open the gateway websocket, so no intents/privileges are exercised here. The bot
still needs the **Message Content** intent enabled in the developer portal for
the gateway listeners to read message text at runtime.
"""

from __future__ import annotations

import logging

import discord

logger = logging.getLogger(__name__)


class DiscordAuthError(RuntimeError):
    """The token was missing/invalid, or Discord rejected the login."""


async def connect_bot(token: str) -> dict:
    """Validate a bot token and return its identity.

    Returns ``{user_id, username, display_name, token}`` (the token unchanged —
    the caller must ENCRYPT it before storing). Raises ``DiscordAuthError`` if
    the token is empty or Discord rejects it.
    """
    token = (token or "").strip()
    if not token:
        raise DiscordAuthError("No bot token provided.")

    # Intents are a gateway concern; REST login needs none.
    client = discord.Client(intents=discord.Intents.none())
    try:
        try:
            await client.login(token)
        except discord.LoginFailure as exc:  # bad/!revoked token
            raise DiscordAuthError(f"Invalid bot token: {exc}") from exc
        except Exception as exc:  # network / Discord outage / unexpected
            raise DiscordAuthError(f"Could not validate bot token: {exc}") from exc

        me = client.user
        if me is None:  # login succeeded but no identity came back
            raise DiscordAuthError("Token accepted but no bot user was returned.")

        logger.info("Discord bot validated: @%s (%s)", me.name, me.id)
        return {
            "user_id": str(me.id),
            "username": me.name or "",
            "display_name": getattr(me, "global_name", None) or me.name or "",
            "token": token,  # caller must ENCRYPT before storing
        }
    finally:
        # login opens an aiohttp session; always release it.
        await client.close()
