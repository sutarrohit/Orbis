"""
tests/test_discord_auth.py
───────────────────────────
``discord_auth.connect_bot`` validates a bot token over Discord's REST API. The
discord.py ``Client`` is stubbed — no network — so we assert the happy path
(returns identity) and the failure paths (empty token, rejected token) raise
``DiscordAuthError``.
"""

from __future__ import annotations

import asyncio

import discord
import pytest

from agents.lib import discord_auth
from agents.lib.discord_auth import DiscordAuthError, connect_bot


class _FakeUser:
    def __init__(self, uid=42, name="mybot", global_name=None):
        self.id = uid
        self.name = name
        self.global_name = global_name


class _OkClient:
    """Logs in fine and exposes a bot user."""

    def __init__(self, **_kwargs):
        self.user = _FakeUser()
        self.closed = False

    async def login(self, _token):  # noqa: D401 - stub
        return None

    async def close(self):
        self.closed = True


class _BadClient:
    def __init__(self, **_kwargs):
        self.user = None
        self.closed = False

    async def login(self, _token):
        raise discord.LoginFailure("401 Unauthorized")

    async def close(self):
        self.closed = True


def test_connect_bot_returns_identity(monkeypatch):
    holder = {}

    def _factory(**kwargs):
        holder["client"] = _OkClient(**kwargs)
        return holder["client"]

    monkeypatch.setattr(discord_auth.discord, "Client", _factory)

    result = asyncio.run(connect_bot("a.real.token"))

    assert result == {
        "user_id": "42",
        "username": "mybot",
        "display_name": "mybot",
        "token": "a.real.token",
    }
    assert holder["client"].closed is True  # session always released


def test_connect_bot_prefers_global_name(monkeypatch):
    client = _OkClient()
    client.user = _FakeUser(name="mybot", global_name="My Bot")
    monkeypatch.setattr(discord_auth.discord, "Client", lambda **kw: client)

    result = asyncio.run(connect_bot("tok"))
    assert result["display_name"] == "My Bot"


def test_connect_bot_empty_token_raises():
    with pytest.raises(DiscordAuthError):
        asyncio.run(connect_bot("   "))


def test_connect_bot_invalid_token_raises(monkeypatch):
    monkeypatch.setattr(discord_auth.discord, "Client", lambda **kw: _BadClient(**kw))
    with pytest.raises(DiscordAuthError):
        asyncio.run(connect_bot("bad-token"))
