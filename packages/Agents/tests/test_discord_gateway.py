"""
tests/test_discord_gateway.py
──────────────────────────────
Unit tests for the Discord gateway with no DB and no real Discord connection —
the store and the discord.py client are faked and injected.

Covers:
  - sender.drain_once: delivers a queued DM, marks sent; no client → failed;
    a send error → failed.
  - DiscordGatewayClients: register/get/remove/stop_all, and connect_new's
    skip-already-connected reconciliation.
  - listeners._handle_dm: a known lead gets a reply; an unknown user does not.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

from agents.gateway.discord import client_manager as cm
from agents.gateway.discord import listeners
from agents.gateway.discord.client_manager import DiscordGatewayClients
from agents.gateway.discord.sender import drain_once


# ─────────────────────────────────────────────────────────────────────────────
# sender.drain_once
# ─────────────────────────────────────────────────────────────────────────────


class _FakeStore:
    def __init__(self, rows):
        self._rows = rows
        self.sent = []
        self.failed = []

    def next_queued(self, _limit):
        return self._rows

    def mark_sent(self, send_id):
        self.sent.append(send_id)

    def mark_failed(self, send_id):
        self.failed.append(send_id)


class _FakeUser:
    def __init__(self, sink, raises=None):
        self._sink = sink
        self._raises = raises

    async def send(self, message):
        if self._raises is not None:
            raise self._raises
        self._sink.append(message)


class _FakeClient:
    def __init__(self, raises=None):
        self.sink = []
        self._raises = raises

    def get_user(self, _uid):
        return _FakeUser(self.sink, self._raises)

    async def fetch_user(self, _uid):  # pragma: no cover - get_user always hits
        return _FakeUser(self.sink, self._raises)


class _FakeClients:
    def __init__(self, mapping):
        self._mapping = mapping

    def get(self, account_id):
        return self._mapping.get(account_id)


def _row(send_id="s1", account_id="a1", to="100", message="hi"):
    return {"id": send_id, "account_id": account_id, "to_user_id": to, "message": message, "stage": "intro"}


def test_drain_sends_and_marks_sent():
    client = _FakeClient()
    clients = _FakeClients({"a1": {"client": client}})
    store = _FakeStore([_row()])

    result = asyncio.run(drain_once(clients, store=store))

    assert result == {"considered": 1, "sent": 1, "failed": 0}
    assert store.sent == ["s1"]
    assert client.sink == ["hi"]


def test_drain_no_client_marks_failed():
    clients = _FakeClients({})  # account not connected
    store = _FakeStore([_row(account_id="missing")])

    result = asyncio.run(drain_once(clients, store=store))

    assert result["failed"] == 1
    assert store.failed == ["s1"]


def test_drain_send_error_marks_failed():
    client = _FakeClient(raises=ValueError("boom"))
    clients = _FakeClients({"a1": {"client": client}})
    store = _FakeStore([_row()])

    result = asyncio.run(drain_once(clients, store=store))

    assert result["failed"] == 1
    assert store.failed == ["s1"]
    assert store.sent == []


# ─────────────────────────────────────────────────────────────────────────────
# DiscordGatewayClients
# ─────────────────────────────────────────────────────────────────────────────


class _ManagedClient:
    def __init__(self):
        self.closed = False

    def is_closed(self):
        return self.closed

    async def close(self):
        self.closed = True


def test_registry_register_get_remove():
    clients = DiscordGatewayClients()
    c = _ManagedClient()
    clients.register("a1", c, "brand", "ext1")

    assert clients.account_ids() == ["a1"]
    assert clients.get("a1")["client"] is c

    asyncio.run(clients.remove("a1"))
    assert clients.get("a1") is None
    assert c.closed is True


def test_stop_all_closes_every_client():
    clients = DiscordGatewayClients()
    a, b = _ManagedClient(), _ManagedClient()
    clients.register("a1", a, "brand", "ext1")
    clients.register("a2", b, "brand", "ext2")

    asyncio.run(clients.stop_all())

    assert a.closed and b.closed
    assert clients.account_ids() == []


def test_connect_new_skips_already_connected(monkeypatch):
    # Two active discord accounts; one is already in the registry.
    accounts = [
        {"id": "a1", "brand_id": "b", "external_id": "e1", "handle": "", "session_string": "x"},
        {"id": "a2", "brand_id": "b", "external_id": "e2", "handle": "", "session_string": "y"},
    ]
    monkeypatch.setattr(
        cm, "SocialAccountStore", lambda: SimpleNamespace(all_active=lambda _p: accounts)
    )

    clients = DiscordGatewayClients()
    clients.register("a1", _ManagedClient(), "b", "e1")  # already connected

    connected_ids = []

    async def _fake_connect(acc):
        connected_ids.append(acc["id"])
        clients.register(acc["id"], _ManagedClient(), acc["brand_id"], acc["external_id"])
        return True

    monkeypatch.setattr(clients, "_connect_account", _fake_connect)

    added = asyncio.run(clients.connect_new())

    assert added == 1
    assert connected_ids == ["a2"]  # a1 skipped, only a2 connected


# ─────────────────────────────────────────────────────────────────────────────
# listeners._handle_dm
# ─────────────────────────────────────────────────────────────────────────────


class _FakeChannel:
    def __init__(self):
        self.sent = []

    def history(self, limit=0):  # async iterator yielding no prior messages
        async def _gen():
            if False:  # pragma: no cover
                yield None

        return _gen()

    async def send(self, message):
        self.sent.append(message)


def _dm(content="how much?"):
    author = SimpleNamespace(id=555, name="alice", bot=False)
    channel = _FakeChannel()
    message = SimpleNamespace(author=author, content=content, id=1, channel=channel, guild=None)
    client = SimpleNamespace(brand_id="default", account_id="acct1", user=SimpleNamespace(id=999))
    return client, message, channel


def _patch_stores(monkeypatch, lead):
    monkeypatch.setattr(listeners, "LeadStore", lambda: SimpleNamespace(get=lambda _b, _u: lead))
    monkeypatch.setattr(listeners, "ConversationStore", lambda: SimpleNamespace(add=lambda *a, **k: None))


def test_handle_dm_known_lead_replies(monkeypatch):
    _patch_stores(monkeypatch, lead=SimpleNamespace(status="new"))
    calls = []

    def _sales(ctx):
        calls.append(ctx)
        return SimpleNamespace(sent=True, decision=SimpleNamespace(message="here's pricing"))

    monkeypatch.setattr(listeners, "sales_decide", _sales)

    client, message, channel = _dm()
    asyncio.run(listeners._handle_dm(client, message))

    assert len(calls) == 1
    assert channel.sent == ["here's pricing"]


def test_handle_dm_unknown_user_ignored(monkeypatch):
    _patch_stores(monkeypatch, lead=None)  # not a known lead
    called = []
    monkeypatch.setattr(listeners, "sales_decide", lambda ctx: called.append(ctx))

    client, message, channel = _dm()
    asyncio.run(listeners._handle_dm(client, message))

    assert called == []  # Sales never consulted
    assert channel.sent == []  # and nothing sent
