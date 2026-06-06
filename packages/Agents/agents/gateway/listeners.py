"""
agents/gateway/listeners.py — Phase 2 & 3 (inbound)
──────────────────────────────────────────────────────
Per-account message handlers. The gateway receives messages; the agents judge.

  - Private DM from a KNOWN lead → Sales.decide_reply → maybe deliver a reply
  - Group message                → Talk.decide_reply  → maybe DM the sender (never
    a public group reply)

Both also record the inbound message as a ``conversation`` (the Research bus).
Agents (Sales/Talk) are sync, so they run via ``asyncio.to_thread``.
"""

from __future__ import annotations

import asyncio
import logging

from pyrogram import filters
from pyrogram.handlers import MessageHandler

from agents.agent_runners.sales import decide_reply as sales_decide
from agents.agent_runners.talk import decide_reply as talk_decide
from agents.lib import db
from agents.lib.store import ConversationStore, LeadStore, ProfileStore
from agents.schemas.sales import DmMessage, SalesContext
from agents.schemas.talk import GroupMessage, TalkContext

logger = logging.getLogger(__name__)

HISTORY_LIMIT = 8  # how many prior messages to give the agent for context


def attach_listeners(client, brand_id: str, account_id: str) -> None:
    """Register the DM + group handlers on a started client."""
    client.add_handler(
        MessageHandler(
            _make_handler(_handle_dm, brand_id, account_id),
            filters.private & filters.incoming & filters.text & ~filters.bot,
        )
    )
    client.add_handler(
        MessageHandler(
            _make_handler(_handle_group, brand_id, account_id),
            filters.group & filters.incoming & filters.text,
        )
    )


def _make_handler(fn, brand_id: str, account_id: str):
    async def handler(client, message):
        try:
            await fn(client, message, brand_id, account_id)
        except Exception as exc:  # a handler error must not crash the client
            logger.exception("%s error: %s", fn.__name__, exc)

    return handler


async def _history(client, chat_id, exclude_id) -> list:
    """Recent text messages in a chat, oldest first, excluding the current one."""
    msgs = []
    async for m in client.get_chat_history(chat_id, limit=HISTORY_LIMIT + 1):
        if m.id == exclude_id or not m.text:
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


# ─────────────────────────────────────────────────────────────────────────────
# Phase 2 — private DM → Sales (only for known leads)
# ─────────────────────────────────────────────────────────────────────────────


async def _handle_dm(client, message, brand_id: str, account_id: str) -> None:
    sender = message.from_user
    if not sender:
        return
    user_id = str(sender.id)
    lead = await asyncio.to_thread(LeadStore().get, brand_id, user_id)
    if lead is None:
        return  # Sales only engages known leads (Implentation.md §7.4)

    prior = await _history(client, message.chat.id, message.id)
    history = [DmMessage(from_lead=not m.outgoing, text=m.text) for m in prior]

    ctx = SalesContext(
        brand_id=brand_id,
        account_id=account_id,
        lead_user_id=user_id,
        username=sender.username or "",
        message_text=message.text,
        history=history,
        lead_status=lead.status,
    )
    reply = await asyncio.to_thread(sales_decide, ctx)

    await asyncio.to_thread(
        ConversationStore().add, brand_id, user_id, sender.username or "", "", message.text
    )
    if reply.sent and reply.decision.message:
        await client.send_message(message.chat.id, reply.decision.message)
        logger.info("Sales replied to lead %s", user_id)


# ─────────────────────────────────────────────────────────────────────────────
# Phase 3 — group message → Talk (reply is a private DM, never a group blast)
# ─────────────────────────────────────────────────────────────────────────────


async def _handle_group(client, message, brand_id: str, account_id: str) -> None:
    sender = message.from_user
    if not sender or not message.text:
        return

    niche = await asyncio.to_thread(_brand_niche, brand_id)
    profile = await asyncio.to_thread(ProfileStore().get, brand_id)
    prior = await _history(client, message.chat.id, message.id)
    recent = [
        GroupMessage(
            sender_username=(m.from_user.username if m.from_user else "") or "",
            text=m.text,
        )
        for m in prior
    ]

    ctx = TalkContext(
        brand_id=brand_id,
        account_id=account_id,
        group_chat_id=str(message.chat.id),
        message_text=message.text,
        sender_user_id=str(sender.id),
        sender_username=sender.username or "",
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
        sender.username or "",
        str(message.chat.id),
        message.text,
    )
    if decision.replied and decision.reply.message:
        # Private DM to the sender — NOT a public reply in the group.
        await client.send_message(sender.id, decision.reply.message)
        logger.info("Talk DM'd group member %s", sender.id)
