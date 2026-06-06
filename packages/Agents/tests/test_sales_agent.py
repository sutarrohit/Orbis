"""
tests/test_sales_agent.py
──────────────────────────
Behavioural tests for the Sales agent (message-triggered handler).

The LLM is always stubbed — ``agents.sales.agent._decide_with_llm`` is replaced
with a canned ``SalesDecision`` (or a raise, for the safe-no-op path). The lead
store / activity feed are isolated to a per-test ``tmp_path``.
"""

from __future__ import annotations

import pytest

from agents.lib import config as config_mod
from agents.lib import guardrails as guardrails_mod
from agents.lib import store as store_mod
from agents.lib.config import Settings
from agents.lib.store import LeadStore
from agents.agent_runners.sales import agent as sales_agent
from agents.agent_runners.sales import decide_reply
from agents.schemas.sales import BrandProfile, SalesContext, SalesDecision
from agents.schemas.talk import LeadRecord


@pytest.fixture
def isolated_data(tmp_path, monkeypatch):
    """Point all file-store / activity reads+writes at a fresh temp dir."""
    monkeypatch.setenv("AGENT_DATA_DIR", str(tmp_path))
    fresh = Settings()
    for mod in (config_mod, store_mod, guardrails_mod):
        monkeypatch.setattr(mod, "settings", fresh)
    return fresh


def _seed_lead(user_id="lead1", status="new"):
    LeadStore().upsert(
        LeadRecord(brand_id="default", user_id=user_id, status=status, source="inbound")
    )


def _ctx(**overrides) -> SalesContext:
    base = dict(
        brand_id="default",
        account_id="acct1",
        lead_user_id="lead1",
        username="@lead1",
        message_text="how much does it cost?",
        profile=BrandProfile(brand_id="default", pricing="Starter $49/mo"),
    )
    base.update(overrides)
    return SalesContext(**base)


def _stub(monkeypatch, decision: SalesDecision):
    monkeypatch.setattr(sales_agent, "_decide_with_llm", lambda ctx, profile: decision)


def test_reply_and_nurturing_update(isolated_data, monkeypatch):
    _seed_lead()
    _stub(
        monkeypatch,
        SalesDecision(
            message="It's $49/mo on Starter — want a quick demo?",
            stage="present",
            new_status="nurturing",
            note="asked about pricing",
        ),
    )

    result = decide_reply(_ctx())

    assert result.sent is True
    assert result.lead_updated is True
    lead = LeadStore().get("default", "lead1")
    assert lead.status == "nurturing"
    assert lead.note == "asked about pricing"
    assert lead.last_outreach_at != ""


def test_conversion_written_back(isolated_data, monkeypatch):
    _seed_lead()
    _stub(
        monkeypatch,
        SalesDecision(
            message="Great — I'll send the call link now.",
            stage="close",
            new_status="converted",
            note="booked a demo",
        ),
    )

    result = decide_reply(_ctx(message_text="yes let's book the call"))

    assert result.sent is True
    assert LeadStore().get("default", "lead1").status == "converted"


def test_explicit_no_marks_lost(isolated_data, monkeypatch):
    _seed_lead()
    _stub(
        monkeypatch,
        SalesDecision(
            message="No problem — I'll leave it there. Reach out anytime.",
            stage="close",
            new_status="lost",
            note="not interested",
        ),
    )

    decide_reply(_ctx(message_text="not interested, please stop"))

    assert LeadStore().get("default", "lead1").status == "lost"


def test_rate_limit_suppresses_send(isolated_data, monkeypatch):
    _seed_lead()
    # Rebuild Settings with the cap lowered (frozen dataclass → can't mutate),
    # and patch it everywhere, including the agent's own `settings` reference.
    monkeypatch.setenv("MAX_SALES_DMS_PER_DAY", "1")
    capped = Settings()
    for mod in (config_mod, store_mod, guardrails_mod, sales_agent):
        monkeypatch.setattr(mod, "settings", capped)
    _stub(monkeypatch, SalesDecision(message="here's the info ...", stage="present"))

    # Distinct message_text each call so dedup doesn't fire first.
    r1 = decide_reply(_ctx(message_text="q1"))
    r2 = decide_reply(_ctx(message_text="q2"))

    assert r1.sent is True
    assert r2.sent is False
    assert r2.suppressed_reason == "rate_limited"


def test_duplicate_inbound_suppressed(isolated_data, monkeypatch):
    _seed_lead()
    _stub(monkeypatch, SalesDecision(message="same answer", stage="present"))

    first = decide_reply(_ctx(message_text="identical"))
    second = decide_reply(_ctx(message_text="identical"))

    assert first.sent is True
    assert second.sent is False
    assert second.suppressed_reason == "duplicate"


def test_inactive_account_suppressed(isolated_data, monkeypatch):
    _seed_lead()
    _stub(monkeypatch, SalesDecision(message="let me help", stage="present"))

    result = decide_reply(_ctx(), account_active=False)

    assert result.sent is False
    assert result.suppressed_reason == "account_inactive"


def test_llm_error_is_safe_noop(isolated_data, monkeypatch):
    _seed_lead(status="nurturing")

    def _boom(ctx, profile):
        raise RuntimeError("model down")

    monkeypatch.setattr(sales_agent, "_decide_with_llm", _boom)

    result = decide_reply(_ctx())

    assert result.sent is False
    assert result.used_llm is False
    assert result.lead_updated is False
    # lead untouched
    assert LeadStore().get("default", "lead1").status == "nurturing"


def test_profile_falls_back_to_store(isolated_data, monkeypatch):
    """With no ctx.profile, the agent loads the BrandProfile from ProfileStore."""
    isolated_data.brand_profiles_file.parent.mkdir(parents=True, exist_ok=True)
    isolated_data.brand_profiles_file.write_text(
        '[{"brand_id": "default", "pricing": "Starter $49/mo"}]', encoding="utf-8"
    )
    _seed_lead()
    captured = {}

    def _spy(ctx, profile):
        captured["pricing"] = profile.pricing
        return SalesDecision(message="ok", stage="qualify")

    monkeypatch.setattr(sales_agent, "_decide_with_llm", _spy)

    decide_reply(_ctx(profile=None))

    assert captured["pricing"] == "Starter $49/mo"
