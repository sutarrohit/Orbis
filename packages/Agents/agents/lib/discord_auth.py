"""
agents/lib/discord_auth.py — Discord account login (user token)
─────────────────────────────────────────────────────────────────
Connect a Discord **user** account so the gateway can act as it. Unlike
Telegram's multi-step OTP flow, a Discord user account is identified by a single
**user token** the operator supplies. We validate it with one HTTP call
(``GET /users/@me``) and return the account identity; the token itself is the
reusable credential (the caller ENCRYPTS it before storing).

⚠️ User-token automation ("self-bots") violates Discord's Terms of Service and
risks bans. Treat each connected account as disposable.

Uses discord.py-self (imported as ``discord``), which speaks the user API.
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
    client = discord.Client()
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
