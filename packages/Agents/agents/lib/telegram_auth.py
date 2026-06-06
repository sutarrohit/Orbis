"""
agents/lib/telegram_auth.py — Telegram account login (MTProto / Pyrogram)
──────────────────────────────────────────────────────────────────────────
The interactive login that connects a Telegram **user** account so the gateway
can act as it. Telegram user-account auth is multi-step:

    send_code(phone)        → Telegram sends an OTP, returns a phone_code_hash
    verify_code(phone,code) → sign in; if the account has 2FA → needs_password
    verify_password(pwd)    → finish 2FA
    → SUCCESS: export a SESSION STRING (the reusable credential)

The in-progress login (a connected Pyrogram client + phone_code_hash) is held in
memory keyed by phone for a few minutes between steps. The resulting session
string is the only thing persisted — encrypted — by the caller.

Requires TELEGRAM_API_ID / TELEGRAM_API_HASH (one app credential, shared across
all accounts). Pyrogram is async, so these are coroutines.
"""

from __future__ import annotations

import logging
import time

from pyrogram import Client
from pyrogram.errors import SessionPasswordNeeded

from agents.lib.config import settings

logger = logging.getLogger(__name__)

# In-progress logins: phone -> {client, phone_code_hash, created_at}. Pruned by TTL.
_PENDING: dict[str, dict] = {}
_PENDING_TTL = 600  # seconds (Telegram codes expire quickly anyway)


class TelegramAuthError(RuntimeError):
    """A login step failed (bad code, expired, no pending login, etc.)."""


def _require_app_creds() -> tuple[int, str]:
    if not settings.telegram_api_id or not settings.telegram_api_hash:
        raise TelegramAuthError(
            "TELEGRAM_API_ID / TELEGRAM_API_HASH are not set; cannot log in."
        )
    return settings.telegram_api_id, settings.telegram_api_hash


def _prune() -> None:
    now = time.time()
    for phone in [p for p, e in _PENDING.items() if now - e["created_at"] > _PENDING_TTL]:
        _PENDING.pop(phone, None)


async def _discard(phone: str) -> None:
    entry = _PENDING.pop(phone, None)
    if entry:
        try:
            await entry["client"].disconnect()
        except Exception:  # best-effort cleanup
            pass


async def send_code(phone: str) -> None:
    """Step 1: ask Telegram to send an OTP to ``phone``.

    Connects a fresh in-memory Pyrogram client and keeps it alive (with the
    returned phone_code_hash) for the verify step.
    """
    _prune()
    api_id, api_hash = _require_app_creds()
    await _discard(phone)  # restart any stale attempt for this number

    client = Client(
        name=f"login:{phone}", api_id=api_id, api_hash=api_hash, in_memory=True
    )
    await client.connect()
    try:
        sent = await client.send_code(phone)
    except Exception as exc:
        await client.disconnect()
        raise TelegramAuthError(f"Could not send code: {exc}") from exc
    _PENDING[phone] = {
        "client": client,
        "phone_code_hash": sent.phone_code_hash,
        "created_at": time.time(),
    }
    logger.info("OTP sent to %s", phone)


async def verify_code(phone: str, code: str) -> dict:
    """Step 2: submit the OTP.

    Returns ``{"status": "password_needed"}`` if the account has 2FA, otherwise
    ``{"status": "connected", **account}`` with the exported session string.
    """
    entry = _PENDING.get(phone)
    if not entry:
        raise TelegramAuthError("No pending login for this phone; send a code first.")
    client: Client = entry["client"]
    try:
        await client.sign_in(phone, entry["phone_code_hash"], code)
    except SessionPasswordNeeded:
        return {"status": "password_needed"}
    except Exception as exc:
        raise TelegramAuthError(f"Code verification failed: {exc}") from exc
    return {"status": "connected", **await _finalize(phone, client)}


async def verify_password(phone: str, password: str) -> dict:
    """Step 3 (only if 2FA): submit the cloud password, then finish login."""
    entry = _PENDING.get(phone)
    if not entry:
        raise TelegramAuthError("No pending login for this phone; send a code first.")
    client: Client = entry["client"]
    try:
        await client.check_password(password)
    except Exception as exc:
        raise TelegramAuthError(f"Password verification failed: {exc}") from exc
    return {"status": "connected", **await _finalize(phone, client)}


async def _finalize(phone: str, client: Client) -> dict:
    """Export the session string + account identity, then disconnect/clean up."""
    me = await client.get_me()
    session_string = await client.export_session_string()
    try:
        await client.disconnect()
    finally:
        _PENDING.pop(phone, None)
    return {
        "user_id": str(me.id),
        "username": me.username or "",
        "display_name": " ".join(filter(None, [me.first_name, me.last_name])) or "",
        "session_string": session_string,  # caller must ENCRYPT before storing
    }
