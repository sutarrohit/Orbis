"""
agents/gateway/discord/joiner.py — confirm + scrape (Discord)
─────────────────────────────────────────────────────────────
Search/operator add communities (``status=pending_join``); the Leader assigns
each to a bot account. A **bot can't join via an invite** — an admin invites it
through the bot's OAuth2 URL — so a Discord "community" is identified by its guild
(server) id. This loop confirms the bot is in that guild and **scrapes** its
members into the outbound pool (Research reads those).

  pending_join + assigned bot in the guild → set joined + groupChatId
                                           → scrape members → group_member rows

A Discord "community" is a guild; ``handle`` is the guild id and ``groupChatId``
is the same id once confirmed. There's no broadcast-channel / linked-discussion
concept, so this is just confirm-membership → scrape.

If the bot isn't in the guild yet (not invited), the community is left pending so
a later pass picks it up once the invite lands. A handle that isn't a valid guild
id is marked ``rejected``. Member scraping needs the Server Members intent.
"""

from __future__ import annotations

import asyncio
import logging

from agents.constants.gateway import (
    DISCORD_JOIN_BATCH,
    DISCORD_JOIN_PACE_SECONDS,
    DISCORD_SCRAPE_LIMIT,
    JOIN_POLL_INTERVAL,
)
from agents.lib.store import CommunityStore, GroupMemberStore
from agents.schemas.research import GroupMemberRecord

logger = logging.getLogger(__name__)


async def _scrape_members(guild, brand_id: str, group_chat_id: str) -> list:
    """Scrape up to DISCORD_SCRAPE_LIMIT real members with a username (skip bots).

    Primary path is the async ``guild.fetch_members`` iterator; falls back to the
    cached ``guild.members`` if the installed discord.py-self exposes a different
    shape. A real API error (e.g. missing access) propagates to the caller.
    """
    members: list[GroupMemberRecord] = []
    seen: set[str] = set()

    def _add(m) -> None:
        if m is None or getattr(m, "bot", False):
            return
        name = getattr(m, "name", "")
        if not name:
            return  # no username → Research can't reach them anyway
        uid = str(m.id)
        if uid in seen:
            return
        seen.add(uid)
        members.append(
            GroupMemberRecord(
                brand_id=brand_id,
                platform="discord",
                user_id=uid,
                username=name,
                group_chat_id=group_chat_id,
            )
        )

    try:
        async for m in guild.fetch_members(limit=DISCORD_SCRAPE_LIMIT):
            _add(m)
            if len(members) >= DISCORD_SCRAPE_LIMIT:
                break
    except (AttributeError, TypeError):
        # Fork without an async fetch_members iterator — use the member cache.
        for m in list(getattr(guild, "members", []))[:DISCORD_SCRAPE_LIMIT]:
            _add(m)
    return members


async def join_and_scrape_once(clients, *, pace: float = 0.0) -> dict:
    """One pass: join each assigned pending community and scrape its members."""
    communities = CommunityStore()
    pending = await asyncio.to_thread(
        communities.pending_join_assigned, DISCORD_JOIN_BATCH, platform="discord"
    )
    joined = scraped = rejected = skipped = 0
    for c in pending:
        entry = clients.get(c["assigned_account_id"])
        if entry is None:
            skipped += 1  # assigned account not connected; try again later
            continue
        client = entry["client"]

        # A bot can't join via invite — an admin invites it via the OAuth2 URL.
        # The community handle is the guild (server) id; "joining" is confirming
        # the bot is in that guild, then scraping it.
        try:
            guild_id = int(c["handle"])
        except (TypeError, ValueError):
            logger.warning(
                "Discord community handle %r is not a server id — marking rejected.",
                c["handle"],
            )
            await asyncio.to_thread(communities.mark_rejected, c["id"])
            rejected += 1
            continue

        guild = client.get_guild(guild_id)
        if guild is None:
            # The bot hasn't been invited to this server yet — wait for the invite.
            skipped += 1
            continue

        gid = str(guild_id)
        await asyncio.to_thread(communities.mark_joined, c["id"], gid)
        joined += 1

        note = ""
        try:
            members = await _scrape_members(guild, c["brand_id"], gid)
        except Exception as exc:
            logger.warning("Scrape of guild %s failed: %s", gid, exc)
            members = []
            note = "member scrape failed"
        if members:
            ins, _dup = await asyncio.to_thread(GroupMemberStore().upsert_many, members)
            scraped += ins
            note = f"scraped {ins} members"
        elif not note:
            note = "no members scraped (enable the Server Members intent)"
        logger.info("Joined guild %s — %s", gid, note)
        await asyncio.to_thread(communities.set_note, c["id"], note)

        if pace:
            await asyncio.sleep(pace)

    return {
        "considered": len(pending),
        "joined": joined,
        "scraped": scraped,
        "rejected": rejected,
        "skipped": skipped,
    }


async def leave_pending_once(clients) -> int:
    """Process communities the dashboard flagged for removal: leave the guild (if
    joined and the account is connected), then hard-delete the row.

    Members + conversations were already purged by the API on delete; this is the
    Discord-side cleanup the API can't do (the gateway owns the clients).
    """
    communities = CommunityStore()
    pending = await asyncio.to_thread(communities.pending_leave, platform="discord")
    left = 0
    for c in pending:
        gid = c["group_chat_id"]
        entry = clients.get(c["assigned_account_id"]) if c["assigned_account_id"] else None
        if gid and entry is not None:
            try:
                guild = entry["client"].get_guild(int(gid))
                if guild is not None:
                    await guild.leave()
                    logger.info("Left guild %s (%s).", gid, c["handle"])
            except Exception as exc:  # already left / not found / transient — drop anyway
                logger.info("Leave guild %s failed (removing anyway): %s", gid, exc)
        await asyncio.to_thread(communities.delete, c["id"])
        left += 1
    return left


async def run_joiner(clients, *, stop_event: asyncio.Event | None = None) -> None:
    """Poll-join-scrape (and process removals) forever (until ``stop_event``)."""
    while stop_event is None or not stop_event.is_set():
        try:
            result = await join_and_scrape_once(clients, pace=DISCORD_JOIN_PACE_SECONDS)
            if result["considered"]:
                logger.info("discord joiner pass: %s", result)
            removed = await leave_pending_once(clients)
            if removed:
                logger.info("discord leaver pass: removed %d community(ies).", removed)
        except Exception as exc:  # never let the loop die
            logger.exception("discord joiner loop error: %s", exc)
        await asyncio.sleep(JOIN_POLL_INTERVAL)
