"""
tests/test_discord_gateway.py
──────────────────────────────
Behavioural tests for the Discord gateway (sender / joiner / listeners / auth).

These run WITHOUT a database and WITHOUT discord.py-self installed:
  * a minimal fake ``discord`` module is injected into ``sys.modules`` (only if
    the real one isn't importable) so the gateway modules import;
  * the sender takes an injectable store + a fake client registry, so no DB;
  * the joiner's store classes are monkeypatched to in-memory fakes;
  * coroutines are driven with ``asyncio.run`` (no pytest-asyncio dependency).

The point is to lock the gateway's *logic* (routing dm vs channel, marking
sent/failed, join→scrape→note, dead-account handling, the listener guard) — not
to exercise the real Discord API.
"""

from __future__ import annotations

import asyncio
import sys
import types

import pytest

# ── Make ``discord`` importable (real if installed, else a tiny fake) ─────────
def _discord_is_complete() -> bool:
    """True only if a full discord lib (with Intents + Client) is importable."""
    try:
        import discord  # noqa: F401
    except Exception:
        return False
    return hasattr(discord, "Intents") and hasattr(discord, "Client")


if not _discord_is_complete():  # use a controlled stub unless a full lib is present
    _fake = types.ModuleType("discord")

    class _LoginFailure(Exception):
        pass

    class _HTTPException(Exception):
        def __init__(self, message: str = "", *, status=None, retry_after=None):
            super().__init__(message)
            self.status = status
            self.retry_after = retry_after

    class _Client:  # placeholder; tests inject their own fakes where needed
        def __init__(self, *a, **k):
            pass

    class _Intents:  # discord.py requires intents at Client construction
        def __init__(self):
            self.message_content = False
            self.members = False

        @classmethod
        def none(cls):
            return cls()

        @classmethod
        def default(cls):
            return cls()

    _fake.LoginFailure = _LoginFailure
    _fake.HTTPException = _HTTPException
    _fake.Client = _Client
    _fake.Intents = _Intents
    sys.modules["discord"] = _fake

import discord  # noqa: E402  (now guaranteed importable)

from agents.gateway.discord import joiner, listeners, sender  # noqa: E402
from agents.lib import discord_auth  # noqa: E402
from agents.lib.discord_auth import DiscordAuthError  # noqa: E402


# ── Shared fakes ─────────────────────────────────────────────────────────────


class FakeSendable:
    """Stands in for a discord User or channel: records what was sent."""

    def __init__(self, *, raises: Exception | None = None):
        self.sent: list[str] = []
        self._raises = raises

    async def send(self, message: str) -> None:
        if self._raises is not None:
            raise self._raises
        self.sent.append(message)


class FakeClients:
    """Stands in for DiscordGatewayClients.get()."""

    def __init__(self, mapping: dict):
        self._mapping = mapping

    def get(self, account_id: str):
        return self._mapping.get(account_id)


class FakeStore:
    """Injectable PendingSendStore for the sender."""

    def __init__(self, rows: list[dict]):
        self.rows = rows
        self.sent: list[str] = []
        self.failed: list[str] = []

    def next_queued(self, limit: int, platform: str | None = None) -> list[dict]:
        assert platform == "discord"
        return self.rows[:limit]

    def mark_sent(self, send_id: str) -> None:
        self.sent.append(send_id)

    def mark_failed(self, send_id: str) -> None:
        self.failed.append(send_id)


def _row(**overrides) -> dict:
    base = {
        "id": "send1",
        "account_id": "acc1",
        "to_user_id": "999",
        "kind": "dm",
        "target_id": None,
        "message": "hello there",
        "stage": 0,
    }
    base.update(overrides)
    return base


# ── Sender ───────────────────────────────────────────────────────────────────


def test_sender_dm_delivers_and_marks_sent():
    user = FakeSendable()

    class C:
        def get_user(self, uid):
            return user

        async def fetch_user(self, uid):
            return user

    clients = FakeClients({"acc1": {"client": C()}})
    store = FakeStore([_row(message="hi lead")])

    result = asyncio.run(sender.drain_once(clients, store=store))

    assert result == {"considered": 1, "sent": 1, "failed": 0}
    assert store.sent == ["send1"]
    assert user.sent == ["hi lead"]


def test_sender_channel_post_uses_channel():
    channel = FakeSendable()

    class C:
        def get_channel(self, cid):
            return channel

        async def fetch_channel(self, cid):
            return channel

    clients = FakeClients({"acc1": {"client": C()}})
    store = FakeStore([_row(kind="channel_post", target_id="555", to_user_id=None, message="promo!")])

    result = asyncio.run(sender.drain_once(clients, store=store))

    assert result["sent"] == 1
    assert channel.sent == ["promo!"]
    assert store.sent == ["send1"]


