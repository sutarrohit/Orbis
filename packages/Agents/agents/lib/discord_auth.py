"""
agents/lib/discord_auth.py — Discord bot login (bot token)
─────────────────────────────────────────────────────────────────
Connect a Discord **bot** so the gateway can act as it. Unlike Telegram's
multi-step OTP flow, a bot is identified by a single **bot token** the operator
supplies (Developer Portal → Bot → Reset Token). We validate it with one HTTP
call (``GET /users/@me``) and return the bot's identity; the token itself is the
reusable credential (the caller ENCRYPTS it before storing).

The bot must be invited to each server via its OAuth2 URL (bot scope + Send
Messages / Read Message History) and have the Message Content intent enabled
(plus Server Members for member scraping).

Uses discord.py (imported as ``discord``); a bot token is auth'd as ``Bot ...``.
"""

from __future__ import annotations

import logging

import discord

logger = logging.getLogger(__name__)


class DiscordAuthError(RuntimeError):
    """Login failed (invalid/expired token, network error, etc.)."""


async def connect_token(token: str) -> dict:
    """Validate a Discord user token and return the account identity.

    Returns ``{"user_id", "username", "display_name", "session_string"}`` where
    ``session_string`` is the token itself (caller must ENCRYPT before storing).
    Raises :class:`DiscordAuthError` if the token is rejected.
    """
    token = (token or "").strip()
    if not token:
        raise DiscordAuthError("No token provided.")

    # A bare HTTP login (no gateway/websocket) is enough to validate the token
    # and read /users/@me — cheap, and we close the session straight after.
    # discord.py requires intents at construction; none are needed for a static
    # login (we never open the gateway here).
    client = discord.Client(intents=discord.Intents.none())
    try:
        data = await client.http.static_login(token)
    except discord.LoginFailure as exc:
        raise DiscordAuthError(f"Invalid Discord token: {exc}") from exc
    except Exception as exc:  # network / unexpected
        raise DiscordAuthError(f"Could not validate token: {exc}") from exc
    finally:
        await client.close()

    user_id = str(data.get("id", ""))
    username = data.get("username") or ""
    # `global_name` is Discord's new display name; fall back to the username.
    display_name = data.get("global_name") or username
    if not user_id:
        raise DiscordAuthError("Login succeeded but no user id was returned.")
    logger.info("Discord account validated: %s (@%s)", user_id, username)
    return {
        "user_id": user_id,
        "username": username,
        "display_name": display_name,
        "session_string": token,
    }
