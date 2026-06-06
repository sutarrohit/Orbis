"""
agents/gateway/joiner.py — Phase 4 (join + scrape)
──────────────────────────────────────────────────────
Search discovers communities (``status=pending_join``); the Leader assigns each
to an account. This loop is what actually **joins** them and **scrapes** members
into the outbound pool (Research reads those).

  pending_join + assigned account → join_chat → set joined + groupChatId
                                  → scrape members → group_member rows

Joining is paced (joining many groups fast looks spammy → bans). A hard join
failure marks the community ``rejected`` so we don't retry it forever; a
FloodWait just backs off and leaves it pending.
"""

from __future__ import annotations

import asyncio
import logging

from pyrogram.errors import FloodWait

from agents.constants.gateway import (
    JOIN_BATCH,
    JOIN_PACE_SECONDS,
    JOIN_POLL_INTERVAL,
    SCRAPE_LIMIT,
)
from agents.gateway import health
from agents.lib.store import CommunityStore, GroupMemberStore
from agents.schemas.research import GroupMemberRecord

logger = logging.getLogger(__name__)


async def _scrape_members(client, chat_id, brand_id: str, group_chat_id: str) -> list:
    """Scrape up to SCRAPE_LIMIT real members with a username (skip bots/deleted)."""
    members: list[GroupMemberRecord] = []
    async for m in client.get_chat_members(chat_id, limit=SCRAPE_LIMIT):
        u = getattr(m, "user", None)
        if not u or getattr(u, "is_bot", False) or getattr(u, "is_deleted", False):
            continue
        if not u.username:
            continue  # no username → Research can't reach them anyway
        members.append(
            GroupMemberRecord(
                brand_id=brand_id,
                user_id=str(u.id),
                username=u.username,
                group_chat_id=group_chat_id,
            )
        )
    return members


async def join_and_scrape_once(clients, *, pace: float = 0.0) -> dict:
    """One pass: join each assigned pending community and scrape its members."""
    communities = CommunityStore()
    pending = await asyncio.to_thread(communities.pending_join_assigned, JOIN_BATCH)
    joined = scraped = rejected = skipped = 0
    for c in pending:
        entry = clients.get(c["assigned_account_id"])
        if entry is None:
            skipped += 1  # assigned account not connected; try again later
            continue
        client = entry["client"]
        try:
            chat = await client.join_chat(c["handle"])
        except FloodWait as exc:
            logger.warning("FloodWait %ss joining %s — backing off.", exc.value, c["handle"])
            await asyncio.sleep(int(exc.value))
            continue  # leave pending
        except Exception as exc:
            if health.is_account_dead(exc):
                # The account's session is dead — not the community's fault;
                # drop the account and leave the community pending for reassignment.
                await health.handle_dead_account(clients, c["assigned_account_id"], str(exc))
                skipped += 1
                continue
            logger.warning("Join %s failed: %s — marking rejected.", c["handle"], exc)
            await asyncio.to_thread(communities.mark_rejected, c["id"])
            rejected += 1
            continue

        group_chat_id = str(chat.id)
        await asyncio.to_thread(communities.mark_joined, c["id"], group_chat_id)
        joined += 1

        try:
            members = await _scrape_members(client, chat.id, c["brand_id"], group_chat_id)
        except Exception as exc:
            logger.warning("Scrape of %s failed: %s", group_chat_id, exc)
            members = []
        if members:
            ins, _dup = await asyncio.to_thread(GroupMemberStore().upsert_many, members)
            scraped += ins

        if pace:
            await asyncio.sleep(pace)

    return {
        "considered": len(pending),
        "joined": joined,
        "scraped": scraped,
        "rejected": rejected,
        "skipped": skipped,
    }


async def run_joiner(clients, *, stop_event: asyncio.Event | None = None) -> None:
    """Poll-join-scrape forever (until ``stop_event`` is set)."""
    while stop_event is None or not stop_event.is_set():
        try:
            result = await join_and_scrape_once(clients, pace=JOIN_PACE_SECONDS)
            if result["considered"]:
                logger.info("joiner pass: %s", result)
        except Exception as exc:  # never let the loop die
            logger.exception("joiner loop error: %s", exc)
        await asyncio.sleep(JOIN_POLL_INTERVAL)