def test_sender_no_client_marks_failed():
    clients = FakeClients({})  # account not connected
    store = FakeStore([_row()])

    result = asyncio.run(sender.drain_once(clients, store=store))

    assert result["failed"] == 1
    assert store.failed == ["send1"]
    assert store.sent == []


def test_sender_delivery_error_marks_failed():
    user = FakeSendable(raises=RuntimeError("boom"))

    class C:
        def get_user(self, uid):
            return user

        async def fetch_user(self, uid):
            return user

    clients = FakeClients({"acc1": {"client": C()}})
    store = FakeStore([_row()])

    result = asyncio.run(sender.drain_once(clients, store=store))

    assert result["failed"] == 1
    assert store.failed == ["send1"]


def test_sender_dead_account_is_handled(monkeypatch):
    called = {}

    async def fake_handle_dead(clients, account_id, reason=""):
        called["account_id"] = account_id

    monkeypatch.setattr(sender.health, "is_account_dead", lambda exc: True)
    monkeypatch.setattr(sender.health, "handle_dead_account", fake_handle_dead)

    user = FakeSendable(raises=RuntimeError("session dead"))

    class C:
        def get_user(self, uid):
            return user

        async def fetch_user(self, uid):
            return user

    clients = FakeClients({"acc1": {"client": C()}})
    store = FakeStore([_row()])

    result = asyncio.run(sender.drain_once(clients, store=store))

    assert called.get("account_id") == "acc1"
    assert result["failed"] == 1
    assert store.failed == ["send1"]


# ── Discord auth ─────────────────────────────────────────────────────────────


def _auth_client_factory(*, data=None, exc=None):
    class FakeHttp:
        async def static_login(self, token):
            if exc is not None:
                raise exc
            return data

    class FakeClient:
        def __init__(self, *args, **kwargs):  # accept intents=...
            self.http = FakeHttp()

        async def close(self):
            pass

    return FakeClient


def test_connect_token_returns_identity(monkeypatch):
    monkeypatch.setattr(
        discord_auth.discord,
        "Client",
        _auth_client_factory(data={"id": "123", "username": "bob", "global_name": "Bob B"}),
    )

    result = asyncio.run(discord_auth.connect_token("  tok-abc  "))

    assert result["user_id"] == "123"
    assert result["username"] == "bob"
    assert result["display_name"] == "Bob B"
    # The token itself is the credential — trimmed, ready for the caller to encrypt.
    assert result["session_string"] == "tok-abc"


def test_connect_token_falls_back_to_username_for_display(monkeypatch):
    monkeypatch.setattr(
        discord_auth.discord,
        "Client",
        _auth_client_factory(data={"id": "7", "username": "neo", "global_name": None}),
    )

    result = asyncio.run(discord_auth.connect_token("t"))

    assert result["display_name"] == "neo"


def test_connect_token_empty_raises():
    with pytest.raises(DiscordAuthError):
        asyncio.run(discord_auth.connect_token("   "))


def test_connect_token_invalid_raises(monkeypatch):
    monkeypatch.setattr(
        discord_auth.discord,
        "Client",
        _auth_client_factory(exc=discord_auth.discord.LoginFailure("bad token")),
    )

    with pytest.raises(DiscordAuthError):
        asyncio.run(discord_auth.connect_token("nope"))


# ── Joiner ───────────────────────────────────────────────────────────────────


class FakeMember:
    def __init__(self, mid, name, bot=False):
        self.id = mid
        self.name = name
        self.bot = bot


class FakeGuild:
    def __init__(self, gid, members):
        self.id = gid
        self._members = members

    async def fetch_members(self, limit=None):
        for m in self._members[: (limit or len(self._members))]:
            yield m


class FakeJoinClient:
    """A bot client: it's already in `guild` (invited via OAuth); get_guild
    resolves it by id, returns None for any other id."""

    def __init__(self, guild):
        self._guild = guild

    def get_guild(self, gid):
        if self._guild is not None and gid == self._guild.id:
            return self._guild
        return None


class FakeCommunityStore:
    def __init__(self, pending):
        self._pending = pending
        self.joined: list[tuple] = []
        self.rejected: list[str] = []
        self.notes: list[tuple] = []

    def pending_join_assigned(self, limit, platform=None):
        assert platform == "discord"
        return self._pending

    def mark_joined(self, cid, gid):
        self.joined.append((cid, gid))

    def mark_rejected(self, cid):
        self.rejected.append(cid)

    def set_note(self, cid, note):
        self.notes.append((cid, note))

    def pending_leave(self, platform=None):
        return []


class FakeGroupMemberStore:
    def __init__(self):
        self.upserted: list = []

    def upsert_many(self, records):
        self.upserted.extend(records)
        return (len(records), 0)


