"""
routers/accounts.py
────────────────────
HTTP endpoints for connecting and managing Telegram accounts.

The login is the 2-3 step MTProto flow (Implentation.md account feature):

    POST /accounts/send-code        {brand_id, phone}            -> code_sent
    POST /accounts/verify-code      {brand_id, phone, code}      -> connected | password_needed
    POST /accounts/verify-password  {brand_id, phone, password}  -> connected
    GET  /accounts?brand_id=...                                  -> list (no secrets)
    POST /accounts/{id}/status      {status}                     -> activate/pause/restrict
    DELETE /accounts/{id}?brand_id=...                           -> remove

On a successful login the exported session string is **encrypted** and stored on
the account row; it is never returned to the client.

Wire into the app with::

    from routers import accounts
    app.include_router(accounts.router, prefix="/api", tags=["Accounts"])
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from agents.lib import crypto, discord_auth, telegram_auth
from agents.lib.discord_auth import DiscordAuthError
from agents.lib.store import SocialAccountStore
from agents.lib.telegram_auth import TelegramAuthError
from agents.schemas.account import (
    AccountView,
    ConnectTokenRequest,
    LoginStepResult,
    SendCodeRequest,
    VerifyCodeRequest,
    VerifyPasswordRequest,
)

router = APIRouter()

_store = SocialAccountStore()


def _store_account(brand_id: str, phone: str, result: dict) -> AccountView:
    """Persist a freshly connected account (encrypting the session string)."""
    view = _store.upsert(
        brand_id,
        external_id=result["user_id"],
        handle=result.get("username", ""),
        phone=phone,
        display_name=result.get("display_name") or None,
        session_string=crypto.encrypt(result["session_string"]),
        status="active",
    )
    return AccountView(**view)


@router.post("/accounts/send-code", response_model=LoginStepResult)
async def send_code(req: SendCodeRequest) -> LoginStepResult:
    """Step 1 — Telegram sends an OTP to the account's phone."""
    try:
        await telegram_auth.send_code(req.phone)
    except TelegramAuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return LoginStepResult(status="code_sent")


@router.post("/accounts/verify-code", response_model=LoginStepResult)
async def verify_code(req: VerifyCodeRequest) -> LoginStepResult:
    """Step 2 — submit the OTP. May ask for the 2FA password next."""
    try:
        result = await telegram_auth.verify_code(req.phone, req.code)
    except TelegramAuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if result["status"] == "password_needed":
        return LoginStepResult(status="password_needed")
    return LoginStepResult(
        status="connected", account=_store_account(req.brand_id, req.phone, result)
    )


@router.post("/accounts/verify-password", response_model=LoginStepResult)
async def verify_password(req: VerifyPasswordRequest) -> LoginStepResult:
    """Step 3 — submit the 2FA cloud password (only when prompted)."""
    try:
        result = await telegram_auth.verify_password(req.phone, req.password)
    except TelegramAuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return LoginStepResult(
        status="connected", account=_store_account(req.brand_id, req.phone, result)
    )


@router.post("/accounts/discord/connect", response_model=LoginStepResult)
async def discord_connect(req: ConnectTokenRequest) -> LoginStepResult:
    """Connect a Discord user account from its token (single step, no OTP).

    The token is validated against Discord, then **encrypted** and stored exactly
    like a Telegram session string. Never returned to the client.
    """
    try:
        result = await discord_auth.connect_token(req.token)
    except DiscordAuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    view = _store.upsert(
        req.brand_id,
        external_id=result["user_id"],
        handle=result.get("username", ""),
        display_name=result.get("display_name") or None,
        session_string=crypto.encrypt(result["session_string"]),
        status="active",
        platform="discord",
    )
    return LoginStepResult(status="connected", account=AccountView(**view))


@router.get("/accounts", response_model=list[AccountView])
def list_accounts(brand_id: str = "default") -> list[AccountView]:
    """List the brand's accounts (never includes session strings)."""
    return [AccountView(**v) for v in _store.list_for_brand(brand_id)]


@router.post("/accounts/{account_id}/status", response_model=AccountView)
def set_status(account_id: str, status: str, brand_id: str = "default") -> AccountView:
    """Activate / pause / restrict an account."""
    if status not in {"active", "paused", "restricted"}:
        raise HTTPException(status_code=400, detail="invalid status")
    if not _store.set_status(brand_id, account_id, status):
        raise HTTPException(status_code=404, detail="account not found")
    views = {v["id"]: v for v in _store.list_for_brand(brand_id)}
    return AccountView(**views[account_id])


@router.delete("/accounts/{account_id}", status_code=204)
def delete_account(account_id: str, brand_id: str = "default") -> None:
    """Remove an account (e.g. to disconnect it)."""
    if not _store.delete(brand_id, account_id):
        raise HTTPException(status_code=404, detail="account not found")
