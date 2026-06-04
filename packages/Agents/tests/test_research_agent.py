"""
tests/test_research_agent.py
─────────────────────────────
Behavioural tests for the Research agent (spawnable worker).

The LLM is always stubbed — the two scoring passes
(``agents.research.agent._score_inbound`` / ``_score_outbound``) are replaced
with canned ``ScoredLead`` lists (or a raise, to exercise the degrade path).
Input buses and the lead store are isolated to a per-test ``tmp_path`` by
rebuilding ``Settings`` against ``AGENT_DATA_DIR``.
"""

from __future__ import annotations

import json

import pytest

from agents.lib import config as config_mod
from agents.lib import guardrails as guardrails_mod
from agents.lib import store as store_mod
from agents.lib.config import Settings
from agents.lib.store import LeadStore
from agents.research import agent as research_agent
from agents.research import run_research
from agents.schemas.research import ScoredLead
from agents.schemas.talk import LeadRecord


@pytest.fixture
def isolated_data(tmp_path, monkeypatch):
    """Point all file-store / activity reads+writes at a fresh temp dir."""
    monkeypatch.setenv("AGENT_DATA_DIR", str(tmp_path))
    fresh = Settings()
    for mod in (config_mod, store_mod, guardrails_mod):
        monkeypatch.setattr(mod, "settings", fresh)
    return fresh


def _seed_conversations(settings, rows):
    settings.conversations_file.parent.mkdir(parents=True, exist_ok=True)
    settings.conversations_file.write_text(json.dumps(rows), encoding="utf-8")


def _seed_members(settings, rows):
    settings.group_members_file.parent.mkdir(parents=True, exist_ok=True)
    settings.group_members_file.write_text(json.dumps(rows), encoding="utf-8")


def _convo(user_id, text="I need help automating outreach"):
    return {
        "brand_id": "default",
        "user_id": user_id,
        "username": f"@{user_id}",
        "group_chat_id": "grp1",
        "text": text,
    }


def _member(user_id, username=None, bio="growth marketer, loves automation"):
    return {
        "brand_id": "default",
        "user_id": user_id,
        "username": f"@{user_id}" if username is None else username,
        "group_chat_id": "grp1",
        "bio": bio,
    }


def _stub(monkeypatch, inbound=None, outbound=None):
    monkeypatch.setattr(
        research_agent, "_score_inbound", lambda niche, convos: inbound or []
    )
    monkeypatch.setattr(
        research_agent, "_score_outbound", lambda niche, members: outbound or []
    )


def test_skip_when_no_data(isolated_data, monkeypatch):
    _stub(monkeypatch)
    result = run_research("default")
    assert result.skipped_no_data is True
    assert LeadStore().all() == []


def test_inbound_and_outbound_saved(isolated_data, monkeypatch):
    _seed_conversations(isolated_data, [_convo("u1")])
    _seed_members(isolated_data, [_member("u2")])
    _stub(
        monkeypatch,
        inbound=[
            ScoredLead(
                user_id="u1", score=85, interest_level="hot",
                pain_points=["slow follow-up"], recommended_approach="offer a demo",
            )
        ],
        outbound=[
            ScoredLead(
                user_id="u2", score=70, interest_level="warm",
                recommended_approach="reference their growth bio",
            )
        ],
    )

    result = run_research("default", niche="AI outreach")

    assert (result.inbound_saved, result.outbound_saved) == (1, 1)
    leads = {l.user_id: l for l in LeadStore().for_brand("default")}
    assert leads["u1"].status == "new" and leads["u1"].source == "inbound"
    assert leads["u1"].interest_level == "hot"
    assert leads["u1"].pain_points == ["slow follow-up"]
    assert leads["u2"].status == "prospect" and leads["u2"].source == "outbound"


def test_below_threshold_dropped(isolated_data, monkeypatch):
    """Inbound < 40 and outbound < prospect_min (50) are not saved."""
    _seed_conversations(isolated_data, [_convo("u1")])
    _seed_members(isolated_data, [_member("u2")])
    _stub(
        monkeypatch,
        inbound=[ScoredLead(user_id="u1", score=20, interest_level="skip")],
        outbound=[ScoredLead(user_id="u2", score=45, interest_level="cool")],
    )

    result = run_research("default")

    assert (result.inbound_saved, result.outbound_saved) == (0, 0)
    assert LeadStore().all() == []


def test_member_without_username_skipped(isolated_data, monkeypatch):
    """A member with no username is filtered out of the outbound pool."""
    # One usable member + one with no username; only the usable one is considered.
    _seed_members(
        isolated_data, [_member("u2"), _member("u3", username="")]
    )
    captured = {}

    def _spy(niche, members):
        captured["members"] = [m.user_id for m in members]
        return []

    monkeypatch.setattr(research_agent, "_score_inbound", lambda n, c: [])
    monkeypatch.setattr(research_agent, "_score_outbound", _spy)

    result = run_research("default")

    assert result.members_considered == 1
    assert captured["members"] == ["u2"]


def test_already_lead_member_skipped(isolated_data, monkeypatch):
    """A member who is already a lead is dropped from the outbound pool."""
    LeadStore().upsert(
        LeadRecord(brand_id="default", user_id="u2", status="prospect", source="talk")
    )
    _seed_members(isolated_data, [_member("u2")])
    _stub(monkeypatch)

    result = run_research("default")

    # Only the pre-existing lead remains; nothing new scored/saved.
    assert result.members_considered == 0
    assert result.outbound_saved == 0
    assert len(LeadStore().for_brand("default")) == 1


def test_double_run_guard(isolated_data, monkeypatch):
    _seed_conversations(isolated_data, [_convo("u1")])
    _stub(monkeypatch, inbound=[ScoredLead(user_id="u1", score=90, interest_level="hot")])

    guardrails_mod.set_state("default", "research", "running")
    result = run_research("default")

    assert result.inbound_saved == 0
    assert LeadStore().all() == []


def test_llm_error_pass_saves_nothing(isolated_data, monkeypatch):
    _seed_conversations(isolated_data, [_convo("u1")])

    def _boom(niche, convos):
        raise RuntimeError("model down")

    monkeypatch.setattr(research_agent, "_score_inbound", _boom)
    monkeypatch.setattr(research_agent, "_score_outbound", lambda n, m: [])

    result = run_research("default")

    assert result.used_llm is False
    assert result.inbound_saved == 0
    assert LeadStore().all() == []