def _wire_joiner(monkeypatch, comm, gm):
    monkeypatch.setattr(joiner, "CommunityStore", lambda: comm)
    monkeypatch.setattr(joiner, "GroupMemberStore", lambda: gm)


def test_joiner_joins_and_scrapes(monkeypatch):
    members = [FakeMember(1, "alice"), FakeMember(2, "bot", bot=True), FakeMember(3, "")]
    guild = FakeGuild(42, members)
    client = FakeJoinClient(guild)
    clients = FakeClients({"acc1": {"client": client}})

    pending = [{"id": "c1", "brand_id": "b1", "handle": "42", "assigned_account_id": "acc1"}]
    comm = FakeCommunityStore(pending)
    gm = FakeGroupMemberStore()
    _wire_joiner(monkeypatch, comm, gm)

    result = asyncio.run(joiner.join_and_scrape_once(clients))

    assert result["joined"] == 1
    assert comm.joined == [("c1", "42")]
    # Only the real, named member is scraped (bot + no-username skipped).
    assert [m.user_id for m in gm.upserted] == ["1"]
    assert gm.upserted[0].group_chat_id == "42"
    assert comm.notes == [("c1", "scraped 1 members")]


def test_joiner_rejects_invalid_handle(monkeypatch):
    client = FakeJoinClient(FakeGuild(42, []))
    clients = FakeClients({"acc1": {"client": client}})

    pending = [{"id": "c1", "brand_id": "b1", "handle": "not-a-server-id", "assigned_account_id": "acc1"}]
    comm = FakeCommunityStore(pending)
    gm = FakeGroupMemberStore()
    _wire_joiner(monkeypatch, comm, gm)

    result = asyncio.run(joiner.join_and_scrape_once(clients))

    assert result["rejected"] == 1
    assert comm.rejected == ["c1"]
    assert comm.joined == []


def test_joiner_waits_when_bot_not_in_guild(monkeypatch):
    client = FakeJoinClient(FakeGuild(42, []))  # bot is in guild 42, not 999
    clients = FakeClients({"acc1": {"client": client}})

    pending = [{"id": "c1", "brand_id": "b1", "handle": "999", "assigned_account_id": "acc1"}]
    comm = FakeCommunityStore(pending)
    gm = FakeGroupMemberStore()
    _wire_joiner(monkeypatch, comm, gm)

    result = asyncio.run(joiner.join_and_scrape_once(clients))

    assert result["skipped"] == 1
    assert comm.joined == []
    assert comm.rejected == []


def test_joiner_skips_when_account_not_connected(monkeypatch):
    clients = FakeClients({})  # assigned account isn't online

    pending = [{"id": "c1", "brand_id": "b1", "handle": "x", "assigned_account_id": "acc1"}]
    comm = FakeCommunityStore(pending)
    gm = FakeGroupMemberStore()
    _wire_joiner(monkeypatch, comm, gm)

    result = asyncio.run(joiner.join_and_scrape_once(clients))

    assert result["skipped"] == 1
    assert comm.joined == []
    assert comm.rejected == []


# ── Listener routing guard ───────────────────────────────────────────────────


class _Author:
    def __init__(self, aid, bot=False):
        self.id = aid
        self.bot = bot


class _Msg:
    def __init__(self, author, content, guild=None):
        self.author = author
        self.content = content
        self.guild = guild


class _Me:
    id = 1000


class _ClientWithUser:
    user = _Me()


def _run_route(monkeypatch, message):
    seen = {"dm": 0, "group": 0}

    async def fake_dm(client, msg, brand_id, account_id):
        seen["dm"] += 1

    async def fake_group(client, msg, brand_id, account_id):
        seen["group"] += 1

    monkeypatch.setattr(listeners, "_handle_dm", fake_dm)
    monkeypatch.setattr(listeners, "_handle_group", fake_group)
    asyncio.run(listeners._route(_ClientWithUser(), message, "b1", "acc1"))
    return seen


def test_route_ignores_own_messages(monkeypatch):
    seen = _run_route(monkeypatch, _Msg(_Author(1000), "hi"))  # author == me
    assert seen == {"dm": 0, "group": 0}


def test_route_ignores_bots_and_empty(monkeypatch):
    assert _run_route(monkeypatch, _Msg(_Author(5, bot=True), "hi")) == {"dm": 0, "group": 0}
    assert _run_route(monkeypatch, _Msg(_Author(5), "")) == {"dm": 0, "group": 0}


def test_route_dispatches_dm_vs_group(monkeypatch):
    assert _run_route(monkeypatch, _Msg(_Author(5), "hello"))["dm"] == 1  # no guild → DM
    assert _run_route(monkeypatch, _Msg(_Author(5), "hello", guild=object()))["group"] == 1
