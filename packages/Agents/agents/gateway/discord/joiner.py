"""
agents/gateway/discord/joiner.py — join + scrape (Discord)
─────────────────────────────────────────────────────────────
Search discovers communities (``status=pending_join``); the Leader assigns each
to an account. This loop **joins** the server (via its invite) and **scrapes**
members into the outbound pool (Research reads those).

  pending_join + assigned account → accept_invite → set joined + groupChatId
                                  → scrape members → group_member rows

A Discord "community" is a guild; ``handle`` is the invite link/code and
``groupChatId`` is the guild id once joined. Unlike Telegram there's no
broadcast-channel / linked-discussion concept, so this is just join → scrape.

Joining is paced hard (self-bots that join servers fast get flagged → bans). A
hard join failure marks the community ``rejected``; a 429 just backs off and
leaves it pending.
"""

from __future__ import annotations

import asyncio
import logging

import discord

from agents.constants.gateway import (
    DISCORD_JOIN_BATCH,
    DISCORD_JOIN_PACE_SECONDS,
    DISCORD_SCRAPE_LIMIT,
    JOIN_POLL_INTERVAL,
)
from agents.gateway.discord import health
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
        try:
            result = await client.accept_invite(c["handle"])
        except discord.HTTPException as exc:
            if getattr(exc, "status", None) == 429:
                retry = float(getattr(exc, "retry_after", 0) or 10)
                logger.warning(
                    "Discord rate limited %ss joining %s — backing off.", retry, c["handle"]
                )
                await asyncio.sleep(retry)
                continue  # leave pending
            if health.is_account_dead(exc):
                await health.handle_dead_account(
                    clients, c["assigned_account_id"], str(exc)
                )
                skipped += 1
                continue
            logger.warning("Join %s failed: %s — marking rejected.", c["handle"], exc)
            await asyncio.to_thread(communities.mark_rejected, c["id"])
            rejected += 1
            continue
        except Exception as exc:
            if health.is_account_dead(exc):
                await health.handle_dead_account(
                    clients, c["assigned_account_id"], str(exc)
                )
                skipped += 1
                continue
            logger.warning("Join %s failed: %s — marking rejected.", c["handle"], exc)
            await asyncio.to_thread(communities.mark_rejected, c["id"])
            rejected += 1
            continue

        # accept_invite may return a Guild or an Invite (with .guild) depending on
        # the fork — handle both.
        guild = getattr(result, "guild", None) or result
        guild_id = str(guild.id)
        await asyncio.to_thread(communities.mark_joined, c["id"], guild_id)
        joined += 1

        # Prefer the connected guild object (its member cache / fetch works).
        live_guild = client.get_guild(int(guild_id)) or guild
        note = ""
        try:
            members = await _scrape_members(live_guild, c["brand_id"], guild_id)
        except Exception as exc:
            logger.warning("Scrape of guild %s failed: %s", guild_id, exc)
            members = []
            note = "member scrape failed"
        if members:
            ins, _dup = await asyncio.to_thread(GroupMemberStore().upsert_many, members)
            scraped += ins
            note = f"scraped {ins} members"
        elif not note:
            note = "no members scraped (roster hidden or empty)"
        logger.info("Joined guild %s (%s) — %s", c["handle"], guild_id, note)
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
