"""
seed_dummy_data.py — write dummy data for every agent into Postgres and read it back
────────────────────────────────────────────────────────────────────────────────────
A standalone helper to exercise the database end-to-end without running the
agents. It populates the **bus** tables each agent reads/writes (via the same
repositories in ``agents.lib.store`` the agents use), then reads everything back
and prints it.

What it seeds (all under one brand, default slug "default"):

  * brand_profile  — the Sales knowledge base            (Sales reads)
  * conversation   — inbound messages                    (Research reads → inbound leads)
  * group_member   — scraped members (outbound pool)     (Research reads → prospects)
  * community      — discovered groups                   (Search writes)
  * lead           — flagged leads                        (Talk/Research write, Sales updates)

Rows are tagged with a ``demo_`` prefix so re-running is idempotent and cleanup
is a single flag.

Usage (from packages/Agents):

    uv run python seed_dummy_data.py            # wipe demo rows, seed fresh, read back
    uv run python seed_dummy_data.py --clean    # remove all demo rows and exit
"""

from __future__ import annotations

import argparse

from agents.lib import db
from agents.lib.store import (
    CommunityStore,
    ConversationStore,
    GroupMemberStore,
    LeadStore,
    ProfileStore,
)
from agents.schemas.search import CommunityRecord
from agents.schemas.talk import LeadRecord

BRAND = "default"  # the brand the agents default to
PREFIX = "demo_"  # marks dummy rows for safe cleanup
DEMO_GROUP = "-100demo"


# ─────────────────────────────────────────────────────────────────────────────
# Clean — remove every demo row (so seeding is repeatable)
# ─────────────────────────────────────────────────────────────────────────────


def clean(bid: str) -> None:
    with db.cursor() as cur:
        cur.execute('DELETE FROM lead WHERE "brandId"=%s AND "userId" LIKE %s', (bid, PREFIX + "%"))
        cur.execute('DELETE FROM community WHERE "brandId"=%s AND handle LIKE %s', (bid, "@" + PREFIX + "%"))
        cur.execute('DELETE FROM conversation WHERE "brandId"=%s AND "userId" LIKE %s', (bid, PREFIX + "%"))
        cur.execute('DELETE FROM group_member WHERE "brandId"=%s AND "userId" LIKE %s', (bid, PREFIX + "%"))
        cur.execute('DELETE FROM brand_profile WHERE "brandId"=%s', (bid,))
    print("cleaned all demo rows")


# ─────────────────────────────────────────────────────────────────────────────
# Seed — write dummy data for every agent
# ─────────────────────────────────────────────────────────────────────────────


