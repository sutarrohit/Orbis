"""
agents/schemas/account.py
──────────────────────────
Request/response models for the Telegram account-login flow and account
management. The session string is never returned to the client.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class SendCodeRequest(BaseModel):
    brand_id: str = Field(default="default", description="Brand the account belongs to.")
    phone: str = Field(description="The account's phone number in +country format.")


class VerifyCodeRequest(BaseModel):
    brand_id: str = Field(default="default")
    phone: str
    code: str = Field(description="The OTP Telegram sent to the account.")


class VerifyPasswordRequest(BaseModel):
    brand_id: str = Field(default="default")
    phone: str
    password: str = Field(description="The account's 2FA cloud password.")


class ConnectTokenRequest(BaseModel):
    """Discord connect — a bot is identified by a single bot token (no OTP)."""

    brand_id: str = Field(default="default", description="Brand the account belongs to.")
    token: str = Field(description="The Discord bot token (login credential).")


class AccountView(BaseModel):
    """A safe view of a stored account — never includes the session string."""

    id: str
    external_id: str
    handle: str = ""
    phone: str | None = None
    display_name: str | None = None
    platform: str = "telegram"
    status: str = "active"
    last_health_check_at: str = ""
    created_at: str = ""


class LoginStepResult(BaseModel):
    """Result of a verify step. ``password_needed`` means submit the 2FA password
    next; ``connected`` means the account was stored and is ready."""

    status: Literal["code_sent", "password_needed", "connected"]
    account: AccountView | None = None
