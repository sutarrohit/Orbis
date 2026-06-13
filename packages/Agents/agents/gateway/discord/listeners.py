"""
agents/gateway/discord/listeners.py — inbound (Discord)
─────────────────────────────────────────────────────────
Per-account ``on_message`` handler. The gateway receives messages; the agents
judge. Mirror of ``agents.gateway.listeners`` (Telegram), mapping discord.py
objects onto the same Sales/Talk contexts.

  - Private DM from a KNOWN lead → Sales.decide_reply → maybe reply in the DM
  - Guild message               → Talk.decide_reply  → maybe DM the sender (never
    a public channel blast)

Both also record the inbound message as a ``conversation`` (the Research bus) and,
for guild messages, add the active poster to the outbound prospect pool. The
Sales/Talk agents are sync, so they run via ``asyncio.to_thread``.

A Discord "community" is a guild, so ``group_chat_id`` is the **guild id** (the
same id the joiner stores), not the channel id.
"""

from __future__ import annotations

import asyncio
import logging

from agents.agent_runners.sales import decide_reply as sales_decide
from agents.agent_runners.talk import decide_reply as talk_decide
from agents.lib import db
from agents.lib.store import (ConversationStore, GroupMemberStore, LeadStore,
                              ProfileStore)
from agents.schemas.research import GroupMemberRecord
from agents.schemas.sales import DmMessage, SalesContext
from agents.schemas.talk import GroupMessage, TalkContext

logger = logging.getLogger(__name__)

HISTORY_LIMIT = 8  # how many prior messages to give the agent for context


def attach_listeners(client, brand_id: str, account_id: str) -> None:
    """Register the ``on_message`` handler on a (not-yet-started) client."""

    async def on_message(message) -> None:
        try:
            await _route(client, message, brand_id, account_id)
        except Exception as exc:  # a handler error must not crash the client
            logger.exception("discord on_message error: %s", exc)

    client.add_listener(on_message, "on_message")


async def _route(client, message, brand_id: str, account_id: str) -> None:
    author = message.author
    me = client.user
    # Ignore our own messages, bots, and empty/non-text payloads.
    if author is None or (me is not None and author.id == me.id):
        return
    if getattr(author, "bot", False) or not message.content:
        return
    if message.guild is None:
        await _handle_dm(client, message, brand_id, account_id)
    else:
        await _handle_group(client, message, brand_id, account_id)


async def _history(channel, exclude_id) -> list:
    """Recent text messages in a channel, oldest first, excluding the current one."""
    msgs = []
    async for m in channel.history(limit=HISTORY_LIMIT + 1):
        if m.id == exclude_id or not m.content:
            continue
        msgs.append(m)
    msgs.reverse()
    return msgs


def _brand_niche(brand_id: str) -> str:
    bid = db.resolve_brand_id(brand_id)
    with db.cursor() as cur:
        cur.execute('SELECT niche FROM brand WHERE id = %s', (bid,))
        row = cur.fetchone()
    return row[0] if row else ""


async def _capture_member(brand_id: str, sender, group_chat_id: str) -> None:
    """Add an active poster to the outbound prospect pool (``group_member``).

    Everyone who posts is a reachable, engaged member — this builds a pool even
    where the roster can't be scraped. Idempotent on ``(brand, user, group)``."""
    username = getattr(sender, "name", "")
    if not sender or getattr(sender, "bot", False) or not username:
        return
    await asyncio.to_thread(
        GroupMemberStore().upsert_many,
        [
            GroupMemberRecord(
                brand_id=brand_id,
                user_id=str(sender.id),
                username=username,
                group_chat_id=group_chat_id,
            )
        ],
    )


# ─────────────────────────────────────────────────────────────────────────────
# Private DM → Sales (only for known leads)
# ─────────────────────────────────────────────────────────────────────────────


async def _handle_dm(client, message, brand_id: str, account_id: str) -> None:
    sender = message.author
    user_id = str(sender.id)
    lead = await asyncio.to_thread(LeadStore().get, brand_id, user_id)
    if lead is None:
        return  # Sales only engages known leads

    me_id = client.user.id if client.user else None
    prior = await _history(message.channel, message.id)
    history = [
        DmMessage(from_lead=(m.author.id != me_id), text=m.content) for m in prior
    ]

    ctx = SalesContext(
        brand_id=brand_id,
        account_id=account_id,
        lead_user_id=user_id,
        username=getattr(sender, "name", "") or "",
        message_text=message.content,
        history=history,
        lead_status=lead.status,
    )
    reply = await asyncio.to_thread(sales_decide, ctx)

    await asyncio.to_thread(
        ConversationStore().add,
        brand_id,
        user_id,
        getattr(sender, "name", "") or "",
        "",
        message.content,
    )
    if reply.sent and reply.decision.message:
        await message.channel.send(reply.decision.message)
        logger.info("Sales replied to lead %s", user_id)


# ─────────────────────────────────────────────────────────────────────────────
# Guild message → Talk (reply is a private DM, never a public channel blast)
# ─────────────────────────────────────────────────────────────────────────────


async def _handle_group(client, message, brand_id: str, account_id: str) -> None:
    sender = message.author
    group_chat_id = str(message.guild.id)

    niche = await asyncio.to_thread(_brand_niche, brand_id)
    profile = await asyncio.to_thread(ProfileStore().get, brand_id)
    prior = await _history(message.channel, message.id)
    recent = [
        GroupMessage(
            sender_username=(getattr(m.author, "name", "") if m.author else "") or "",
            text=m.content,
        )
        for m in prior
    ]

    ctx = TalkContext(
        brand_id=brand_id,
        account_id=account_id,
        group_chat_id=group_chat_id,
        message_text=message.content,
        sender_user_id=str(sender.id),
        sender_username=getattr(sender, "name", "") or "",
        sender_bio="",
        brand_niche=niche,
        persona=profile.persona if profile else "",
        recent_messages=recent,
    )
    decision = await asyncio.to_thread(talk_decide, ctx)

    await asyncio.to_thread(
        ConversationStore().add,
        brand_id,
        str(sender.id),
        getattr(sender, "name", "") or "",
        group_chat_id,
        message.content,
    )
    # Active poster → outbound prospect pool. Idempotent, so reposts are a no-op.
    await _capture_member(brand_id, sender, group_chat_id)
    if decision.replied and decision.reply.message:
        # Private DM to the sender — NOT a public reply in the channel.
        await sender.send(decision.reply.message)
        logger.info("Talk DM'd guild member %s", sender.id)
