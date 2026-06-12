"""
agents/gateway/discord/listeners.py — inbound (Discord)
──────────────────────────────────────────────────────────
The discord.py analogue of the Telegram listeners. The gateway receives
messages; the agents judge.

  - DM from a KNOWN lead        → Sales.decide_reply → maybe deliver a reply
  - Guild (server) message      → Talk.decide_reply  → maybe DM the sender (never
    a public channel reply)

Both record the inbound message as a ``conversation`` (the Research bus). Active
posters are captured into the outbound prospect pool (``group_member``) — this is
how Discord builds a reachable member pool without scraping a roster. Agents
(Sales/Talk) are sync, so they run via ``asyncio.to_thread``.
"""

from __future__ import annotations

import asyncio
import logging

import discord

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


class GatewayBot(discord.Client):
    """A discord.py client bound to one ``social_account`` (brand + account id).

    Dispatches inbound messages to the DM (Sales) / guild (Talk) handlers. A
    handler error is logged, never raised — it must not tear down the client.
    """

    def __init__(self, brand_id: str, account_id: str, **kwargs) -> None:
        super().__init__(**kwargs)
        self.brand_id = brand_id
        self.account_id = account_id

    async def on_ready(self) -> None:
        logger.info(
            "Discord client up: account=%s (@%s)", self.account_id, self.user
        )

    async def on_message(self, message: discord.Message) -> None:
        # Ignore our own messages (and anything before we know who we are).
        if self.user is None or message.author.id == self.user.id:
            return
        try:
            if message.guild is None:  # a DM channel
                await _handle_dm(self, message)
            else:
                await _handle_group(self, message)
        except Exception as exc:  # a handler error must not crash the client
            logger.exception("discord handler error: %s", exc)


async def _history(client: GatewayBot, channel, exclude_id) -> list:
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


async def _capture_member(brand_id: str, author, group_chat_id: str) -> None:
    """Add an active poster to the outbound prospect pool (``group_member``).

    Everyone who *posts* in a server the bot is in is a reachable, engaged
    member — the bot can DM them by id. Idempotent on ``(brand, user, group)``;
    bots are skipped.
    """
    if author is None or getattr(author, "bot", False) or not author.name:
        return
    await asyncio.to_thread(
        GroupMemberStore().upsert_many,
        [
            GroupMemberRecord(
                brand_id=brand_id,
                user_id=str(author.id),
                username=author.name,
                group_chat_id=group_chat_id,
            )
        ],
    )


# ─────────────────────────────────────────────────────────────────────────────
# Private DM → Sales (only for known leads)
# ─────────────────────────────────────────────────────────────────────────────


async def _handle_dm(client: GatewayBot, message: discord.Message) -> None:
    author = message.author
    if author.bot or not message.content:
        return
    user_id = str(author.id)
    lead = await asyncio.to_thread(LeadStore().get, client.brand_id, user_id)
    if lead is None:
        return  # Sales only engages known leads

    prior = await _history(client, message.channel, message.id)
    history = [
        DmMessage(from_lead=m.author.id != client.user.id, text=m.content)
        for m in prior
    ]

    ctx = SalesContext(
        brand_id=client.brand_id,
        account_id=client.account_id,
        lead_user_id=user_id,
        username=author.name or "",
        message_text=message.content,
        history=history,
        lead_status=lead.status,
    )
    reply = await asyncio.to_thread(sales_decide, ctx)

    await asyncio.to_thread(
        ConversationStore().add, client.brand_id, user_id, author.name or "", "", message.content
    )
    if reply.sent and reply.decision.message:
        await message.channel.send(reply.decision.message)
        logger.info("Sales replied to lead %s", user_id)


# ─────────────────────────────────────────────────────────────────────────────
# Guild message → Talk (reply is a private DM, never a public channel blast)
# ─────────────────────────────────────────────────────────────────────────────


async def _handle_group(client: GatewayBot, message: discord.Message) -> None:
    author = message.author
    if not message.content:
        return

    group_chat_id = str(message.channel.id)
    niche = await asyncio.to_thread(_brand_niche, client.brand_id)
    profile = await asyncio.to_thread(ProfileStore().get, client.brand_id)
    prior = await _history(client, message.channel, message.id)
    recent = [
        GroupMessage(sender_username=(m.author.name if m.author else "") or "", text=m.content)
        for m in prior
    ]

    ctx = TalkContext(
        brand_id=client.brand_id,
        account_id=client.account_id,
        group_chat_id=group_chat_id,
        message_text=message.content,
        sender_user_id=str(author.id),
        sender_username=author.name or "",
        sender_bio="",
        brand_niche=niche,
        persona=profile.persona if profile else "",
        recent_messages=recent,
    )
    decision = await asyncio.to_thread(talk_decide, ctx)

    await asyncio.to_thread(
        ConversationStore().add,
        client.brand_id,
        str(author.id),
        author.name or "",
        group_chat_id,
        message.content,
    )
    # Active poster → outbound prospect pool. Idempotent, so reposts are a no-op.
    await _capture_member(client.brand_id, author, group_chat_id)
    if decision.replied and decision.reply.message:
        # Private DM to the sender — NOT a public reply in the channel.
        try:
            await author.send(decision.reply.message)
            logger.info("Talk DM'd server member %s", author.id)
        except discord.Forbidden:
            logger.info("Could not DM %s (DMs closed / no shared server).", author.id)
