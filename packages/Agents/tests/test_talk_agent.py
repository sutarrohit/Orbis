"""
tests/test_talk_agent.py
─────────────────────────
Behavioural tests for the Talk agent (message-triggered handler).

The LLM is always stubbed — no live calls — by replacing
``agents.talk.agent._decide_with_llm`` with a canned ``ReplyDecision`` (or a
raise, to exercise the silence-on-error fallback). The file store / activity
feed are isolated to a per-test ``tmp_path`` by rebuilding ``Settings`` against
``AGENT_DATA_DIR`` and patching it into every module that holds a reference.
"""

from __future__ import annotations

import pytest

from agents.lib import config as config_mod
from agents.lib import guardrails as guardrails_mod
from agents.lib import store as store_mod
from agents.lib.config import Settings
from agents.lib.store import LeadStore
from agents.schemas.talk import ReplyDecision, TalkContext
from agents.talk import agent as talk_agent
from agents.talk import decide_reply


@pytest.fixture
def isolated_data(tmp_path, monkeypatch):
    """Point all file-store / activity writes at a fresh temp dir."""
    monkeypatch.setenv("AGENT_DATA_DIR", str(tmp_path))
    fresh = Settings()
    for mod in (config_mod, store_mod, guardrails_mod):
        monkeypatch.setattr(mod, "settings", fresh)
    return fresh


def _ctx(**overrides) -> TalkContext:
    base = dict(
        brand_id="brandA",
        account_id="acct1",
        group_chat_id="grp1",
        message_text="hey everyone",
        sender_user_id="u123",
        sender_username="@alice",
        brand_niche="AI startup founders",
    )
    base.update(overrides)
    return TalkContext(**base)


def _stub_llm(monkeypatch, decision: ReplyDecision):
    monkeypatch.setattr(talk_agent, "_decide_with_llm", lambda ctx: decision)


def test_silence_by_default(isolated_data, monkeypatch):
    """Ordinary chatter → no reply, no lead."""
    _stub_llm(monkeypatch, ReplyDecision(should_reply=False))

    result = decide_reply(_ctx(message_text="lol same"))

    assert result.replied is False
    assert result.lead_saved is False
    assert result.suppressed_reason == ""
    assert result.used_llm is True


def test_engage_and_flag_lead(isolated_data, monkeypatch):
    """A real pain point → reply permitted and the sender saved as a lead."""
    _stub_llm(
        monkeypatch,
        ReplyDecision(
            should_reply=True,
            message="Happy to share how we handle that — want me to DM you?",
            flag_as_lead=True,
            lead_score=75,
        ),
    )

    result = decide_reply(_ctx(message_text="how do you all automate outreach?"))

    assert result.replied is True
    assert result.lead_saved is True

    leads = LeadStore().for_brand("brandA")
    assert len(leads) == 1
    assert leads[0].user_id == "u123"
    assert leads[0].interest_level == "warm"
    assert leads[0].source == "talk"


def test_lead_upsert_is_idempotent(isolated_data, monkeypatch):
    """Flagging the same user twice writes one lead (dedup by brand+user)."""
    _stub_llm(
        monkeypatch,
        ReplyDecision(should_reply=False, flag_as_lead=True, lead_score=65),
    )

    first = decide_reply(_ctx())
    second = decide_reply(_ctx())

    assert first.lead_saved is True
    assert second.lead_saved is False
    assert len(LeadStore().for_brand("brandA")) == 1


def test_low_score_lead_not_saved(isolated_data, monkeypatch):
    """A sub-40 'skip' score is not persisted even when flagged."""
    _stub_llm(
        monkeypatch,
        ReplyDecision(should_reply=False, flag_as_lead=True, lead_score=20),
    )

    result = decide_reply(_ctx())

    assert result.lead_saved is False
    assert LeadStore().for_brand("brandA") == []


def test_rate_limit_forces_silence(isolated_data, monkeypatch):
    """Over the per-account daily cap, a wanted reply is suppressed."""
    monkeypatch.setattr(talk_agent, "MAX_GROUP_REPLIES_PER_DAY", 2)
    _stub_llm(
        monkeypatch,
        ReplyDecision(should_reply=True, message="here's a tip ..."),
    )

    r1 = decide_reply(_ctx())
    r2 = decide_reply(_ctx())
    r3 = decide_reply(_ctx())

    assert (r1.replied, r2.replied) == (True, True)
    assert r3.replied is False
    assert r3.suppressed_reason == "rate_limited"


def test_inactive_account_suppresses_reply(isolated_data, monkeypatch):
    """A paused/restricted account never replies, regardless of the LLM."""
    _stub_llm(
        monkeypatch,
        ReplyDecision(should_reply=True, message="let me help with that"),
    )

    result = decide_reply(_ctx(), account_active=False)

    assert result.replied is False
    assert result.suppressed_reason == "account_inactive"


def test_llm_error_degrades_to_silence(isolated_data, monkeypatch):
    """Any LLM/transport error → silent, non-lead decision (never posts)."""

    def _boom(ctx):
        raise RuntimeError("model down")

    monkeypatch.setattr(talk_agent, "_decide_with_llm", _boom)

    result = decide_reply(_ctx(message_text="how do you automate outreach?"))

    assert result.replied is False
    assert result.lead_saved is False
    assert result.used_llm is False
