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

from pyrogram.enums import ChatType
from pyrogram.errors import ChatAdminRequired, FloodWait

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


async def _join_linked_discussion(client, chat):
    """Join a broadcast channel's linked discussion group (where comments land).

    A broadcast channel's subscriber list is admin-only, but its linked group is
    a normal supergroup we CAN read — so joining it lets us scrape its roster
    (if visible) and capture commenters via the listener. Returns the linked
    group's chat id, or ``None`` if there isn't one / we couldn't join.
    """
    linked = getattr(chat, "linked_chat", None)
    if linked is None:
        # join_chat may return a partial Chat; fetch full info for linked_chat.
        try:
            full = await client.get_chat(chat.id)
            linked = getattr(full, "linked_chat", None)
        except Exception as exc:
            logger.info("Could not resolve linked chat for %s: %s", chat.id, exc)
            return None
    if linked is None:
        return None
    try:
        joined = await client.join_chat(linked.username or linked.id)
        logger.info("Joined linked discussion group %s of channel %s.", joined.id, chat.id)
        return joined.id
    except Exception as exc:
        logger.info("Could not join linked discussion of %s: %s", chat.id, exc)
        return None


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

        # Broadcast channels never expose their subscriber list to non-admins
        # (channels.GetParticipants → CHAT_ADMIN_REQUIRED), so skip the scrape
        # outright. Supergroups usually have visible members, but some hide them
        # (also CHAT_ADMIN_REQUIRED) — that case is handled in the except below.
        if chat.type == ChatType.CHANNEL:
            # A broadcast channel's roster is admin-only. Reach its audience via
            # the linked discussion group instead: join it, scrape its roster if
            # visible, otherwise the listener captures whoever comments there.
            linked_id = await _join_linked_discussion(client, chat)
            if linked_id is None:
                note = "channel — members admin-only (monitor only)"
            else:
                try:
                    members = await _scrape_members(
                        client, linked_id, c["brand_id"], str(linked_id)
                    )
                except ChatAdminRequired:
                    members = []
                except Exception as exc:
                    logger.warning("Linked-group scrape of %s failed: %s", linked_id, exc)
                    members = []
                if members:
                    ins, _dup = await asyncio.to_thread(
                        GroupMemberStore().upsert_many, members
                    )
                    scraped += ins
                    note = f"channel — scraped {ins} from linked discussion group"
                else:
                    note = "channel — capturing members via linked discussion group"
            logger.info("Joined channel %s (%s) — %s", c["handle"], group_chat_id, note)
            await asyncio.to_thread(communities.set_note, c["id"], note)
        else:
            note = ""
            try:
                members = await _scrape_members(client, chat.id, c["brand_id"], group_chat_id)
            except ChatAdminRequired:
                logger.info(
                    "Members of %s (%s) are admin-only / hidden — skipping scrape.",
                    c["handle"],
                    group_chat_id,
                )
                members = []
                note = "members hidden (admin-only)"
            except Exception as exc:
                logger.warning("Scrape of %s failed: %s", group_chat_id, exc)
                members = []
                note = "member scrape failed"
            if members:
                ins, _dup = await asyncio.to_thread(GroupMemberStore().upsert_many, members)
                scraped += ins
                note = f"scraped {ins} members"
            if note:
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
    """Process communities the dashboard flagged for removal: leave the Telegram
    chat (if joined and the account is connected), then hard-delete the row.

    Members + conversations were already purged by the API on delete; this is
    the Telegram-side cleanup the API can't do (the gateway owns the clients).
    """
    communities = CommunityStore()
    pending = await asyncio.to_thread(communities.pending_leave)
    left = 0
    for c in pending:
        gid = c["group_chat_id"]
        entry = clients.get(c["assigned_account_id"]) if c["assigned_account_id"] else None
        if gid and entry is not None:
            try:
                await entry["client"].leave_chat(int(gid))
                logger.info("Left chat %s (%s).", gid, c["handle"])
            except Exception as exc:  # already left / not found / transient — drop anyway
                logger.info("Leave chat %s failed (removing anyway): %s", gid, exc)
        await asyncio.to_thread(communities.delete, c["id"])
        left += 1
    return left


async def run_joiner(clients, *, stop_event: asyncio.Event | None = None) -> None:
    """Poll-join-scrape (and process removals) forever (until ``stop_event``)."""
    while stop_event is None or not stop_event.is_set():
        try:
            result = await join_and_scrape_once(clients, pace=JOIN_PACE_SECONDS)
            if result["considered"]:
                logger.info("joiner pass: %s", result)
            removed = await leave_pending_once(clients)
            if removed:
                logger.info("leaver pass: removed %d community(ies).", removed)
        except Exception as exc:  # never let the loop die
            logger.exception("joiner loop error: %s", exc)
        await asyncio.sleep(JOIN_POLL_INTERVAL)