def seed(bid: str) -> None:
    # 1) brand_profile — what Sales is allowed to speak from (one row per brand).
    with db.cursor() as cur:
        cur.execute(
            'INSERT INTO brand_profile '
            '(id, "brandId", persona, "productSummary", pricing, "conversionAction", '
            '"objectionNotes", "updatedAt") '
            "VALUES (%s, %s, %s, %s, %s, %s, %s, now()) "
            'ON CONFLICT ("brandId") DO UPDATE SET persona=EXCLUDED.persona, '
            '"productSummary"=EXCLUDED."productSummary", pricing=EXCLUDED.pricing, '
            '"conversionAction"=EXCLUDED."conversionAction", '
            '"objectionNotes"=EXCLUDED."objectionNotes", "updatedAt"=now()',
            (
                db.new_id(),
                bid,
                "Friendly, concise expert. No hype.",
                "An AI agent that finds and nurtures leads for founders.",
                "$49/mo, 14-day free trial.",
                "book a 15-min demo call",
                "If they say it's too expensive, point to the free trial.",
            ),
        )

    # 2) conversation — inbound bus (gateway writes; Research reads).
    convos = [
        (f"{PREFIX}u_alice", "@alice", "I'm drowning trying to do outreach manually, any tips?"),
        (f"{PREFIX}u_bob", "@bob", "lol nice gm everyone"),
    ]
    with db.cursor() as cur:
        for uid, un, text in convos:
            cur.execute(
                'INSERT INTO conversation (id, "brandId", "userId", username, '
                '"groupChatId", text, ts) VALUES (%s, %s, %s, %s, %s, %s, now())',
                (db.new_id(), bid, uid, un, DEMO_GROUP, text),
            )

    # 3) group_member — outbound prospect pool (gateway writes; Research reads).
    members = [
        (f"{PREFIX}m_carol", "@carol", "Founder building AI sales tools", "posts daily"),
        (f"{PREFIX}m_dave", "@dave", "crypto day-trader, not really my niche", "quiet"),
    ]
    with db.cursor() as cur:
        for uid, un, bio, act in members:
            cur.execute(
                'INSERT INTO group_member (id, "brandId", "userId", username, '
                '"groupChatId", bio, "activityNote", "updatedAt") '
                "VALUES (%s, %s, %s, %s, %s, %s, %s, now())",
                (db.new_id(), bid, uid, un, DEMO_GROUP, bio, act),
            )

    # 4) community — what Search discovers (idempotent upsert via the store).
    CommunityStore().upsert_many(
        [
            CommunityRecord(
                brand_id=BRAND, handle=f"@{PREFIX}ai_founders", name="AI Founders",
                niche_relevance=88, status="pending_join", source="search",
                found_via="llm", source_url="https://example.com/a",
            ),
            CommunityRecord(
                brand_id=BRAND, handle=f"@{PREFIX}ml_startups", name="ML Startups",
                niche_relevance=72, status="pending_join", source="search",
                found_via="llm", source_url="https://example.com/b",
            ),
        ]
    )

    # 5) lead — what Talk/Research flag (idempotent upsert via the store).
    LeadStore().upsert(
        LeadRecord(
            brand_id=BRAND, user_id=f"{PREFIX}u_alice", username="@alice", score=82,
            interest_level="hot", status="new", source="inbound",
            note="asked for help with outreach", pain_points=["manual outreach"],
            recommended_approach="offer to automate her outreach",
            source_group_chat_id=DEMO_GROUP,
        )
    )
    LeadStore().upsert(
        LeadRecord(
            brand_id=BRAND, user_id=f"{PREFIX}m_carol", username="@carol", score=68,
            interest_level="warm", status="prospect", source="outbound",
            note="founder in our niche", pain_points=["scaling outreach"],
            recommended_approach="reference her AI sales tool",
            source_group_chat_id=DEMO_GROUP,
        )
    )
    print("seeded demo rows for brand", bid)


# ─────────────────────────────────────────────────────────────────────────────
# Read back — through the same stores the agents use
# ─────────────────────────────────────────────────────────────────────────────


def _is_demo(value: str) -> bool:
    return PREFIX in value


def read_back() -> None:
    print("\n=== READ BACK FROM POSTGRES ===")

    profile = ProfileStore().get(BRAND)
    print("\n[brand_profile] (Sales reads)")
    if profile:
        print(f"  persona={profile.persona!r}")
        print(f"  pricing={profile.pricing!r}  cta={profile.conversion_action!r}")

    convos = [c for c in ConversationStore().for_brand(BRAND) if _is_demo(c.user_id)]
    print(f"\n[conversation] (Research inbound) — {len(convos)} rows")
    for c in convos:
        print(f"  {c.username:<10} {c.text!r}")

    members = [m for m in GroupMemberStore().for_brand(BRAND) if _is_demo(m.user_id)]
    print(f"\n[group_member] (Research outbound pool) — {len(members)} rows")
    for m in members:
        print(f"  {m.username:<10} bio={m.bio!r}")

    comms = [c for c in CommunityStore().for_brand(BRAND) if _is_demo(c.handle)]
    print(f"\n[community] (Search output) — {len(comms)} rows")
    for c in comms:
        print(f"  [{c.niche_relevance:3d}] {c.handle:<22} {c.status:<13} {c.name}")

    leads = [l for l in LeadStore().for_brand(BRAND) if _is_demo(l.user_id)]
    print(f"\n[lead] (Talk/Research write, Sales updates) — {len(leads)} rows")
    for l in leads:
        print(f"  {l.username:<10} score={l.score:3d} {l.interest_level:<5} "
              f"{l.status:<9} {l.source:<8} {l.note!r}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed/read dummy agent data in Postgres.")
    parser.add_argument("--clean", action="store_true", help="Remove demo rows and exit.")
    args = parser.parse_args()

    bid = db.resolve_brand_id(BRAND)
    print(f"brand {BRAND!r} -> {bid}")

    if args.clean:
        clean(bid)
        return

    clean(bid)  # start from a clean slate so re-running is idempotent
    seed(bid)
    read_back()
    db.close_pool()


if __name__ == "__main__":
    main()
